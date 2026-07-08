import { motion } from "framer-motion";
import { KeyRound, Loader2, Mail, Stethoscope } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../components/AuthProvider";

type LoginMode = "magic-link" | "password";

export default function Login() {
  const { signInWithOtp, signInWithPassword } = useAuth();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError(null);
    setSent(false);
    setPassword("");
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signInWithOtp(email.trim());
    setLoading(false);

    if (signInError) {
      setError(signInError);
      return;
    }

    setSent(true);
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signInWithPassword(
      email.trim(),
      password,
    );
    setLoading(false);

    if (signInError) {
      setError(signInError);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Tabibu Admin</h1>
            <p className="text-sm text-slate-500">Sign in with your work email</p>
          </div>
        </div>

        <div className="flex rounded-lg border border-slate-200 p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode("password")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "password"
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => switchMode("magic-link")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "magic-link"
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Magic link
          </button>
        </div>

        {mode === "magic-link" && sent ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-4 text-sm text-brand-800">
            <p className="font-medium">Check your inbox</p>
            <p className="mt-1 text-brand-700">
              We sent a magic link to <strong>{email}</strong>. Click the link to
              sign in.
            </p>
          </div>
        ) : (
          <form
            onSubmit={mode === "password" ? handlePassword : handleMagicLink}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@tabibu.health"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            {mode === "password" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !email.trim() ||
                (mode === "password" && !password)
              }
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "password" ? "Signing in…" : "Sending link…"}
                </>
              ) : mode === "password" ? (
                "Sign in"
              ) : (
                "Send magic link"
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
