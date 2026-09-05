/**
 * Skill Installer Helper & Route Handler for Starship.
 *
 * Supports installing skills from skills.sh, GitHub, or package identifiers
 * using the official `skills` CLI (`npx skills add ...`).
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Parse arbitrary user input into package, skill name, and clean arguments.
 *
 * Supported formats:
 * - `npx skills add vercel-labs/agent-skills`
 * - `npx skills add vercel-labs/agent-skills --skill web-design`
 * - `https://skills.sh/vercel-labs/agent-skills/web-design`
 * - `https://skills.sh/vercel-labs/agent-skills`
 * - `https://github.com/owner/repo/tree/main/skills/my-skill`
 * - `https://github.com/owner/repo`
 * - `owner/repo`
 * - `owner/repo/my-skill`
 */
export function parseSkillInput(rawInput) {
  if (!rawInput || typeof rawInput !== "string") {
    throw new Error("Skill input is required");
  }

  let trimmed = rawInput.trim();

  // Strip leading CLI command prefixes if user pasted the full command
  trimmed = trimmed.replace(
    /^(?:npx\s+(?:--yes\s+|-y\s+)?skills(?:@\S+)?\s+add|skills\s+add)\s+/i,
    "",
  );

  // Check if --skill or -s was supplied explicitly
  let explicitSkill;
  const skillFlagMatch = trimmed.match(/(?:--skill|-s)\s+([^\s]+)/i);
  if (skillFlagMatch) {
    explicitSkill = skillFlagMatch[1];
    trimmed = trimmed.replace(/(?:--skill|-s)\s+[^\s]+/gi, "").trim();
  }

  // Handle skills.sh URLs: https://skills.sh/owner/repo/skill-name or https://skills.sh/owner/repo
  const skillsShMatch = trimmed.match(
    /^https?:\/\/skills\.sh\/([^/\s]+)\/([^/\s]+)(?:\/([^\s]+))?$/i,
  );
  if (skillsShMatch) {
    const [, owner, repo, pathSkill] = skillsShMatch;
    return {
      packageSpec: `${owner}/${repo}`,
      skillName: explicitSkill || pathSkill || undefined,
    };
  }

  // Handle GitHub tree URLs: https://github.com/owner/repo/tree/branch/path/to/skill
  const ghTreeMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/tree\/[^/\s]+\/(.+)$/i,
  );
  if (ghTreeMatch) {
    const [, owner, repo, path] = ghTreeMatch;
    const leaf = path.split("/").filter(Boolean).pop();
    return {
      packageSpec: `https://github.com/${owner}/${repo}`,
      skillName: explicitSkill || leaf || undefined,
    };
  }

  // Handle standard GitHub URLs: https://github.com/owner/repo
  const ghMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/)?$/i,
  );
  if (ghMatch) {
    return {
      packageSpec: `${ghMatch[1]}/${ghMatch[2]}`,
      skillName: explicitSkill || undefined,
    };
  }

  // Handle 3-part shorthand: owner/repo/skill-name (without protocols)
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 3 && !trimmed.startsWith("http")) {
    return {
      packageSpec: `${parts[0]}/${parts[1]}`,
      skillName: explicitSkill || parts[2],
    };
  }

  // Default: treat as package spec (e.g. owner/repo)
  return {
    packageSpec: trimmed,
    skillName: explicitSkill || undefined,
  };
}

/**
 * Execute skill installation using `npx --yes skills add`.
 */
export async function installSkill({
  input,
  scope = "personal",
  projectDir,
}) {
  const { packageSpec, skillName } = parseSkillInput(input);
  const isGlobal = scope === "personal";

  const args = ["--yes", "skills", "add", packageSpec, "-y", "--copy"];
  if (skillName) {
    args.push("--skill", skillName);
  }
  if (isGlobal) {
    args.push("-g");
  }

  const cwd = !isGlobal && projectDir ? resolve(projectDir) : homedir();

  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn("npx", args, {
      cwd,
      env: {
        ...process.env,
        CI: "true",
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      rejectPromise(new Error("Skill installation timed out after 60 seconds"));
    }, 60_000);

    proc.on("error", (err) => {
      clearTimeout(timeout);
      rejectPromise(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);

      const combinedOutput = `${stdout}\n${stderr}`.trim();

      if (code !== 0) {
        let errorMsg = `Installation failed with exit code ${code}`;
        const notFoundMatch = combinedOutput.match(/No matching skills found for: (.*)/i);
        if (notFoundMatch) {
          errorMsg = `Skill "${notFoundMatch[1]}" was not found in ${packageSpec}.`;
        } else if (combinedOutput.includes("Git error") || combinedOutput.includes("Repository not found")) {
          errorMsg = `Repository "${packageSpec}" was not found or is inaccessible.`;
        }
        return rejectPromise(new Error(`${errorMsg}\n\n${combinedOutput}`));
      }

      // If global, mirror installed skills from ~/.agents/skills to ~/.openhands/skills
      const home = homedir();
      const agentsSkillsDir = join(home, ".agents", "skills");
      const openhandsSkillsDir = join(home, ".openhands", "skills");

      try {
        if (isGlobal && existsSync(agentsSkillsDir)) {
          mkdirSync(openhandsSkillsDir, { recursive: true });
          const entries = readdirSync(agentsSkillsDir);
          for (const entry of entries) {
            const src = join(agentsSkillsDir, entry);
            const dst = join(openhandsSkillsDir, entry);
            if (existsSync(src) && !existsSync(dst)) {
              try {
                cpSync(src, dst, { recursive: true });
              } catch {
                // Ignore copy errors
              }
            }
          }
        }
      } catch (err) {
        console.warn("[skill-installer] Warning syncing skills directory:", err.message);
      }

      let detectedSkillName = skillName;
      const installedMatch = combinedOutput.match(/(?:Installed|Selected)\s+\d+\s+skill[s]?\s*:\s*([^\s\n]+)/i)
        || combinedOutput.match(/✓\s+([^\s\n]+)\s+\(copied\)/i)
        || combinedOutput.match(/→\s+.*?[\\/]\.agents[\\/]skills[\\/]([^\s\n\\/]+)/i);

      if (installedMatch) {
        detectedSkillName = installedMatch[1];
      }

      resolvePromise({
        success: true,
        skillName: detectedSkillName || packageSpec,
        packageSpec,
        scope,
        output: combinedOutput,
      });
    });
  });
}

/**
 * HTTP Request Handler for `POST /api/skills/install`.
 */
export async function handleSkillInstallRequest(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 100_000) {
      req.destroy();
    }
  });

  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}");
      const { input, scope = "personal", projectDir } = data;

      if (!input || typeof input !== "string") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Skill input is required" }));
        return;
      }

      const result = await installSkill({ input, scope, projectDir });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error("[skill-installer] Install error:", err);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}
