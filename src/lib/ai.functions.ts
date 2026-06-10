import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AnalyzeInput = z.object({
  candidateId: z.string().uuid(),
  resumeText: z.string().min(20).max(60_000),
});

const SYSTEM_PROMPT = `You are an expert technical recruiter. You evaluate candidates against a job description with rigor, fairness, and concrete reasoning.
You always respond by calling the provided "submit_evaluation" tool with strict JSON. Never reply in prose.`;

export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load candidate + job (RLS scopes to this user's company)
    const { data: candidate, error: cErr } = await supabase
      .from("candidates")
      .select("id, job_id, name")
      .eq("id", data.candidateId)
      .single();
    if (cErr || !candidate) throw new Error("Candidate not found");

    const { data: job, error: jErr } = await supabase
      .from("jobs")
      .select("title, description, requirements, location, experience_level")
      .eq("id", candidate.job_id)
      .single();
    if (jErr || !job) throw new Error("Job not found");

    await supabase.from("candidates").update({ status: "analyzing" }).eq("id", candidate.id);

    const { callLovableAI } = await import("./ai-gateway.server");

    const userPrompt = `# Job
Title: ${job.title}
Location: ${job.location ?? "—"}
Experience level: ${job.experience_level ?? "—"}

## Description
${job.description ?? "—"}

## Requirements
${job.requirements ?? "—"}

# Candidate Resume (raw extracted text)
${data.resumeText.slice(0, 40_000)}

Evaluate the candidate against this role and submit your evaluation.`;

    const tool = {
      type: "function" as const,
      function: {
        name: "submit_evaluation",
        description: "Submit a structured candidate evaluation.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            candidate_name: { type: "string", description: "Best guess at the candidate's full name from the resume." },
            overall_score: { type: "number", description: "Overall fit score from 0.0 to 10.0, one decimal." },
            summary: { type: "string", description: "Two to three sentence executive summary." },
            recommendation: { type: "string", enum: ["Strong Hire", "Hire", "Maybe", "No Hire"] },
            strengths: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
            weaknesses: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
            breakdown: {
              type: "object",
              additionalProperties: false,
              properties: {
                communication: { type: "number" },
                experience: { type: "number" },
                technical_skills: { type: "number" },
                education: { type: "number" },
                languages: { type: "number" },
              },
              required: ["communication", "experience", "technical_skills", "education", "languages"],
            },
          },
          required: ["candidate_name", "overall_score", "summary", "recommendation", "strengths", "weaknesses", "breakdown"],
        },
      },
    };

    const result = await callLovableAI({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "submit_evaluation" } },
    });

    const call = result?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      await supabase.from("candidates").update({ status: "failed" }).eq("id", candidate.id);
      throw new Error("AI did not return a structured evaluation");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch {
      await supabase.from("candidates").update({ status: "failed" }).eq("id", candidate.id);
      throw new Error("AI returned malformed JSON");
    }

    const score = Math.max(0, Math.min(10, Number(parsed.overall_score) || 0));

    const { error: uErr } = await supabase
      .from("candidates")
      .update({
        status: "analyzed",
        ai_score: score,
        ai_summary: parsed.summary ?? null,
        ai_recommendation: parsed.recommendation ?? null,
        ai_strengths: parsed.strengths ?? [],
        ai_weaknesses: parsed.weaknesses ?? [],
        ai_breakdown: parsed.breakdown ?? {},
        name: parsed.candidate_name || candidate.name,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", candidate.id);

    if (uErr) throw new Error(uErr.message);
    return { ok: true, score };
  });
