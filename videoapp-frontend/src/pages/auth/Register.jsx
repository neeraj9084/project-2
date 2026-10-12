import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  startRegistration,
  verifyRegistrationOtp,
  resendVerificationOtp,
  completeRegistration,
} from "../../services/auth/authApi";

function Register() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    otp: "",
    password: "",
    confirmPassword: "",
  });

  const [registrationToken, setRegistrationToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  const handleStartRegistration = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    const fullName = formData.fullName.trim();
    const username = formData.username.trim().toLowerCase();
    const email = formData.email.trim().toLowerCase();

    if (!fullName) {
      setError("Full name is required");
      return;
    }

    if (!username) {
      setError("Username is required");
      return;
    }

    if (!email) {
      setError("Email is required");
      return;
    }

    const usernameRegex = /^(?=.*[0-9])[a-z0-9_@.]+$/;

    if (!usernameRegex.test(username)) {
      setError(
        "Username can only contain lowercase letters, numbers, _, @ and . and must contain at least one number"
      );
      return;
    }

    try {
      setLoading(true);

      await startRegistration({
        fullName,
        username,
        email,
      });

      setFormData((prev) => ({
        ...prev,
        fullName,
        username,
        email,
      }));

      setStep(2);
      setSuccess("Verification OTP has been sent to your email.");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to start registration."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    const email = formData.email.trim().toLowerCase();
    const otp = formData.otp.trim();

    if (!otp) {
      setError("OTP is required");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError("OTP must be 6 digits");
      return;
    }

    try {
      setLoading(true);

      const data = await verifyRegistrationOtp(email, otp);

      if (!data?.registrationToken) {
        throw new Error("Registration token was not received.");
      }

      setRegistrationToken(data.registrationToken);
      setStep(3);

      setSuccess(
        "Email verified successfully. Now create your password."
      );
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "OTP verification failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setSuccess("");

    const email = formData.email.trim().toLowerCase();

    if (!email) {
      setError("Email is required");
      return;
    }

    try {
      setResending(true);

      await resendVerificationOtp(email);

      setFormData((prev) => ({
        ...prev,
        otp: "",
      }));

      setSuccess("A new verification OTP has been sent.");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to resend OTP."
      );
    } finally {
      setResending(false);
    }
  };

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    const password = formData.password;
    const confirmPassword = formData.confirmPassword;

    if (!password) {
      setError("Password is required");
      return;
    }

    if (!confirmPassword) {
      setError("Please confirm your password");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!registrationToken) {
      setError("Registration session expired. Please start again.");
      setStep(1);
      return;
    }

    try {
      setLoading(true);

      await completeRegistration({
        registrationToken,
        password,
        confirmPassword,
      });

      setSuccess(
        "Account created successfully. Redirecting to login..."
      );

      setRegistrationToken("");

      setFormData({
        fullName: "",
        username: "",
        email: "",
        otp: "",
        password: "",
        confirmPassword: "",
      });

      setTimeout(() => {
        navigate("/login", {
          replace: true,
        });
      }, 1200);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to create account."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError("");
    setSuccess("");

    if (step === 2) {
      setStep(1);

      setFormData((prev) => ({
        ...prev,
        otp: "",
      }));
    }

    if (step === 3) {
      setStep(2);

      setFormData((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }));
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#05070a] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-[#7567ff]/60 focus:ring-1 focus:ring-[#7567ff]/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="min-h-screen bg-[#040608] px-4 py-8 font-sans text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center">
        <div className="w-full rounded-2xl border border-white/[0.08] bg-[#070a0e] p-6 shadow-2xl sm:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#7567ff]/15">
              <span className="text-xl font-bold text-[#7567ff]">
                V
              </span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">
              Create your account
            </h1>

            <p className="mt-2 text-sm text-white/50">
              Join VideoApp and start sharing
            </p>
          </div>

          <div className="mb-7 flex items-center justify-center gap-2">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className={`h-1.5 rounded-full transition-all ${
                  step >= item
                    ? "w-10 bg-[#7567ff]"
                    : "w-6 bg-white/10"
                }`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {success}
            </div>
          )}

          {step === 1 && (
            <form
              onSubmit={handleStartRegistration}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Full name
                </label>

                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Username
                </label>

                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="e.g. neeraj@11"
                  disabled={loading}
                  className={inputClass}
                />

                <p className="mt-2 text-xs text-white/35">
                  Use letters, numbers, _, @ or .
                </p>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Email
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Enter your email"
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Sending OTP...
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          )}

          {step === 2 && (
            <form
              onSubmit={handleVerifyOtp}
              className="space-y-5"
            >
              <div className="text-center">
                <p className="text-sm text-white/50">
                  We sent a verification OTP to
                </p>

                <p className="mt-1 break-all text-sm font-medium text-white">
                  {formData.email}
                </p>
              </div>

              <div>
                <label
                  htmlFor="otp"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Verification OTP
                </label>

                <input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={formData.otp}
                  onChange={handleChange}
                  placeholder="Enter 6-digit OTP"
                  disabled={loading}
                  className={`${inputClass} text-center text-lg tracking-[0.35em]`}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Verifying...
                  </>
                ) : (
                  "Verify OTP"
                )}
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading || resending}
                  className="text-sm text-white/50 transition hover:text-white disabled:opacity-50"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || resending}
                  className="text-sm font-medium text-[#8b7fff] transition hover:text-[#a39aff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resending ? "Sending..." : "Resend OTP"}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form
              onSubmit={handleCompleteRegistration}
              className="space-y-5"
            >
              <div className="text-center">
                <p className="text-sm font-medium text-emerald-400">
                  Email verified
                </p>

                <p className="mt-1 text-xs text-white/40">
                  Create your password to finish registration.
                </p>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Password
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create a password"
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-medium text-white/80"
                >
                  Confirm password
                </label>

                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm your password"
                  disabled={loading}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </button>

              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="w-full text-sm text-white/50 transition hover:text-white disabled:opacity-50"
              >
                Back
              </button>
            </form>
          )}

          <div className="mt-7 text-center text-sm text-white/50">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-[#8b7fff] transition hover:text-[#a39aff]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;