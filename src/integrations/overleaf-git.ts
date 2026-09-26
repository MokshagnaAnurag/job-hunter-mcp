// ═══════════════════════════════════════════════════════════════════
// Overleaf Git Integration
// ═══════════════════════════════════════════════════════════════════
// Uses Overleaf's official Git integration (premium feature).
// This is the ONLY officially supported method for programmatic
// Overleaf project access. There is no public compile API.
//
// Workflow:
// 1. Clone the user's Overleaf project via Git
// 2. Modify LaTeX source for tailored resume
// 3. Push changes back to Overleaf
// 4. User opens Overleaf to compile (or use local compilation)

import simpleGit, { SimpleGit } from "simple-git";
import { getSupabaseClient } from "../db/client.js";
import { logAuditEntry } from "../utils/audit-logger.js";
import * as fs from "fs/promises";
import * as path from "path";

const OVERLEAF_PROJECTS_DIR = process.env.OVERLEAF_PROJECTS_DIR ||
  path.join(process.cwd(), "data", "overleaf-projects");

/**
 * Clones or updates the user's Overleaf project via Git.
 */
export async function cloneOrPullOverleafProject(
  userId: string,
  gitUrl: string,
  gitToken?: string,
): Promise<{ localPath: string; success: boolean; error?: string }> {
  const projectDir = path.join(OVERLEAF_PROJECTS_DIR, userId);

  try {
    await fs.mkdir(projectDir, { recursive: true });

    // Construct authenticated URL if token provided
    let authUrl = gitUrl;
    if (gitToken) {
      const urlObj = new URL(gitUrl);
      urlObj.username = "git";
      urlObj.password = gitToken;
      authUrl = urlObj.toString();
    }

    const exists = await fs.access(path.join(projectDir, ".git"))
      .then(() => true)
      .catch(() => false);

    if (exists) {
      // Pull latest changes
      const git: SimpleGit = simpleGit(projectDir);
      await git.pull("origin", "main");

      await logAuditEntry(userId, "Overleaf project updated via Git pull");
    } else {
      // Clone fresh
      const git: SimpleGit = simpleGit();
      await git.clone(authUrl, projectDir);

      await logAuditEntry(userId, "Overleaf project cloned via Git");
    }

    // Save config to database
    const supabase = getSupabaseClient();
    await supabase
      .from("overleaf_configs")
      .upsert({
        user_id: userId,
        git_url: gitUrl, // Store without token
        project_cloned: true,
        local_path: projectDir,
        last_sync_at: new Date().toISOString(),
      });

    return { localPath: projectDir, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      localPath: projectDir,
      success: false,
      error: `Failed to sync Overleaf project: ${message}`,
    };
  }
}

/**
 * Updates the LaTeX source in the cloned Overleaf project.
 * Creates a branch for the tailored version.
 */
export async function updateOverleafResume(
  userId: string,
  latexContent: string,
  targetFile: string,
  company: string,
  role: string,
): Promise<{
  success: boolean;
  filePath?: string;
  error?: string;
  manualStep?: string;
}> {
  const supabase = getSupabaseClient();

  // Get overleaf config
  const { data: config } = await supabase
    .from("overleaf_configs")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!config || !config.project_cloned) {
    return {
      success: false,
      error: "Overleaf project not configured or not cloned. Run clone first.",
    };
  }

  const projectDir = config.local_path;

  try {
    // Write the tailored LaTeX file
    const filePath = path.join(projectDir, targetFile);
    await fs.writeFile(filePath, latexContent, "utf-8");

    // Git commit
    const git: SimpleGit = simpleGit(projectDir);

    // Note: Overleaf only supports single-branch (main)
    const sanitizedCompany = company.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const sanitizedRole = role.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const commitMessage = `Resume tailored for ${company} — ${role} [${new Date().toISOString().split("T")[0]}]`;

    await git.add(targetFile);
    await git.commit(commitMessage);

    // Push to Overleaf
    try {
      await git.push("origin", "main");

      await logAuditEntry(userId, "Overleaf resume updated and pushed", {
        details: `${company} — ${role}`,
      });

      return {
        success: true,
        filePath,
        manualStep: "Open your Overleaf project to compile the updated resume. The changes have been pushed to your project.",
      };
    } catch (pushError) {
      // Push failed — still saved locally
      return {
        success: true,
        filePath,
        manualStep: "The tailored LaTeX file has been saved locally. Push failed — you may need to push manually or resolve conflicts in Overleaf.",
        error: `Push failed: ${pushError instanceof Error ? pushError.message : String(pushError)}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to update Overleaf: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Gets the current Overleaf project status.
 */
export async function getOverleafStatus(userId: string): Promise<{
  configured: boolean;
  cloned: boolean;
  lastSync?: string;
  localPath?: string;
  mainTexFile?: string;
}> {
  const supabase = getSupabaseClient();

  const { data: config } = await supabase
    .from("overleaf_configs")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!config) {
    return { configured: false, cloned: false };
  }

  return {
    configured: true,
    cloned: config.project_cloned,
    lastSync: config.last_sync_at,
    localPath: config.local_path,
    mainTexFile: config.main_tex_file,
  };
}
