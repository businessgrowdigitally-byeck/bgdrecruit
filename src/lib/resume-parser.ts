// Client-side resume text extraction. PDF via pdfjs-dist, DOCX via mammoth.
// Runs in the browser to keep heavy native deps off the server runtime.

export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdf(file);
  }
  if (name.endsWith(".docx") || file.type.includes("officedocument.wordprocessingml")) {
    return extractDocx(file);
  }
  // Plain text fallback
  return await file.text();
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // Use the legacy worker via a string URL to avoid bundler issues
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  const max = Math.min(doc.numPages, 20);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str).join(" "));
  }
  return pages.join("\n\n").trim();
}

async function extractDocx(file: File): Promise<string> {
  const mammoth: any = await import("mammoth/mammoth.browser");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return (result.value || "").trim();
}
