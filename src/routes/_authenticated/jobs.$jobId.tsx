import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn as useStartServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState } from "react";
import { ArrowLeft, Upload, FileText, Sparkles, Loader2, X, Trophy, Medal, Award, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { extractResumeText } from "@/lib/resume-parser";
import { analyzeResume } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({ meta: [{ title: "Job — BGD Recruit AI" }] }),
  component: JobPage,
});

type Candidate = {
  id: string; name: string; file_name: string; file_path: string; status: string;
  ai_score: number | null; ai_summary: string | null; ai_recommendation: string | null;
  ai_strengths: string[] | null; ai_weaknesses: string[] | null;
  ai_breakdown: Record<string, number> | null;
  created_at: string;
};

function JobPage() {
  const { jobId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const analyzeFn = useStartServerFn(analyzeResume);

  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["candidates", jobId],
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase
        .from("candidates").select("*")
        .eq("job_id", jobId)
        .order("ai_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
      if (!profile) throw new Error("Profile not found");
      for (const file of files) {
        const path = `${profile.company_id}/${jobId}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("resumes").upload(path, file);
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("candidates").insert({
          job_id: jobId, company_id: profile.company_id, uploaded_by: user.id,
          name: file.name.replace(/\.[^.]+$/, ""), file_name: file.name, file_path: path, status: "pending",
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates", jobId] });
      toast.success("Resumes uploaded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function onFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list).filter(f => /\.(pdf|docx|txt)$/i.test(f.name));
    if (files.length === 0) return toast.error("Use PDF, DOCX or TXT files.");
    upload.mutate(files);
  }

  async function runAnalysis() {
    if (!candidates || candidates.length === 0) return;
    const pending = candidates.filter(c => c.status !== "analyzed");
    if (pending.length === 0) return toast.info("All resumes already analyzed.");
    setAnalyzing(true); setProgress(0);
    let done = 0;
    for (const c of pending) {
      try {
        const { data: blob, error } = await supabase.storage.from("resumes").download(c.file_path);
        if (error || !blob) throw error ?? new Error("download failed");
        const file = new File([blob], c.file_name);
        const text = await extractResumeText(file);
        if (!text || text.length < 20) throw new Error("Could not extract text");
        await analyzeFn({ data: { candidateId: c.id, resumeText: text } });
      } catch (e: any) {
        toast.error(`${c.name}: ${e.message ?? "analysis failed"}`);
      }
      done++;
      setProgress(Math.round((done / pending.length) * 100));
    }
    await queryClient.invalidateQueries({ queryKey: ["candidates", jobId] });
    setAnalyzing(false);
    toast.success("AI ranking ready");
  }

  const total = candidates?.length ?? 0;
  const analyzed = candidates?.filter(c => c.status === "analyzed").length ?? 0;
  const ranked = candidates?.filter(c => c.ai_score != null) ?? [];

  return (
    <div className="space-y-10">
      <div>
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <div className="mt-3 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">{job?.title ?? "Loading…"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {total} {total === 1 ? "resume" : "resumes"} · {analyzed} analyzed · {job?.location ?? "Remote"} · {job?.experience_level ?? "Any"}
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing || total === 0}
            className="inline-flex items-center gap-2 rounded-xl btn-primary-glow px-5 py-3 text-sm disabled:opacity-50">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analyze with AI
          </button>
        </div>
      </div>

      {analyzing && (
        <div className="glass-panel p-8">
          <div className="flex items-center gap-3 text-sm">
            <Sparkles className="h-4 w-4 text-emerald animate-pulse" />
            <span>AI is analyzing resumes…</span>
            <span className="ml-auto font-mono text-muted-foreground">{progress}%</span>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-[var(--gradient-primary)] transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Upload zone */}
      <section>
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Upload Resumes</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`mt-4 glass-panel p-12 text-center cursor-pointer transition border-dashed ${dragOver ? "border-emerald/60 bg-emerald/5" : ""}`}
          style={{ borderStyle: dragOver ? "dashed" : undefined }}
        >
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <div className="h-14 w-14 mx-auto rounded-2xl bg-[var(--gradient-primary)] grid place-items-center shadow-[var(--shadow-glow)]">
            <Upload className="h-6 w-6 text-[oklch(0.16_0.012_240)]" />
          </div>
          <h3 className="mt-5 text-lg font-semibold">Drop resumes here</h3>
          <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX, TXT · multiple files supported</p>
        </div>

        {candidates && candidates.length > 0 && (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {candidates.map(c => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-emerald shrink-0" />
                <span className="truncate flex-1">{c.file_name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ranking */}
      {ranked.length > 0 && (
        <section>
          <h2 className="text-3xl font-semibold tracking-tight">AI Ranking</h2>
          <p className="text-sm text-muted-foreground mt-1">Candidates sorted by overall fit.</p>
          <div className="mt-6 space-y-3">
            {ranked.map((c, i) => <CandidateRow key={c.id} c={c} rank={i} onSelect={() => setSelected(c)} />)}
          </div>
        </section>
      )}

      {selected && <CandidatePanel candidate={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CandidateRow({ c, rank, onSelect }: { c: Candidate; rank: number; onSelect: () => void }) {
  const medal = rank === 0 ? <Trophy className="h-5 w-5 text-yellow-300" />
    : rank === 1 ? <Medal className="h-5 w-5 text-slate-300" />
    : rank === 2 ? <Award className="h-5 w-5 text-amber-600" />
    : <span className="text-xs text-muted-foreground font-mono w-5 text-center">{rank + 1}</span>;
  return (
    <button onClick={onSelect} className="w-full text-left glass-panel p-5 flex items-center gap-5 hover:border-emerald/40 transition group">
      <div className="w-8 grid place-items-center">{medal}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold truncate">{c.name}</h3>
          <span className="text-xs text-muted-foreground">{c.ai_recommendation}</span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{c.ai_summary}</p>
      </div>
      <div className="text-right">
        <div className="text-3xl font-semibold gradient-text leading-none">{c.ai_score?.toFixed(1)}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Score</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald group-hover:translate-x-0.5 transition" />
    </button>
  );
}

function CandidatePanel({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const bd = candidate.ai_breakdown ?? {};
  const dims: [string, string][] = [
    ["Communication", "communication"], ["Experience", "experience"],
    ["Technical Skills", "technical_skills"], ["Education", "education"], ["Languages", "languages"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-lg bg-card border-l border-border overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card/90 backdrop-blur-xl border-b border-border p-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">{candidate.name}</h3>
            <p className="text-sm text-muted-foreground">{candidate.ai_recommendation}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-8">
          <div className="text-center">
            <div className="text-6xl font-semibold gradient-text">{candidate.ai_score?.toFixed(1)}</div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mt-2">Overall Score</div>
          </div>

          <div className="space-y-3">
            {dims.map(([label, key]) => {
              const v = Number((bd as any)[key] ?? 0);
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1.5"><span className="text-muted-foreground">{label}</span><span className="font-mono">{v.toFixed(1)}</span></div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-[var(--gradient-primary)]" style={{ width: `${Math.min(100, v * 10)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <Section title="AI Summary"><p className="text-sm leading-relaxed text-muted-foreground">{candidate.ai_summary}</p></Section>
          {candidate.ai_strengths && candidate.ai_strengths.length > 0 && (
            <Section title="Strengths"><Bullets items={candidate.ai_strengths} tone="emerald" /></Section>
          )}
          {candidate.ai_weaknesses && candidate.ai_weaknesses.length > 0 && (
            <Section title="Weaknesses"><Bullets items={candidate.ai_weaknesses} tone="muted" /></Section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}
function Bullets({ items, tone }: { items: string[]; tone: "emerald" | "muted" }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className={tone === "emerald" ? "text-emerald" : "text-muted-foreground"}>•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
