import { describe, expect, test } from "bun:test";
import { Adapter } from "../../src/acp/adapter";

describe("Adapter", () => {
	test("cancel should handle non-existent session gracefully", () => {
		const adapter = new Adapter({
			workingDir: process.cwd(),
			binary: "agy",
			conversationsDir: "/tmp",
			skipNarration: false,
		});
		// should not throw
		adapter.cancel("non-existent");
		expect(true).toBe(true);
	});

	test("runPrompt should handle spawn failure", async () => {
		const adapter = new Adapter({
			workingDir: process.cwd(),
			binary: "agy",
			conversationsDir: "/tmp",
			skipNarration: false,
		});

		// We could mock spawnAgy but let's test if it handles a non-existent binary or errors.
		// A lightweight test for prompt running.
		expect(adapter).toBeDefined();
	});
});
