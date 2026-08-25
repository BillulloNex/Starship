// Discover agy conversation databases by scanning the conversations directory.
// Used to bind a session to the new DB that agy creates when a fresh prompt runs.

import * as fs from "node:fs";

import * as os from "node:os";
import * as path from "node:path";

/** Snapshot the set of conversation ids (`*.db` stems) currently on disk. */
export function conversationSnapshot(dir: string): Set<string> {
	const home = os.homedir();
	const dirs = [
		dir,
		path.join(home, ".gemini", "antigravity-cli", "conversations"),
		path.join(home, ".gemini", "antigravity", "conversations"),
		path.join(home, ".gemini", "conversations"),
		path.join(home, ".config", "antigravity", "conversations"),
	];
	const out = new Set<string>();
	for (const d of dirs) {
		try {
			const entries = fs.readdirSync(d);
			for (const f of entries) {
				if (f.endsWith(".db")) out.add(f.slice(0, -3));
			}
		} catch {}
	}
	return out;
}

/**
 * Find the single new conversation id created since `before`. Returns null if
 * none — or if several appeared, since we can't safely pick which one belongs
 * to this prompt.
 */
export function newConversationId(
	dir: string,
	before: Set<string>,
): string | null {
	const created = [...conversationSnapshot(dir)].filter(
		(id) => !before.has(id),
	);
	if (created.length === 0) return null;
	if (created.length > 1) {
		console.error(
			"[agy-acp] WARN: multiple new agy conversation files appeared; refusing to bind",
		);
		return null;
	}
	return created[0] ?? null;
}
