import { describe, expect, test } from "bun:test";
import type { StepRow } from "../../../src/types";
import { editUpdate } from "../../../src/updates/tools/edit";

describe("updates/tools/edit.ts", () => {
	describe("editUpdate()", () => {
		test("write_to_file (plan.md) renders as prose textBlock", () => {
			const step = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({
								TargetFile: "/a/.gemini/antigravity-cli/brain/123/plan.md",
								CodeContent: "my plan",
							}),
						},
					},
				},
			} as StepRow;

			const update: any = editUpdate(step, "/a");
			expect(update.title).toBe("plan.md");
			expect(update.content).toEqual([
				{ type: "content", content: { type: "text", text: "my plan" } },
			]);
			expect(update.locations).toEqual([
				{ path: "/a/.gemini/antigravity-cli/brain/123/plan.md" },
			]);
		});

		test("write_to_file (code file) renders as diff block", () => {
			const step = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({
								TargetFile: "/a/b/c.ts",
								CodeContent: "const x = 1;",
							}),
						},
					},
				},
			} as StepRow;

			const update: any = editUpdate(step, "/a");
			expect(update.title).toBe("Edit b/c.ts");
			expect(update.content).toEqual([
				{
					type: "diff",
					path: "/a/b/c.ts",
					oldText: null,
					newText: "const x = 1;",
				},
			]);
			expect(update.locations).toEqual([{ path: "/a/b/c.ts" }]);
		});

		test("replace_file_content (single inline chunk) renders diff block", () => {
			const step = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({
								TargetFile: "/a/file.txt",
								TargetContent: "old",
								ReplacementContent: "new",
								StartLine: 5,
							}),
						},
					},
				},
			} as StepRow;

			const update: any = editUpdate(step, "/a");
			expect(update.title).toBe("Edit file.txt");
			expect(update.content).toEqual([
				{ type: "diff", path: "/a/file.txt", oldText: "old", newText: "new" },
			]);
			expect(update.locations).toEqual([{ path: "/a/file.txt", line: 5 }]);
		});

		test("multi_replace_file_content (multiple chunks) renders multiple diff blocks", () => {
			const step = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({
								TargetFile: "/a/file.txt",
								ReplacementChunks: [
									{
										TargetContent: "old1",
										ReplacementContent: "new1",
										StartLine: 1,
									},
									{
										TargetContent: "old2",
										ReplacementContent: "new2",
										StartLine: 10,
									},
								],
							}),
						},
					},
				},
			} as StepRow;

			const update: any = editUpdate(step, "/a");
			expect(update.content).toEqual([
				{ type: "diff", path: "/a/file.txt", oldText: "old1", newText: "new1" },
				{ type: "diff", path: "/a/file.txt", oldText: "old2", newText: "new2" },
			]);
			expect(update.locations).toEqual([
				{ path: "/a/file.txt", line: 1 },
				{ path: "/a/file.txt", line: 10 },
			]);
		});

		test("handles missing TargetFile gracefully", () => {
			const step = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({ CodeContent: "some code" }),
						},
					},
				},
			} as StepRow;

			const update: any = editUpdate(step, "/a");
			expect(update.title).toBe("Edit");
			expect(update.content).toBeUndefined();
			expect(update.locations).toBeUndefined();
		});
	});
});
