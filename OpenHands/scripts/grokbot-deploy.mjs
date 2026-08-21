#!/usr/bin/env node
/**
 * Grokbot Deploy CLI — Instant Cloudflare Pages Deployment
 *
 * Deploys static HTML/JS/CSS apps, games, landing pages, and Single Page Apps
 * directly to Cloudflare Pages for permanent, 24/7/365 global edge hosting at
 * https://<project-name>.pages.dev.
 *
 * Usage:
 *   node scripts/grokbot-deploy.mjs <directory> [--name <slug>] [--branch <branch>]
 *   grokbot-deploy <directory> [--name <slug>]
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { registerStaticApp } from "./app-registry.mjs";

export function sanitizeSlug(name) {
  if (!name) return `app-${Date.now().toString(36)}`;
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 58) || `app-${Date.now().toString(36)}`
  );
}

function printHelp() {
  console.log(`
GrokBot Deployment CLI — Cloudflare Pages

Deploys static websites, games, and web apps to permanent, 24/7 Cloudflare Pages edge hosting.

USAGE:
  grokbot-deploy <dir> [options]

OPTIONS:
  --name, -n <slug>     Project slug / subdomain (e.g. space-invaders -> space-invaders.pages.dev)
  --branch, -b <branch> Git branch name to tag (default: main)
  -h, --help            Show this help

EXAMPLES:
  grokbot-deploy ./workspace --name space-invaders
  grokbot-deploy /projects/mario-game --name mario-arcade
  grokbot-deploy ./dist --name my-vite-app
`);
}

export function findStaticRoot(targetDir) {
  const abs = resolve(targetDir);
  if (!existsSync(abs)) {
    throw new Error(`Target directory "${targetDir}" does not exist.`);
  }

  const stat = statSync(abs);
  if (!stat.isDirectory()) {
    throw new Error(`Target path "${targetDir}" is not a directory.`);
  }

  // 1. If index.html is in targetDir, use it
  if (existsSync(resolve(abs, "index.html"))) {
    return abs;
  }

  // 2. Check common build output directories
  const candidateDirs = ["dist", "build", "out", "public", "www"];
  for (const candidate of candidateDirs) {
    const candidatePath = resolve(abs, candidate);
    if (
      existsSync(candidatePath) &&
      existsSync(resolve(candidatePath, "index.html"))
    ) {
      return candidatePath;
    }
  }

  // 3. Check if there are any HTML files in targetDir
  try {
    const files = readdirSync(abs);
    const htmlFiles = files.filter((f) => f.toLowerCase().endsWith(".html"));
    if (htmlFiles.length > 0) {
      return abs;
    }
  } catch {}

  throw new Error(
    `No "index.html" found in "${targetDir}" or standard build folders (dist/, build/, public/). Make sure your static entry point is named index.html.`,
  );
}

export function deployToCloudflarePages(directory, options = {}) {
  const deployDir = findStaticRoot(directory);
  const rawName = options.name || basename(resolve(directory));
  const slug = sanitizeSlug(rawName);
  const branch = options.branch || "main";

  console.log(`📦 Preparing deployment from: ${deployDir}`);
  console.log(`🚀 Deploying to Cloudflare Pages project: ${slug}...`);

  const args = [
    "-y",
    "wrangler@latest",
    "pages",
    "deploy",
    deployDir,
    `--project-name=${slug}`,
    `--branch=${branch}`,
    "--commit-dirty=true",
  ];

  const result = spawnSync("npx", args, {
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.status !== 0) {
    throw new Error(`Deployment failed with exit code ${result.status}`);
  }

  const publicUrl = `https://${slug}.pages.dev`;
  console.log("");
  console.log("================================================================");
  console.log(`✅ DEPLOYMENT SUCCESSFUL!`);
  console.log(`🌐 Live URL: ${publicUrl}`);
  console.log(`⚡ Hosted globally 24/7/365 on Cloudflare Pages edge network.`);
  console.log("================================================================");

  // Automatically register static app in the GrokBot apps registry
  try {
    registerStaticApp({
      name: slug,
      title: rawName
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      url: publicUrl,
      dir: deployDir,
      branch,
    });
  } catch (regErr) {
    // Non-fatal if registry fails
    console.warn(`[grokbot-deploy] Warning: Could not update local apps registry: ${regErr.message}`);
  }

  return {
    success: true,
    slug,
    url: publicUrl,
    dir: deployDir,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  let dir = ".";
  let name = null;
  let branch = "main";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--name" || arg === "-n") {
      name = args[++i];
    } else if (arg === "--branch" || arg === "-b") {
      branch = args[++i];
    } else if (!arg.startsWith("-") && dir === ".") {
      dir = arg;
    }
  }

  try {
    const res = deployToCloudflarePages(dir, { name, branch });
    if (process.env.GROKBOT_OUTPUT_FORMAT === "json") {
      console.log(JSON.stringify(res));
    }
  } catch (err) {
    console.error(`❌ Deployment Error: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main();
}
