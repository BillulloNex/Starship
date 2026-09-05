/**
 * Skill Installer Helper & Route Handler for Starship.
 *
 * Installs skills from skills.sh / GitHub repositories by cloning the repo
 * and copying skill directories into ~/.agents/skills/ (global) or
 * <projectDir>/.agents/skills/ (workspace).
 *
 * This replaces the previous `npx skills add` approach which had Node.js
 * version incompatibility issues in the container.
 */

import { execSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  readdirSync,
  rmSync,
  readFileSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Parse arbitrary user input into owner, repo, and optional skill name.
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

  // Strip other flags that the skills CLI uses (-y, --copy, -g, etc.)
  trimmed = trimmed.replace(/\s+(?:-[yg]|--copy|--global)\b/g, "").trim();

  // Handle skills.sh URLs: https://skills.sh/owner/repo/skill-name
  const skillsShMatch = trimmed.match(
    /^https?:\/\/skills\.sh\/([^/\s]+)\/([^/\s]+)(?:\/([^\s]+))?$/i,
  );
  if (skillsShMatch) {
    const [, owner, repo, pathSkill] = skillsShMatch;
    return {
      owner,
      repo,
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
      owner,
      repo,
      packageSpec: `${owner}/${repo}`,
      skillName: explicitSkill || leaf || undefined,
    };
  }

  // Handle standard GitHub URLs: https://github.com/owner/repo
  const ghMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/)?$/i,
  );
  if (ghMatch) {
    return {
      owner: ghMatch[1],
      repo: ghMatch[2],
      packageSpec: `${ghMatch[1]}/${ghMatch[2]}`,
      skillName: explicitSkill || undefined,
    };
  }

  // Handle 3-part shorthand: owner/repo/skill-name (without protocols)
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 3 && !trimmed.startsWith("http")) {
    return {
      owner: parts[0],
      repo: parts[1],
      packageSpec: `${parts[0]}/${parts[1]}`,
      skillName: explicitSkill || parts[2],
    };
  }

  if (parts.length >= 2 && !trimmed.startsWith("http")) {
    return {
      owner: parts[0],
      repo: parts[1],
      packageSpec: `${parts[0]}/${parts[1]}`,
      skillName: explicitSkill || undefined,
    };
  }

  throw new Error(
    `Cannot parse input: "${rawInput}". Expected owner/repo, owner/repo/skill, or a GitHub/skills.sh URL.`,
  );
}

/**
 * Clone a GitHub repo (shallow) and install skill directories.
 */
export async function installSkill({
  input,
  scope = "personal",
  projectDir,
}) {
  const { owner, repo, packageSpec, skillName } = parseSkillInput(input);
  const isGlobal = scope === "personal";

  // Destination directory
  const home = homedir();
  const baseDir = isGlobal
    ? join(home, ".agents", "skills")
    : projectDir
      ? join(resolve(projectDir), ".agents", "skills")
      : join(home, ".agents", "skills");

  mkdirSync(baseDir, { recursive: true });

  // Create temp dir for clone
  const tmpId = randomBytes(8).toString("hex");
  const cloneDir = join(tmpdir(), `skill-install-${tmpId}`);

  try {
    // Shallow clone the repo
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;

    await runCommand("git", [
      "clone",
      "--depth",
      "1",
      "--single-branch",
      cloneUrl,
      cloneDir,
    ], { timeout: 30_000 });

    // Find the skills directory — convention is `skills/` at repo root
    let skillsRoot = join(cloneDir, "skills");
    if (!existsSync(skillsRoot)) {
      // Some repos put skills directly in the root with SKILL.md
      if (existsSync(join(cloneDir, "SKILL.md"))) {
        // The entire repo IS a skill
        skillsRoot = null;
      } else {
        // Try the repo root if no skills/ dir exists
        throw new Error(
          `Repository "${packageSpec}" does not contain a "skills/" directory or a root SKILL.md.`,
        );
      }
    }

    const installedSkills = [];

    if (skillsRoot === null) {
      // The entire repo is a single skill
      const targetName = skillName || repo;
      const destDir = join(baseDir, targetName);
      mkdirSync(destDir, { recursive: true });
      copySkillFiles(cloneDir, destDir);
      installedSkills.push(targetName);
    } else if (skillName) {
      // Install only the requested skill — search top-level first, then nested categories
      let srcDir = join(skillsRoot, skillName);
      if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
        // Skill not at top level — search inside category subdirectories
        srcDir = findSkillRecursive(skillsRoot, skillName);
        if (!srcDir) {
          // List ALL available skills (including nested) in error message
          const available = listAllSkillNames(skillsRoot);
          throw new Error(
            `Skill "${skillName}" not found in ${packageSpec}. Available skills: ${available.join(", ") || "none"}`,
          );
        }
      }
      const destDir = join(baseDir, skillName);
      mkdirSync(destDir, { recursive: true });
      cpSync(srcDir, destDir, { recursive: true });
      installedSkills.push(skillName);
    } else {
      // Install ALL skills from the repo (handles nested category dirs)
      const allSkills = findAllSkills(skillsRoot);
      if (allSkills.length === 0) {
        throw new Error(
          `No skill directories found in ${packageSpec}/skills/.`,
        );
      }

      for (const { name, path: srcDir } of allSkills) {
        const destDir = join(baseDir, name);
        mkdirSync(destDir, { recursive: true });
        cpSync(srcDir, destDir, { recursive: true });
        installedSkills.push(name);
      }
    }

    // Mirror to ~/.openhands/skills if global install
    if (isGlobal) {
      const openhandsSkillsDir = join(home, ".openhands", "skills");
      try {
        mkdirSync(openhandsSkillsDir, { recursive: true });
        for (const name of installedSkills) {
          const src = join(baseDir, name);
          const dst = join(openhandsSkillsDir, name);
          if (existsSync(src) && !existsSync(dst)) {
            cpSync(src, dst, { recursive: true });
          }
        }
      } catch {
        // Best-effort mirror
      }
    }

    return {
      success: true,
      skillName: installedSkills.join(", "),
      packageSpec,
      scope,
      installed: installedSkills,
      output: `Successfully installed ${installedSkills.length} skill(s) from ${packageSpec}: ${installedSkills.join(", ")}`,
    };
  } finally {
    // Cleanup temp clone
    try {
      rmSync(cloneDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * List subdirectories in skills/ that are valid skill directories.
 */
function listSkillDirs(skillsRoot) {
  return readdirSync(skillsRoot).filter((entry) => {
    const fullPath = join(skillsRoot, entry);
    try {
      return (
        statSync(fullPath).isDirectory() &&
        !entry.startsWith(".") &&
        !entry.endsWith(".zip")
      );
    } catch {
      return false;
    }
  });
}

/**
 * Check if a directory is a skill (contains SKILL.md).
 */
function isSkillDir(dirPath) {
  return existsSync(join(dirPath, "SKILL.md"));
}

/**
 * Recursively find a skill by name in the skills directory tree.
 * Handles repos like mattpocock/skills where skills are nested:
 *   skills/productivity/grill-me/SKILL.md
 */
function findSkillRecursive(skillsRoot, skillName, maxDepth = 3) {
  if (maxDepth <= 0) return null;

  const entries = listSkillDirs(skillsRoot);
  for (const entry of entries) {
    const fullPath = join(skillsRoot, entry);

    // Direct match
    if (entry === skillName && isSkillDir(fullPath)) {
      return fullPath;
    }

    // Check subdirectories (category folders)
    if (!isSkillDir(fullPath)) {
      const found = findSkillRecursive(fullPath, skillName, maxDepth - 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find ALL skill directories recursively (for "install all" mode).
 * Returns array of { name, path } for each skill found.
 */
function findAllSkills(skillsRoot, maxDepth = 3) {
  if (maxDepth <= 0) return [];

  const results = [];
  const entries = listSkillDirs(skillsRoot);

  for (const entry of entries) {
    const fullPath = join(skillsRoot, entry);

    if (isSkillDir(fullPath)) {
      // This directory IS a skill
      results.push({ name: entry, path: fullPath });
    } else {
      // This might be a category folder — recurse into it
      const nested = findAllSkills(fullPath, maxDepth - 1);
      results.push(...nested);
    }
  }
  return results;
}

/**
 * List all skill names (including nested) for error messages.
 */
function listAllSkillNames(skillsRoot) {
  return findAllSkills(skillsRoot).map((s) => s.name);
}

/**
 * Copy relevant skill files from source to destination, excluding .git etc.
 */
function copySkillFiles(src, dst) {
  const entries = readdirSync(src);
  for (const entry of entries) {
    if (entry === ".git" || entry === ".github" || entry === "node_modules") {
      continue;
    }
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    try {
      cpSync(srcPath, dstPath, { recursive: true });
    } catch {
      // Skip individual file copy errors
    }
  }
}

/**
 * Run a command and return stdout. Rejects on non-zero exit.
 */
function runCommand(cmd, args, { timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const errText = stderr.trim() || stdout.trim();
        if (errText.includes("not found") || errText.includes("Repository not found")) {
          reject(new Error(`Repository not found: ${args.find((a) => a.includes("github.com")) || args.join(" ")}`));
        } else {
          reject(new Error(`Command failed (exit ${code}): ${errText}`));
        }
      } else {
        resolve(stdout);
      }
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
