import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileText, ArrowRight, Loader2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — BGD Recruit AI" }] }),
  component: Dashboard,
});

type Job = {
  id: string;
  title: string;
  location: string | null;
  experience_level: string | null;
  created_at: string;
  candidates: { count: number }[];
};

function Dashboard() {
  const { user } = Route.useRouteContext();
  const [open, setOpen] = useState(false);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: async (): Promise<Job[]> => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, location, experience_level, created_at, candidates(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back.</p>
        <div className="mt-1 flex items-end justify-between flex-wrap gap-4">
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight">My Jobs</h1>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl btn-primary-glow px-5 py-3 text-sm">
            <Plus className="h-4 w-4" /> Create New Job
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !jobs || jobs.length === 0 ? (
        <EmptyState onCreate={() => setOpen(true)} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {jobs.map((j) => {
            const count = j.candidates?.[0]?.count ?? 0;
            return (
              <Link key={j.id} to="/jobs/$jobId" params={{ jobId: j.id }}
                className="group glass-panel p-6 hover:border-emerald/40 transition relative overflow-hidden">
                <div className="absolute inset-0 bg-[var(--gradient-card)] opacity-0 group-hover:opacity-100 transition" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <FileText className="h-5 w-5 text-emerald" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald group-hover:translate-x-0.5 transition" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">{j.title}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {j.location ?? "Remote"} · {j.experience_level ?? "Any level"}
                  </div>
                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold gradient-text">{count}</span>
                    <span className="text-xs text-muted-foreground">{count === 1 ? "resume" : "resumes"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {open && <CreateJobModal userId={user.id} onClose={() => setOpen(false)} />}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="glass-panel p-16 text-center">
      <div className="h-14 w-14 rounded-2xl bg-[var(--gradient-primary)] mx-auto grid place-items-center shadow-[var(--shadow-glow)]">
        <FileText className="h-6 w-6 text-[oklch(0.16_0.012_240)]" />
      </div>
      <h3 className="mt-5 text-xl font-semibold">No jobs yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">Create your first job, upload resumes, and let AI rank candidates.</p>
      <button onClick={onCreate} className="mt-6 inline-flex items-center gap-2 rounded-xl btn-primary-glow px-5 py-2.5 text-sm">
        <Plus className="h-4 w-4" /> Create your first job
      </button>
    </div>
  );
}

function CreateJobModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", description: "", requirements: "", location: "", experience_level: "Mid" });

  const create = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", userId).single();
      if (!profile) throw new Error("Profile not found");
      const { data, error } = await supabase
        .from("jobs")
        .insert({ ...form, company_id: profile.company_id, created_by: userId })
        .select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job created");
      navigate({ to: "/jobs/$jobId", params: { jobId: data.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">Create new job</h3>
            <p className="text-sm text-muted-foreground mt-1">Fill in the basics. You can edit later.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Input label="Job title" value={form.title} onChange={(v: string) => setForm({ ...form, title: v })} required />
          <Textarea label="Description" value={form.description} onChange={(v: string) => setForm({ ...form, description: v })} />
          <Textarea label="Requirements" value={form.requirements} onChange={(v: string) => setForm({ ...form, requirements: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Location" value={form.location} onChange={(v: string) => setForm({ ...form, location: v })} placeholder="Remote, NYC…" />
            <Select label="Experience level" value={form.experience_level} onChange={(v: string) => setForm({ ...form, experience_level: v })}
              options={["Intern", "Junior", "Mid", "Senior", "Lead", "Executive"]} />
          </div>
          <button type="submit" disabled={create.isPending} className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl btn-primary-glow px-5 py-2.5 text-sm disabled:opacity-60">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create Job
          </button>
        </form>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, ...rest }: any) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} {...rest}
        className="mt-1 w-full rounded-xl border border-input bg-white/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-emerald focus:ring-2 focus:ring-ring transition" />
    </label>
  );
}
function Textarea({ label, value, onChange }: any) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        className="mt-1 w-full rounded-xl border border-input bg-white/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-emerald focus:ring-2 focus:ring-ring transition resize-none" />
    </label>
  );
}
function Select({ label, value, onChange, options }: any) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-input bg-white/[0.03] px-3.5 py-2.5 text-sm outline-none focus:border-emerald focus:ring-2 focus:ring-ring transition">
        {options.map((o: string) => <option key={o} value={o} className="bg-card">{o}</option>)}
      </select>
    </label>
  );
}
