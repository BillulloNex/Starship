#!/usr/bin/env node
// Bump Grokbot version (x.y.z) and sync all sources.
// Usage: node scripts/bump-version.mjs [patch|minor|major]
//   patch: 0.1.2 -> 0.1.3  (bug fixes, small tweaks)
//   minor: 0.1.2 -> 0.2.0  (new features, non-breaking)
//   major: 0.1.2 -> 1.0.0  (breaking changes, major milestones)
// If no arg, defaults to patch.
// Also accepts explicit version: node scripts/bump-version.mjs 0.2.0
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const VERSION_FILE = resolve("VERSION");
const TS_FILE = resolve("OpenHands/src/constants/grokbot-version.ts");

function parse(v) {
  const m = v.trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return m.slice(1).map(Number);
}
function bump(current, kind) {
  let [x,y,z] = parse(current);
  if (kind === "major") return `${x+1}.0.0`;
  if (kind === "minor") return `${x}.${y+1}.0`;
  if (kind === "patch") return `${x}.${y}.${z+1}`;
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind; // explicit
  throw new Error(`Unknown bump kind: ${kind} (use patch|minor|major or x.y.z)`);
}

const kind = process.argv[2] || "patch";
const current = readFileSync(VERSION_FILE, "utf8").trim();
const next = bump(current, kind);

// write VERSION
writeFileSync(VERSION_FILE, next + "\n");
// write TS constant
writeFileSync(TS_FILE, `export const GROKBOT_VERSION = "${next}" as const;\n`);
console.log(`Grokbot version: ${current} -> ${next}`);
console.log(`Updated ${VERSION_FILE}`);
console.log(`Updated ${TS_FILE}`);
