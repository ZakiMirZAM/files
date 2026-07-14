import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

type Flow = "signIn" | "signUp";

interface SignInFormProps {
  onBack?: () => void;
}

export function SignInForm({ onBack }: SignInFormProps) {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<Flow>("signIn");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    void signIn("password", formData).catch((error: Error) => {
      // Convex masks auth failures as a generic "Server Error" in production
      // (it hides internal error detail), so we can't distinguish wrong-password
      // from no-such-account here, give one clear message covering both.
      const message = error.message.includes("Invalid password")
        ? "Invalid password. Please try again."
        : flow === "signIn"
        ? "Invalid email or password, or no account yet. Try Create Account."
        : "Could not create account. The email may already be registered. Try Sign In.";
      toast.error(message);
      setSubmitting(false);
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {onBack && (
        <button
          onClick={onBack}
          className="btn-ghost mb-8 -ml-2 group"
          aria-label="Back to landing"
        >
          <span className="transition-transform group-hover:-translate-x-0.5">←</span>
          <span>Back</span>
        </button>
      )}

      <div className="mb-10 animate-fade-up">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-gold flex items-center justify-center rounded-sm">
            <span className="font-display text-ink-800 font-bold text-base">I</span>
          </div>
          <span className="font-display text-xl font-semibold text-white">
            Intrinsic<span className="text-gold">FinEd</span>
          </span>
        </div>
        <p className="eyebrow mb-3">
          {flow === "signIn" ? "Welcome Back" : "Create Account"}
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-white leading-tight">
          {flow === "signIn" ? (
            <>
              Pick up where you{" "}
              <span className="text-gold italic">left off</span>.
            </>
          ) : (
            <>
              Start analyzing with{" "}
              <span className="text-gold italic">conviction</span>.
            </>
          )}
        </h1>
        <p className="text-white/50 mt-3 text-sm leading-relaxed max-w-sm">
          {flow === "signIn"
            ? "Sign in to resume your in-progress analyses and final reports."
            : "Free, open source, and built around the same valuation framework professional analysts use."}
        </p>
      </div>

      <form className="space-y-3 animate-fade-up" style={{ animationDelay: "100ms" }} onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="label block mb-2">
            Email
          </label>
          <input
            id="email"
            className="field"
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="label block mb-2">
            Password
          </label>
          <input
            id="password"
            className="field"
            type="password"
            name="password"
            placeholder="••••••••"
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            required
          />
        </div>
        <button
          className="btn-gold w-full py-3 mt-5"
          type="submit"
          disabled={submitting}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-ink-800/30 border-t-ink-800 rounded-full animate-spin" />
              {flow === "signIn" ? "Signing in..." : "Creating account..."}
            </span>
          ) : (
            <>
              {flow === "signIn" ? "Sign in" : "Create account"}
              <span aria-hidden>→</span>
            </>
          )}
        </button>

        <div className="text-center text-sm text-white/45 pt-2">
          {flow === "signIn" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            className="text-gold hover:text-gold-soft font-medium underline-offset-4 hover:underline"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Sign up instead" : "Sign in instead"}
          </button>
        </div>
      </form>

      <div className="flex items-center my-7 animate-fade-up" style={{ animationDelay: "200ms" }}>
        <div className="flex-1 h-px bg-gold/15" />
        <span className="px-4 text-[0.7rem] uppercase tracking-[0.16em] text-white/30">
          or
        </span>
        <div className="flex-1 h-px bg-gold/15" />
      </div>

      <button
        className="btn-outline w-full py-3 animate-fade-up"
        style={{ animationDelay: "250ms" }}
        onClick={() => void signIn("anonymous")}
      >
        Continue anonymously
      </button>

      <p className="text-[0.7rem] text-white/30 text-center mt-8 leading-relaxed">
        By continuing you agree this isn't financial advice. It's an educational tool.
      </p>
    </div>
  );
}
