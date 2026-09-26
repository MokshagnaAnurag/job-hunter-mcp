// ═══════════════════════════════════════════════════════════════════
// Resume Storage — Secure file handling
// ═══════════════════════════════════════════════════════════════════
// Storage structure:
// /users/<userId>/resume/master/
// /users/<userId>/resume/tailored/
// /users/<userId>/coverletters/
// /users/<userId>/applications/

import { getSupabaseClient } from "../db/client.js";
import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

const LOCAL_STORAGE_DIR = process.env.STORAGE_DIR ||
  path.join(process.cwd(), "data", "storage");

/**
 * Stores a master resume file.
 * The master resume is NEVER overwritten by tailoring.
 */
export async function storeMasterResume(
  userId: string,
  filename: string,
  content: Buffer | string,
  format: string,
): Promise<{ storagePath: string; resumeId: string }> {
  const supabase = getSupabaseClient();
  const resumeId = uuidv4();

  // Store locally
  const userDir = path.join(LOCAL_STORAGE_DIR, userId, "resume", "master");
  await fs.mkdir(userDir, { recursive: true });

  const ext = path.extname(filename) || `.${format.toLowerCase()}`;
  const storedFilename = `master_resume${ext}`;
  const filePath = path.join(userDir, storedFilename);

  await fs.writeFile(filePath, content);

  // Also try Supabase storage
  const storagePath = `${userId}/resume/master/${storedFilename}`;
  try {
    const contentBuffer = typeof content === "string" ? Buffer.from(content) : content;
    await supabase.storage
      .from("resumes")
      .upload(storagePath, contentBuffer, {
        upsert: true,
        contentType: getContentType(format),
      });
  } catch (err) {
    console.error("Supabase storage upload failed (using local):", err);
  }

  // Create resume version record
  await supabase.from("resume_versions").insert({
    id: resumeId,
    user_id: userId,
    is_master: true,
    filename: storedFilename,
    original_format: format,
    storage_path: storagePath,
  });

  return { storagePath, resumeId };
}

/**
 * Stores a tailored resume version.
 */
export async function storeTailoredResume(
  userId: string,
  jobId: string,
  company: string,
  role: string,
  latexContent: string,
  pdfContent?: Buffer,
  changes?: unknown[],
  keywords?: string[],
  sourceResumeId?: string,
): Promise<{
  resumeId: string;
  latexPath: string;
  pdfPath?: string;
  filename: string;
}> {
  const supabase = getSupabaseClient();
  const resumeId = uuidv4();
  const date = new Date().toISOString().split("T")[0];

  const sanitizedCompany = company.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const sanitizedRole = role.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const baseFilename = `resume_${sanitizedCompany}_${sanitizedRole}_${date}`;

  const userDir = path.join(LOCAL_STORAGE_DIR, userId, "resume", "tailored");
  await fs.mkdir(userDir, { recursive: true });

  // Save LaTeX
  const texFilename = `${baseFilename}.tex`;
  const texPath = path.join(userDir, texFilename);
  await fs.writeFile(texPath, latexContent, "utf-8");

  // Save PDF if available
  let pdfPath: string | undefined;
  if (pdfContent) {
    const pdfFilename = `${baseFilename}.pdf`;
    pdfPath = path.join(userDir, pdfFilename);
    await fs.writeFile(pdfPath, pdfContent);
  }

  const storagePath = `${userId}/resume/tailored/${texFilename}`;

  // Try Supabase storage
  try {
    await supabase.storage
      .from("resumes")
      .upload(storagePath, Buffer.from(latexContent), {
        upsert: true,
        contentType: "application/x-latex",
      });
  } catch (err) {
    console.error("Supabase storage upload failed (using local):", err);
  }

  // Create resume version record
  await supabase.from("resume_versions").insert({
    id: resumeId,
    user_id: userId,
    job_id: jobId,
    is_master: false,
    filename: texFilename,
    original_format: "latex",
    storage_path: storagePath,
    latex_source: latexContent,
    latex_source_path: texPath,
    pdf_path: pdfPath || null,
    changes_made: changes || [],
    keywords_targeted: keywords || [],
    source_resume_id: sourceResumeId || null,
  });

  return {
    resumeId,
    latexPath: texPath,
    pdfPath,
    filename: texFilename,
  };
}

/**
 * Retrieves a resume file.
 */
export async function getResume(
  userId: string,
  resumeId: string,
): Promise<{ content: Buffer | null; filename: string; format: string } | null> {
  const supabase = getSupabaseClient();

  const { data: record } = await supabase
    .from("resume_versions")
    .select("*")
    .eq("id", resumeId)
    .eq("user_id", userId)
    .single();

  if (!record) return null;

  // Try local first
  try {
    const localDir = record.is_master
      ? path.join(LOCAL_STORAGE_DIR, userId, "resume", "master")
      : path.join(LOCAL_STORAGE_DIR, userId, "resume", "tailored");

    const localPath = path.join(localDir, record.filename);
    const content = await fs.readFile(localPath);
    return {
      content,
      filename: record.filename,
      format: record.original_format,
    };
  } catch {
    // Try Supabase storage
    try {
      const { data } = await supabase.storage
        .from("resumes")
        .download(record.storage_path);

      if (data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        return {
          content: buffer,
          filename: record.filename,
          format: record.original_format,
        };
      }
    } catch {
      // Both failed
    }
  }

  return null;
}

/**
 * Lists all resume versions for a user.
 */
export async function listResumeVersions(
  userId: string,
  jobId?: string,
): Promise<Array<{
  id: string;
  filename: string;
  isMaster: boolean;
  jobId?: string;
  generatedAt: string;
  keywords: string[];
}>> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("resume_versions")
    .select("id, filename, is_master, job_id, generated_at, keywords_targeted")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false });

  if (jobId) {
    query = query.eq("job_id", jobId);
  }

  const { data } = await query;

  return (data || []).map((r) => ({
    id: r.id,
    filename: r.filename,
    isMaster: r.is_master,
    jobId: r.job_id,
    generatedAt: r.generated_at,
    keywords: r.keywords_targeted || [],
  }));
}

// ─── Helpers ────────────────────────────────────────────────────

function getContentType(format: string): string {
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    tex: "application/x-latex",
    latex: "application/x-latex",
  };
  return types[format.toLowerCase()] || "application/octet-stream";
}
