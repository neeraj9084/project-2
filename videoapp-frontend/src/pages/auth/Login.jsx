
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
    "w-full rounded-xl border border-white/[0.08] bg-[#05070a] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-[#7567ff]/60 focus:ring-1 focus:ring-[#7567ff]/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="min-h-screen bg-[#040608] px-4 py-8 font-sans text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-2xl border border-white/[0.08] bg-[#070a0e] p-6 shadow-2xl sm:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#7567ff]/15">
              <span className="text-xl font-bold text-[#7567ff]">
                V
              </span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back
            </h1>

            <p className="mt-2 text-sm text-white/50">
              Sign in to continue to VideoApp
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block text-sm font-medium text-white/80"
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
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-white/80"
                >
                  Password
                </label>

                <Link
                  to="/forgot-password"
                  className="text-xs text-[#8b7fff] transition hover:text-[#a39aff]"
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

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-[#7567ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b5df0] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="mt-7 text-center text-sm text-white/50">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="font-medium text-[#8b7fff] transition hover:text-[#a39aff]"
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
