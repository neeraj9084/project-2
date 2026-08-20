import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"; 

const registeUser = asyncHandler(async (req, res) => {
   // get user details from frontend
   // validation -not empty
   // check if user already exist: username, email
   // check for images, check for avatar
   // upload them to cloudinary
   // upload them to cloudninary, avatar
   // create user object - create entry in db 
   // remove password and refresh token field from response 
   // xcheck for user creation 
   // return res 
     const {fullName, email, username, password} = req.body
           
           if(
            [fullName, email, username, password].some((field) =>
                 field?.trim() === "")
           ){
              throw new ApiError(400, "All field are required")                      
           
     }
        const existedUser = await User.findOne({
            $or: [{ username },{ email }]
        })

        if(existedUser) {
            throw new ApiError(409, "User with  email or username already exist")
        }

        const avatarLocalPath = req.files?.avatar[0]?.path;
        const coverImageLocalPath = req.files?.coverImage[0]?.path;

        if(!avatarLocalPath){
            throw new ApiError(400, "Avatar file is required")
        }
             
       const avatar = await uploadOnCloudinary(avatarLocalPath)
       const coverImage = await uploadOnCloudinary(coverImageLocalPath)

       if(!avatar){
        throw new ApiError(400, "Avatar file is required")
       }
      const user =  await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
       }) 

      const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
      )    
      
      if(!createdUser) {
        throw new ApiError(500, "Something went Wrong while registering the user")
      }
      return res.status(201).json (
        new ApiResponse(200, createdUser, "User registerd successfully")
      )

    })

export {
    registeUser,
}