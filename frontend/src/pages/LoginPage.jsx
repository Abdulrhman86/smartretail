import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function LoginPage({ initialMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, isAuthenticated, loading: authLoading } = useAuth();

  // Determine initial mode from prop, location path, or default to login
  const defaultMode =
    initialMode || (location.pathname.includes("signup") ? "signup" : "login");
  const [mode, setMode] = useState(defaultMode);
  useDocumentTitle(mode === "signup" ? "Create Account" : "Log In");

  // /login and /signup share this component, so follow route changes.
  useEffect(() => {
    setMode(initialMode || "login");
  }, [initialMode]);

  // Where to go after authenticating (set by ProtectedRoute or "sign in" links).
  const from = location.state?.from;
  const redirectTo = from ? `${from.pathname}${from.search || ""}${from.hash || ""}` : "/";
  const notice = location.state?.notice;

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const switchMode = (newMode) => {
    setMode(newMode);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email.trim(), password, rememberMe);
      } else {
        if (password.length < 8) {
          setErrorMessage("Password must be at least 8 characters long.");
          setLoading(false);
          return;
        }
        const { requiresEmailConfirmation } = await signup(email.trim(), password, fullName.trim() || undefined);
        if (requiresEmailConfirmation) {
          setSuccessMessage("Account created. Check your inbox to confirm your email address, then log in.");
          setMode("login");
          setPassword("");
          setLoading(false);
          return;
        }
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setErrorMessage(
        err.message || "Authentication failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  // Already signed in (e.g. visiting /login directly): skip the form.
  if (!authLoading && isAuthenticated && !loading) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-surface selection:bg-[#2c3e4a] selection:text-white font-body-md text-on-surface">
      {/* Minimal Focused Header */}
      <header className="w-full pt-8 pb-4 px-6 flex justify-between items-center max-w-5xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Return to Store</span>
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <svg className="w-3.5 h-3.5 text-surface-tint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="tracking-wider uppercase text-[11px]">Encrypted &amp; Secure</span>
        </div>
      </header>

      {/* Main Card Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[460px]">
          {/* Brand Logo & Header */}
          <div className="text-center mb-8">
            <Link
              to="/"
              className="inline-block font-cormorant text-4xl sm:text-[42px] tracking-tight font-medium text-primary hover:opacity-85 transition-opacity"
            >
              SmartRetail
            </Link>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant mt-2 font-medium">
              Curated Living &amp; Design
            </p>
          </div>

          {/* Auth Card */}
          <div className="bg-surface-container-lowest border border-outline-variant/60 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.03)] p-8 sm:p-10 rounded-sm">
            {/* Mode Tabs */}
            <div className="flex border-b border-surface-container-high mb-8 relative">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 pb-3 text-center text-sm font-medium tracking-wide transition-colors relative -mb-[2px] cursor-pointer ${
                  mode === "login"
                    ? "text-primary border-b-2 border-primary-container font-semibold"
                    : "text-on-surface-variant/60 hover:text-on-surface border-b-2 border-transparent"
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`flex-1 pb-3 text-center text-sm font-medium tracking-wide transition-colors relative -mb-[2px] cursor-pointer ${
                  mode === "signup"
                    ? "text-primary border-b-2 border-primary-container font-semibold"
                    : "text-on-surface-variant/60 hover:text-on-surface border-b-2 border-transparent"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Notice / Success Banners */}
            {(successMessage || (notice && !errorMessage)) && (
              <div className="mb-6 p-3.5 bg-surface-container-low border border-outline-variant/60 rounded-sm" role="status">
                <p className="text-xs font-medium text-primary leading-snug">{successMessage || notice}</p>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-6 p-3.5 bg-error-container/30 border border-error-container rounded-sm flex items-start gap-3">
                <svg className="w-4 h-4 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.75"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-medium text-error leading-snug">{errorMessage}</p>
                </div>
                <button
                  onClick={() => setErrorMessage("")}
                  className="text-error/60 hover:text-error transition-colors p-0.5 cursor-pointer"
                  title="Dismiss error"
                  type="button"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Login Form */}
            {mode === "login" && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Field */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-medium uppercase tracking-wider text-on-surface-variant"
                    >
                      Email Address <span className="text-primary">*</span>
                    </label>
                  </div>
                  <input
                    type="email"
                    id="login-email"
                    autoComplete="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-surface-container-lowest border border-outline-variant text-on-surface rounded-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all placeholder:text-on-surface-variant/40"
                    placeholder="name@example.com"
                    required
                  />
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium uppercase tracking-wider text-on-surface-variant"
                    >
                      Password <span className="text-primary">*</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="login-password"
                      autoComplete="current-password"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-surface-container-lowest border border-outline-variant text-on-surface rounded-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all placeholder:text-on-surface-variant/40 pr-10"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant/60 hover:text-on-surface cursor-pointer"
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me Checkbox */}
                <div className="flex items-center pt-1">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-primary-container focus:ring-primary-container border-outline-variant rounded-sm cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-xs text-on-surface-variant select-none">
                    Keep me signed in on this device
                  </label>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary-container hover:bg-primary text-on-primary font-medium text-sm py-3 px-4 rounded-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99] disabled:opacity-75"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span className="text-xs uppercase tracking-wider">Authenticating...</span>
                      </span>
                    ) : (
                      <span className="tracking-wide">Log In</span>
                    )}
                  </button>
                </div>

                {/* Switch to Signup Link */}
                <div className="text-center pt-4 border-t border-surface-container-high">
                  <p className="text-xs text-on-surface-variant">
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      className="font-medium text-primary hover:underline underline-offset-4 ml-1 cursor-pointer"
                    >
                      Sign up
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* Signup Form */}
            {mode === "signup" && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Full Name Field (Optional) */}
                <div>
                  <label
                    htmlFor="signup-name"
                    className="block text-xs font-medium uppercase tracking-wider text-on-surface-variant mb-1.5"
                  >
                    Full Name <span className="text-on-surface-variant/50 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="signup-name"
                    autoComplete="name"
                    name="fullname"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-surface-container-lowest border border-outline-variant text-on-surface rounded-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all placeholder:text-on-surface-variant/40"
                    placeholder="Your name"
                  />
                </div>

                {/* Email Field */}
                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-xs font-medium uppercase tracking-wider text-on-surface-variant mb-1.5"
                  >
                    Email Address <span className="text-primary">*</span>
                  </label>
                  <input
                    type="email"
                    id="signup-email"
                    autoComplete="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-surface-container-lowest border border-outline-variant text-on-surface rounded-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all placeholder:text-on-surface-variant/40"
                    placeholder="name@example.com"
                    required
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-xs font-medium uppercase tracking-wider text-on-surface-variant mb-1.5"
                  >
                    Create Password <span className="text-primary">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="signup-password"
                      autoComplete="new-password"
                      minLength={8}
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-surface-container-lowest border border-outline-variant text-on-surface rounded-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all placeholder:text-on-surface-variant/40 pr-10"
                      placeholder="Minimum 8 characters"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant/60 hover:text-on-surface cursor-pointer"
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-on-surface-variant/70 mt-1.5">
                    Must contain at least 8 characters.
                  </p>
                </div>

                {/* Terms disclaimer */}
                <div className="text-[11px] text-on-surface-variant/70 leading-relaxed pt-1">
                  By registering, you agree to SmartRetail's{" "}
                  <Link to="/help#terms" className="underline hover:text-on-surface">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link to="/help#privacy" className="underline hover:text-on-surface">
                    Privacy Policy
                  </Link>
                  .
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary-container hover:bg-primary text-on-primary font-medium text-sm py-3 px-4 rounded-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99] disabled:opacity-75"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span className="text-xs uppercase tracking-wider">Creating Account...</span>
                      </span>
                    ) : (
                      <span className="tracking-wide">Create Account</span>
                    )}
                  </button>
                </div>

                {/* Switch to Login Link */}
                <div className="text-center pt-4 border-t border-surface-container-high">
                  <p className="text-xs text-on-surface-variant">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="font-medium text-primary hover:underline underline-offset-4 ml-1 cursor-pointer"
                    >
                      Log in
                    </button>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full py-6 text-center text-xs text-on-surface-variant">
        <p>© {new Date().getFullYear()} SmartRetail. All rights reserved.</p>
      </footer>
    </div>
  );
}
