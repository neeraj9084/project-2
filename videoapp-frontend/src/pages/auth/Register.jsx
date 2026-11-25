
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

  // Step 1: Start registration
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

  // Step 2: Verify OTP
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
          err?.message ||
          "OTP verification failed."
      );
    } finally {
      setLoading(false);
    }
  };

  // Resend verification OTP
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

  // Step 3: Complete registration
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

  // Navigate between registration steps
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
    "register-input w-full rounded-xl border border-white/15 bg-[#05070a] px-4 py-3 text-sm outline-none transition focus:border-[#7567ff] focus:ring-2 focus:ring-[#7567ff]/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div
      id="videoapp-register"
      className="min-h-screen bg-[#040608] px-4 py-8 font-sans"
    >
      {/* Fix text visibility without changing the app's global CSS */}
      <style>{`
        #videoapp-register {
          color: #ffffff !important;
          color-scheme: dark;
        }

        #videoapp-register .register-heading {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }

        #videoapp-register .register-description,
        #videoapp-register .register-label,
        #videoapp-register .register-email {
          color: #e5e7eb !important;
          -webkit-text-fill-color: #e5e7eb !important;
        }

        #videoapp-register .register-muted {
          color: #cbd5e1 !important;
          -webkit-text-fill-color: #cbd5e1 !important;
        }

        #videoapp-register .register-helper {
          color: #9ca3af !important;
          -webkit-text-fill-color: #9ca3af !important;
        }

        #videoapp-register .register-input {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          caret-color: #ffffff;
        }

        #videoapp-register .register-input::placeholder {
          color: #9ca3af !important;
          -webkit-text-fill-color: #9ca3af !important;
          opacity: 1 !important;
        }

        #videoapp-register .register-primary-button,
        #videoapp-register .register-primary-button span {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }

        #videoapp-register .register-link {
          color: #a39aff !important;
          -webkit-text-fill-color: #a39aff !important;
        }

        #videoapp-register .register-link:hover {
          color: #c4baff !important;
          -webkit-text-fill-color: #c4baff !important;
        }

        #videoapp-register .register-error {
          color: #fca5a5 !important;
          -webkit-text-fill-color: #fca5a5 !important;
        }

        #videoapp-register .register-success {
          color: #6ee7b7 !important;
          -webkit-text-fill-color: #6ee7b7 !important;
        }

        #videoapp-register .register-back-button {
          color: #cbd5e1 !important;
          -webkit-text-fill-color: #cbd5e1 !important;
        }

        #videoapp-register .register-back-button:hover {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }
      `}</style>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center">
        <div className="w-full rounded-2xl border border-white/20 bg-[#070a0e] p-6 shadow-2xl sm:p-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#7567ff]/15">
              <span className="text-xl font-bold text-[#7567ff]">
                V
              </span>
            </div>

            <h1 className="register-heading text-2xl font-semibold tracking-tight">
              Create your account
            </h1>

            <p className="register-description mt-2 text-sm">
              Join VideoApp and start sharing
            </p>
          </div>

          {/* Progress indicator */}
          <div
            className="mb-7 flex items-center justify-center gap-2"
            aria-label={`Registration step ${step} of 3`}
          >
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className={`h-1.5 rounded-full transition-all ${
                  step >= item
                    ? "w-10 bg-[#7567ff]"
                    : "w-6 bg-white/15"
                }`}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="register-error mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm"
            >
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div
              role="status"
              className="register-success mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm"
            >
              {success}
            </div>
          )}

          {/* Step 1: Basic information */}
          {step === 1 && (
            <form
              onSubmit={handleStartRegistration}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="fullName"
                  className="register-label mb-2 block text-sm font-medium"
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
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="username"
                  className="register-label mb-2 block text-sm font-medium"
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
                  required
                  className={inputClass}
                />

                <p className="register-helper mt-2 text-xs">
                  Use letters, numbers, _, @ or .
                </p>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="register-label mb-2 block text-sm font-medium"
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
                  required
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="register-primary-button flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Sending OTP...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </button>
            </form>
          )}

          {/* Step 2: OTP verification */}
          {step === 2 && (
            <form
              onSubmit={handleVerifyOtp}
              className="space-y-5"
            >
              <div className="text-center">
                <p className="register-muted text-sm">
                  We sent a verification OTP to
                </p>

                <p className="register-email mt-1 break-all text-sm font-medium">
                  {formData.email}
                </p>
              </div>

              <div>
                <label
                  htmlFor="otp"
                  className="register-label mb-2 block text-sm font-medium"
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
                  required
                  className={`${inputClass} text-center text-lg tracking-[0.35em]`}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="register-primary-button flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify OTP</span>
                )}
              </button>

              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading || resending}
                  className="register-back-button text-sm transition disabled:opacity-50"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || resending}
                  className="register-link text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resending ? "Sending..." : "Resend OTP"}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Set password */}
          {step === 3 && (
            <form
              onSubmit={handleCompleteRegistration}
              className="space-y-5"
            >
              <div className="text-center">
                <p className="text-sm font-medium text-emerald-400">
                  Email verified
                </p>

                <p className="register-muted mt-1 text-xs">
                  Create your password to finish registration.
                </p>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="register-label mb-2 block text-sm font-medium"
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
                  required
                  minLength={8}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="register-label mb-2 block text-sm font-medium"
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
                  required
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="register-primary-button flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <span>Create account</span>
                )}
              </button>

              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="register-back-button w-full text-sm transition disabled:opacity-50"
              >
                Back
              </button>
            </form>
          )}

          {/* Login link */}
          <div className="register-muted mt-7 text-center text-sm">
            Already have an account?{" "}
            <Link
              to="/login"
              className="register-link font-semibold transition"
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
