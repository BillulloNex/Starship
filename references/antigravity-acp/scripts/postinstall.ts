#!/usr/bin/env bun
// Download the agy binary from GitHub Releases for the current platform.
// Runs automatically after `bun install` / `npm install` via the postinstall hook.
//
// When cutting a new agy-acp release, update AGY_VERSION and the sha256 fields
// in src/agy/installer.ts (the sha256 values come from the GitHub release page).

import * as path from "node:path";
import { ensureAgy } from "../src/agy/installer";

// scripts/ lives at {pkg}/scripts/ → bin/ is a sibling of scripts/
const binDir = path.resolve(import.meta.dir, "..", "bin");

ensureAgy({
	destDir: binDir,
	log: console.log,
	warn: console.warn,
}).catch((err: Error) => {
	// Never let postinstall abort the broader install.
	console.warn(`[agy-acp] WARN: postinstall error: ${err.message}`);
});
