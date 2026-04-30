import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { BookOpen } from "lucide-react";

const SIDE_IMG =
  "https://images.pexels.com/photos/6549588/pexels-photo-6549588.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const DEMO_CREDS = [
  { role: "student", email: "student@thesisvault.io", password: "Student@12345" },
  { role: "supervisor", email: "supervisor@thesisvault.io", password: "Super@12345" },
  { role: "admin", email: "admin@thesisvault.io", password: "Admin@12345" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await login(email, password);
    setSubmitting(false);
    if (res.ok) {
      const next = location.state?.from || roleLanding(res.user.role);
      navigate(next, { replace: true });
    } else {
      setError(res.error || "Login failed");
    }
  };

  const fillDemo = (c) => {
    setEmail(c.email);
    setPassword(c.password);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div
        className="hidden lg:block relative"
        style={{
          backgroundImage: `linear-gradient(rgba(17,17,17,0.35),rgba(17,17,17,0.15)), url(${SIDE_IMG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "grayscale(0.4)",
        }}
        data-testid="login-side-image"
      >
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <BookOpen size={24} strokeWidth={1.5} />
          <p className="mt-3 font-serif text-3xl leading-tight max-w-md">
            “The quiet of the archive is a kind of thinking.”
          </p>
          <p className="mt-3 font-mono-plex text-xs uppercase tracking-widest opacity-80">
            — Notes from the Stacks
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 lg:p-16 paper-noise">
        <div className="w-full max-w-md fade-up">
          <Link to="/" className="font-mono-plex text-xs uppercase tracking-widest text-neutral-500 link-underline">
            ← Back to repository
          </Link>
          <h1 className="font-serif text-4xl sm:text-5xl mt-6 tracking-tight">Sign in.</h1>
          <p className="text-neutral-700 mt-2">
            Continue your thesis work, review submissions, or manage publications.
          </p>

          <form onSubmit={onSubmit} className="mt-10 space-y-5" data-testid="login-form">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                className="p-3 border border-red-300 bg-red-50 text-sm text-red-700 rounded-sm"
                data-testid="login-error"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full h-12"
              disabled={submitting}
              data-testid="login-submit-button"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-sm text-neutral-600">
            No account?{" "}
            <Link to="/register" className="link-underline" data-testid="login-to-register-link">
              Create one
            </Link>
          </p>

          <div className="mt-10 border-t pt-6" style={{ borderColor: "var(--border-soft)" }}>
            <p className="font-mono-plex text-[11px] uppercase tracking-widest text-neutral-500 mb-3">
              Demo accounts (one-click fill)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_CREDS.map((c) => (
                <button
                  key={c.role}
                  type="button"
                  onClick={() => fillDemo(c)}
                  className="btn btn-outline text-xs py-2"
                  data-testid={`demo-fill-${c.role}`}
                >
                  {c.role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function roleLanding(role) {
  if (role === "student") return "/student";
  if (role === "supervisor") return "/supervisor";
  if (role === "admin") return "/admin";
  return "/";
}
