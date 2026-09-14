import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { sendEmail } from "../utils/sendEmail.js";

//-----------------------login--------------------------//

const loginUser = asyncHandler(async(req, res) => {

   // login details

    const {  email, username, password } = req.body

    if((!email && !username) || !password){
        throw new ApiError(400, "Username aur email and password are required");
    }

 // find user

        let user
        
        if(username) {
            user = await User.findOne({
                username: username.toLowerCase()
            });
        } else {
            user = await User.findOne({
                email: email.toLowerCase()
            })
        }
       

    // checks user

    if(!user){
        throw new ApiError(401,"Invalid Credential")
    }

    // check password

    const isPasswordCorrect = await user.isPasswordCorrect(password);

    if(!isPasswordCorrect){
        throw new ApiError(401,"Invalid Credential")
    }

   // check account state 

 if (!user.isActive) {
    throw new ApiError(403, "Your account is deactivated");
}
      
   if (!user.isVerified) {
    throw new ApiError(403, "Please verify your email first");
   }

   // generate tokens 

   const accessToken = user.generateAccessToken();
   const refreshToken = user.generateRefreshToken();

   // save refresh Token

   user.refreshToken = refreshToken;

   await user.save({
    validateBeforeSave: false
   })

   // remove sensetive information 

   const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
   )

   // check user

    if(!loggedInUser){
        throw new ApiError(500, "Something went wrong while logging in")
    }
   
    // response 

    return res
    .status(200)
    .cookie("accessToken", accessToken,{
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
    })
    .cookie("refreshToken", refreshToken,{
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
    })
    .json(
        new ApiResponse(200,{user: loggedInUser,accessToken},
            "User logged in successfully"
        )
    ); 
});

//-------------------------logout-----------------------//

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
    );
    
    return res 
       .status(200)
       .clearCookie("accessToken",{
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
       })
        .clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production"
        })
        .json(
            new ApiResponse(200,{},"User logged out successfully")
        )
})

//--------------------- refresh token -----------------------//

const refreshAccessToken = asyncHandler(async(req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken;
     
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request")
    }
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken?._id)

        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
          
        if (!user.isActive) {
        throw new ApiError(403, "Account is deactivated");
       
       }


        if(incomingRefreshToken !== user.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used");   
        }
        const accessToken = user.generateAccessToken()

        return res
            .status(200)
            .cookie("accessToken", accessToken,{
                httpOnly: true,     
                secure: process.env.NODE_ENV === "production"
            })
            .json(
                new ApiResponse(
                    200,{ accessToken },
                    "Access token refreshed successfully"
                )
            );
    } catch (error) {
        throw new ApiError(
            401,
            error?.message || " Invalid refresh token "        
        )
    }
})

//--------------------- changeEmail -----------------------//

const  changeEmail = asyncHandler(async(req, res) => {
  const { changeEmail } = req.body;

  if(!changeEmail ) {
    throw new ApiError(400, "New email is required")
  }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(changeEmail)) {
        throw new ApiError(400, "Invalid email format");
    }

  const existedUser = await User.findOne({
    email: changeEmail.toLowerCase()
  });
if (existedUser && existedUser._id.toString() !== req.user._id.toString()) {
    throw new ApiError(409, "Email already exists");
}
   const otp = Math.floor(100000 + Math.random() * 900000).toString(); 

   const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

   const user = await User.findById(req.user._id);

   if(!user) {
     throw new ApiError(404, "User not found ")
   }
   
    user.changeEmail = changeEmail.toLowerCase();
    user.emailChangeOtp = otp;
    user.emailChangeOtpExpiry = otpExpiry;
  
    await user.save({validateBeforeSave: false})

    await sendEmail({
    to: changeEmail,
    subject: "Email Change Verification OTP",
    text: `Your email change verification OTP is ${otp}. This OTP will expire in 10 minutes.`
});

    console.log("Email Change OTP:", otp);
    console.log("OTP Expiry:", otpExpiry);

    return res.status(200).json(
        new ApiResponse(200, {}, "OTP sent to your new email. Please verify it to change your email")
    )

})

//--------------------verifyChangedEmail--------------------//

const  verifyChangedEmail = asyncHandler(async(req, res) => {
     console.log("VERIFY BODY:", req.body);
  const { otp } = req.body;
     console.log("OTP RECEIVED:", otp);
  if(!otp) {
    throw new ApiError(400, "OTP is required")
  }
  const user = await User.findById(req.user._id)

 if(!user) {
    throw new ApiError(404, "User not found");
 }

 if(!user.changeEmail) {
    throw new ApiError(400, "Email change request not found")
 }
 if(!user.emailChangeOtp) {
    throw new ApiError(400, "Email change OTP not found")
 }
 if(user.emailChangeOtpExpiry < new Date()) {
    throw new ApiError(400, "Email change OTP has expired")
 }
 if(user.emailChangeOtp !== otp) {
    throw new ApiError(400, "Invalid email change OTP")
 }

    user.email = user.changeEmail;
    user.changeEmail = undefined;
    user.emailChangeOtp = undefined;
    user.emailChangeOtpExpiry = undefined;
    user.isVerified = true;

    await user.save({
         validateBeforeSave: false
    });
   
    return res.status(200).json( 
        new ApiResponse(200, {}, "Email changed successfully")
    )
})

//---------------------- forgotPassword -----------------------//

const forgotPassword = asyncHandler(async (req, res) => {

    const { email } = req.body;

    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    const user = await User.findOne({
        email: email.toLowerCase()
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (!user.isVerified) {
        throw new ApiError(
            403,
            "Please verify your email first"
        );
    }

    const otp = Math.floor(
        100000 + Math.random() * 900000
    ).toString();

    const otpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    user.forgotPasswordOtp = otp;
    user.forgotPasswordOtpExpiry = otpExpiry;

    await user.save({
        validateBeforeSave: false
    });

    await sendEmail({
        to: user.email,
        subject: "Forgot Password OTP",
        text: `Your password reset OTP is ${otp}. This OTP will expire in 10 minutes.`
    });

    console.log("Forgot Password OTP:", otp);
    console.log("OTP Expiry:", otpExpiry);

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Password reset OTP sent to your email"
        )
    );
});

//------------------- verifyForgotPasswordOtp -----------------------//

const verifyForgotPasswordOtp = asyncHandler(async (req, res) => {

    const { email, otp } = req.body;

    if (!email || !otp) {
        throw new ApiError(
            400,
            "Email and OTP are required"
        );
    }

    const user = await User.findOne({
        email: email.toLowerCase()
    });

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    if (
        !user.forgotPasswordOtp ||
        !user.forgotPasswordOtpExpiry
    ) {
        throw new ApiError(
            400,
            "Password reset OTP not found"
        );
    }

    if (user.forgotPasswordOtpExpiry < new Date()) {
        throw new ApiError(
            400,
            "Password reset OTP has expired"
        );
    }

    if (user.forgotPasswordOtp !== otp) {
        throw new ApiError(
            400,
            "Invalid password reset OTP"
        );
    }

    const resetToken = jwt.sign(
        {
            _id: user._id,
            purpose: "password-reset"
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: "10m"
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            { resetToken },
            "Password reset OTP verified successfully"
        )
    );
});


//--------------------- resetPassword -----------------------//

const resetPassword = asyncHandler(async (req, res) => {

    const {
        resetToken,
        newPassword,
        confirmPassword
    } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
        throw new ApiError(
            400,
            "Reset token, new password and confirm password are required"
        );
    }

    if (newPassword !== confirmPassword) {
        throw new ApiError(
            400,
            "New password and confirm password do not match"
        );
    }

    try {

        const decodedToken = jwt.verify(
            resetToken,
            process.env.ACCESS_TOKEN_SECRET
        );

        if (decodedToken?.purpose !== "password-reset") {
            throw new ApiError(
                401,
                "Invalid password reset token"
            );
        }

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(
                404,
                "User not found"
            );
        }

        user.password = newPassword;

        // Old sessions invalidate
        user.refreshToken = undefined;

        // OTP cleanup
        user.forgotPasswordOtp = undefined;
        user.forgotPasswordOtpExpiry = undefined;

        await user.save();

        return res.status(200).json(
            new ApiResponse(
                200,
                {},
                "Password reset successfully"
            )
        );

    } catch (error) {

        throw new ApiError(
            401,
            error?.message || "Invalid or expired reset token"
        );
    }
});

//--------------------- changePassword -----------------------//

const changePassword = asyncHandler(async (req, res) => {

    const {
        oldPassword,
        newPassword,
        confirmPassword
    } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
        throw new ApiError(
            400,
            "Old password, new password and confirm password are required"
        );
    }

    if (newPassword !== confirmPassword) {
        throw new ApiError(
            400,
            "New password and confirm password do not match"
        );
    }

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    // Check old password
    const isPasswordCorrect =
        await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new ApiError(
            401,
            "Old password is incorrect"
        );
    }

    // Check new password is different
    const isSamePassword =
        await user.isPasswordCorrect(newPassword);

    if (isSamePassword) {
        throw new ApiError(
            400,
            "New password must be different from old password"
        );
    }

    // Set new password
    user.password = newPassword;

    // Logout other sessions
    user.refreshToken = undefined;

    await user.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Password changed successfully"
        )
    );
});

//-------------------- deactivateAccount -----------------------//

const deactivateAccount = asyncHandler(async(req, res) => {

    const user =  await User.findById(req.user._id);

    if(!user){
        throw new ApiError(404, "User not found")
    }

    user.isActive = false;

    user.refreshToken = undefined;

    await user.save({
        validateBeforeSave: false
    })

    return res
    .status(200)
    .clearCookie("accessToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
    })
    .clearCookie("refreshToken", {
         httpOnly: true,
         secure: process.env.NODE_ENV === "production"
    })
    .json(
        new ApiResponse(
            200,
            {},
            "Account decativated successfully"
        )
    )
})

//------------------ deleteAccount -----------------------//

const deleteAccount = asyncHandler(async (req, res) => {

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    await User.findByIdAndDelete(req.user._id);

    return res
        .status(200)
        .clearCookie("accessToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production"
        })
        .clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production"
        })
        .json(
            new ApiResponse(
                200,
                {},
                "Account deleted successfully"
            )
        );
});
//------------------ accountRecovery -----------------------//

const accountRecovery = asyncHandler(async (req, res) => {

    const { email } = req.body;

    if (!email) {
        throw new ApiError(
            400,
            "Email is required"
        );
    }

    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({
        email: normalizedEmail
    });

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    if (user.isActive) {
        throw new ApiError(
            400,
            "Account is already active"
        );
    }

    // Generate OTP
    const otp = Math.floor(
        100000 + Math.random() * 900000
    ).toString();

    const otpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
    );

    // Save OTP
    user.accountRecoveryOtp = otp;
    user.accountRecoveryOtpExpiry = otpExpiry;

    await user.save({
        validateBeforeSave: false
    });

    // Send OTP
    await sendEmail({
        to: normalizedEmail,
        subject: "Account Recovery OTP",
        text: `Your account recovery OTP is ${otp}. This OTP will expire in 10 minutes.`
    });

    console.log("Account Recovery OTP:", otp);

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Account recovery OTP sent successfully"
        )
    );
});

//------------------ verifyAccountRecovery -----------------------//

const verifyAccountRecovery = asyncHandler(async (req, res) => {

    const { email, otp } = req.body;

    if (!email || !otp) {
        throw new ApiError(
            400,
            "Email and OTP are required"
        );
    }

    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({
        email: normalizedEmail
    });

    if (!user) {
        throw new ApiError(
            404,
            "User not found"
        );
    }

    if (user.isActive) {
        throw new ApiError(
            400,
            "Account is already active"
        );
    }

    if (
        !user.accountRecoveryOtp ||
        !user.accountRecoveryOtpExpiry
    ) {
        throw new ApiError(
            400,
            "Account recovery OTP not found"
        );
    }

    // Check expiry
    if (user.accountRecoveryOtpExpiry < new Date()) {
        user.accountRecoveryOtp = undefined;
        user.accountRecoveryOtpExpiry = undefined;

        await user.save({
            validateBeforeSave: false
        });

        throw new ApiError(
            400,
            "Account recovery OTP has expired"
        );
    }

    // Check OTP
    if (user.accountRecoveryOtp !== otp) {
        throw new ApiError(
            400,
            "Invalid account recovery OTP"
        );
    }

    // Activate account
    user.isActive = true;

    // OTP cleanup
    user.accountRecoveryOtp = undefined;
    user.accountRecoveryOtpExpiry = undefined;

    // Old session remains invalid
    user.refreshToken = undefined;

    await user.save({
        validateBeforeSave: false
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Account recovered successfully. Please login again."
        )
    );
});

export {
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeEmail,
    verifyChangedEmail,
    forgotPassword,
    verifyForgotPasswordOtp,
    resetPassword,
    changePassword,
    deactivateAccount,
    deleteAccount,
     accountRecovery,
    verifyAccountRecovery
};