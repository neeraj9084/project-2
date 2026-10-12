import api from "../../lib/axios";

// ======================================================
// LOGIN
// ======================================================

export const loginUser = async (loginData) => {
  const response = await api.post(
    "/auth/login",
    loginData
  );

  return response.data.data;
};


// ======================================================
// REGISTER - STEP 1
// Full Name + Username + Email
// ======================================================

export const startRegistration = async ({
  fullName,
  username,
  email,
}) => {
  const response = await api.post(
    "/users/register/start",
    {
      fullName: fullName.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
    }
  );

  return response.data.data;
};


// ======================================================
// REGISTER - STEP 2
// Verify OTP
// ======================================================

export const verifyRegistrationOtp = async (
  email,
  otp
) => {
  const response = await api.post(
    "/users/register/verify-otp",
    {
      email: email.trim().toLowerCase(),
      otp: otp.toString().trim(),
    }
  );

  return response.data.data;
};


// ======================================================
// REGISTER - RESEND OTP
// ======================================================

export const resendVerificationOtp = async (
  email
) => {
  const response = await api.post(
    "/users/register/resend-otp",
    {
      email: email.trim().toLowerCase(),
    }
  );

  return response.data.data;
};


// ======================================================
// REGISTER - STEP 3
// Password + Confirm Password
// ======================================================

export const completeRegistration = async ({
  registrationToken,
  password,
  confirmPassword,
}) => {
  const response = await api.post(
    "/users/register/complete",
    {
      registrationToken,
      password,
      confirmPassword,
    }
  );

  return response.data.data;
};


// ======================================================
// LOGOUT
// ======================================================

export const logoutUser = async () => {
  const response = await api.post(
    "/auth/logout"
  );

  return response.data.data;
};


// ======================================================
// REFRESH ACCESS TOKEN
// ======================================================

export const refreshAccessToken = async () => {
  const response = await api.post(
    "/auth/refresh-token"
  );

  return response.data.data;
};


// ======================================================
// FORGOT PASSWORD
// ======================================================

export const forgotPassword = async (email) => {
  const response = await api.post(
    "/auth/forgot-password",
    {
      email: email.trim().toLowerCase(),
    }
  );

  return response.data.data;
};


// ======================================================
// VERIFY FORGOT PASSWORD OTP
// ======================================================

export const verifyForgotPasswordOtp = async (
  email,
  otp
) => {
  const response = await api.post(
    "/auth/verify-forgot-password-otp",
    {
      email: email.trim().toLowerCase(),
      otp: otp.toString().trim(),
    }
  );

  return response.data.data;
};


// ======================================================
// RESET PASSWORD
// ======================================================

export const resetPassword = async ({
  resetToken,
  newPassword,
  confirmPassword,
}) => {
  const response = await api.post(
    "/auth/reset-password",
    {
      resetToken,
      newPassword,
      confirmPassword,
    }
  );

  return response.data.data;
};


// ======================================================
// CHANGE PASSWORD
// ======================================================

export const changePassword = async ({
  oldPassword,
  newPassword,
  confirmPassword,
}) => {
  const response = await api.post(
    "/auth/change-password",
    {
      oldPassword,
      newPassword,
      confirmPassword,
    }
  );

  return response.data.data;
};


// ======================================================
// CHANGE EMAIL
// ======================================================

export const changeEmail = async (newEmail) => {
  const response = await api.patch(
    "/auth/change-email",
    {
      changeEmail: newEmail.trim().toLowerCase(),
    }
  );

  return response.data.data;
};


// ======================================================
// VERIFY CHANGED EMAIL
// ======================================================

export const verifyChangedEmail = async (otp) => {
  const response = await api.post(
    "/auth/verify-changed-email",
    {
      otp: otp.toString().trim(),
    }
  );

  return response.data.data;
};


// ======================================================
// ACCOUNT RECOVERY
// ======================================================

export const accountRecovery = async (email) => {
  const response = await api.post(
    "/auth/account-recovery",
    {
      email: email.trim().toLowerCase(),
    }
  );

  return response.data.data;
};


// ======================================================
// VERIFY ACCOUNT RECOVERY
// ======================================================

export const verifyAccountRecovery = async (
  email,
  otp
) => {
  const response = await api.post(
    "/auth/verify-account-recovery",
    {
      email: email.trim().toLowerCase(),
      otp: otp.toString().trim(),
    }
  );

  return response.data.data;
};