import { describe, expect, test } from "bun:test";
import type { StepRow } from "../../../src/types";
import { questionUpdate } from "../../../src/updates/tools/question";

describe("updates/tools/question.ts", () => {
	describe("questionUpdate()", () => {
		test("extracts first question as title and arrays options", () => {
			const step = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({
								questions: [
									{
										question: "What color?",
										options: ["Red", { label: "Blue" }],
									},
								],
							}),
						},
					},
				},
			} as StepRow;

			const update: any = questionUpdate(step);
			expect(update.title).toBe("What color?");
			expect(update.content).toEqual([
				{
					type: "content",
					content: { type: "text", text: "What color?\n  - Red\n  - Blue" },
				},
			]);
		});

		test("fallbacks when questions array is empty", () => {
			const step = {
				stepPayload: {
					toolRun: {
						titlePrimary: "Fallback Q Title",
						call: { rawInputJson: "{}" },
					},
				},
			} as StepRow;
			const update: any = questionUpdate(step);
			expect(update.title).toBe("Fallback Q Title");
			expect(update.content).toBeUndefined();
		});
	});
});
