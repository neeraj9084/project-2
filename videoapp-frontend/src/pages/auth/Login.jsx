
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const { login, loading } = useAuth();

  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const identifier = formData.identifier.trim();
    const password = formData.password;

    if (!identifier) {
      setError("Email or username is required");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

    const loginData = {
      ...(isEmail
        ? { email: identifier.toLowerCase() }
        : { username: identifier.toLowerCase() }),
      password,
    };

    try {
      await login(loginData);

      const redirectPath =
        location.state?.from?.pathname || "/profile";

      navigate(redirectPath, {
        replace: true,
      });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Login failed. Please check your email/username and password."
      );
    }
  };

  const inputClass =
    "login-input w-full rounded-xl border border-white/15 bg-[#05070a] px-4 py-3 text-sm outline-none transition focus:border-[#7567ff] focus:ring-2 focus:ring-[#7567ff]/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div
      id="videoapp-login"
      className="min-h-screen bg-[#040608] px-4 py-8 font-sans"
    >
      {/* Scoped colour overrides: prevent global CSS from hiding text */}
      <style>{`
        #videoapp-login {
          color: #ffffff !important;
          color-scheme: dark;
        }

        #videoapp-login .login-heading {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }

        #videoapp-login .login-description,
        #videoapp-login .login-label {
          color: #e5e7eb !important;
          -webkit-text-fill-color: #e5e7eb !important;
        }

        #videoapp-login .login-input {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          caret-color: #ffffff;
        }

        #videoapp-login .login-input::placeholder {
          color: #9ca3af !important;
          -webkit-text-fill-color: #9ca3af !important;
          opacity: 1;
        }

        #videoapp-login .login-primary-button,
        #videoapp-login .login-primary-button span {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }

        #videoapp-login .login-footer {
          color: #d1d5db !important;
          -webkit-text-fill-color: #d1d5db !important;
        }

        #videoapp-login .login-link {
          color: #a39aff !important;
          -webkit-text-fill-color: #a39aff !important;
        }

        #videoapp-login .login-link:hover {
          color: #c4baff !important;
          -webkit-text-fill-color: #c4baff !important;
        }

        #videoapp-login .login-error {
          color: #fca5a5 !important;
          -webkit-text-fill-color: #fca5a5 !important;
        }
      `}</style>

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-2xl border border-white/15 bg-[#070a0e] p-6 shadow-2xl sm:p-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#7567ff]/15">
              <span className="text-xl font-bold text-[#7567ff]">
                V
              </span>
            </div>

            <h1 className="login-heading text-2xl font-semibold tracking-tight">
              Welcome back
            </h1>

            <p className="login-description mt-2 text-sm">
              Sign in to continue to VideoApp
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div
              role="alert"
              className="login-error mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm"
            >
              {error}
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="identifier"
                className="login-label mb-2 block text-sm font-medium"
              >
                Email or username
              </label>

              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                value={formData.identifier}
                onChange={handleChange}
                placeholder="Enter your email or username"
                disabled={loading}
                required
                className={inputClass}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="password"
                  className="login-label block text-sm font-medium"
                >
                  Password
                </label>

                <Link
                  to="/forgot-password"
                  className="login-link text-xs transition"
                >
                  Forgot password?
                </Link>
              </div>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                disabled={loading}
                required
                className={inputClass}
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="login-primary-button flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="login-footer mt-7 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              className="login-link font-semibold transition"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
