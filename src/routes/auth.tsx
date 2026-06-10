import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — BGD Recruit AI" },
      { name: "description", content: "Sign in to your BGD Recruit AI workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, company_name: companyName },
          },
        });
        if (error) throw error;
        toast.success("Welcome! Your workspace is ready.");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Google sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="hidden lg:flex relative overflow-hidden p-12 flex-col justify-between"
        style={{ background: "radial-gradient(ellipse 80% 60% at 20% 20%, oklch(0.30 0.10 168 / 50%), transparent 60%), radial-gradient(ellipse 60% 50% at 80% 80%, oklch(0.30 0.06 195 / 35%), transparent 60%)" }}>
        <Logo />
        <div className="space-y-6 max-w-md">
          <h1 className="text-5xl font-semibold tracking-tight leading-[1.05]">
            Hire faster<br />with <span className="gradient-text">AI ranking</span>.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Drop resumes in. Get a ranked shortlist out. BGD Recruit AI reads, scores, and prioritizes candidates for every role in seconds.
          </p>
          <div className="flex gap-6 text-xs uppercase tracking-[0.18em] text-muted-foreground pt-4">
            <span>Upload</span><span className="text-emerald">→</span>
            <span>Analyze</span><span className="text-emerald">→</span>
            <span>Rank</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© BGD Systems</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><Logo /></div>
          <div className="glass-panel p-8 sm:p-10">
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back." : "Create your workspace."}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin" ? "Sign in to your BGD Recruit AI account." : "Start screening resumes with AI in seconds."}
            </p>

            <button
              type="button" onClick={handleGoogle} disabled={loading}
              className="mt-6 w-full inline-flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <>
                  <Field label="Full name" value={fullName} onChange={setFullName} required />
                  <Field label="Company name" value={companyName} onChange={setCompanyName} required />
                </>
              )}
              <Field label="Email" type="email" value={email} onChange={setEmail} required />
              <Field label="Password" type="password" value={password} onChange={setPassword} required minLength={6} />

              {mode === "signin" && (
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-border bg-transparent" defaultChecked /> Keep me signed in
                  </label>
                  <button type="button" className="hover:text-foreground" onClick={() => toast.info("Password reset coming soon")}>Forgot password?</button>
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl btn-primary-glow px-4 py-2.5 text-sm mt-2 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create workspace"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-foreground font-medium hover:text-emerald">
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, minLength }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; minLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type} required={required} minLength={minLength}
        value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-input bg-white/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-emerald focus:ring-2 focus:ring-ring transition"
      />
    </label>
  );
}
