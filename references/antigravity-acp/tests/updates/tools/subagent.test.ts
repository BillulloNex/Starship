// @ts-nocheck
import { describe, expect, test } from "bun:test";
import type { StepRow } from "../../../src/types";
import { subagentUpdate } from "../../../src/updates/tools/subagent";

describe("updates/tools/subagent.ts", () => {
	describe("subagentUpdate()", () => {
		test("pluralizes title based on Subagents count", () => {
			const stepPlural = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({
								Subagents: [{ Prompt: "Task 1" }, { Prompt: "Task 2" }],
							}),
						},
					},
				},
			} as StepRow;

			const updatePlural = subagentUpdate(stepPlural);
			expect(updatePlural.title).toBe("Delegate to 2 subagents");
			expect(updatePlural.content?.length).toBe(2);

			const stepSingular = {
				stepPayload: {
					toolRun: {
						call: {
							rawInputJson: JSON.stringify({
								Subagents: [{ Prompt: "Task 1" }],
							}),
						},
					},
				},
			} as StepRow;

			const updateSingular = subagentUpdate(stepSingular);
			expect(updateSingular.title).toBe("Delegate to 1 subagent");
			expect(updateSingular.content?.length).toBe(1);
		});

		test("fallbacks gracefully when no subagents provided", () => {
			const step = {
				stepPayload: {
					toolRun: {
						titlePrimary: "Invoke title",
						call: { rawInputJson: "{}" },
					},
				},
			} as StepRow;

			const update: any = subagentUpdate(step);
			expect(update.title).toBe("Invoke title");
			expect(update.content).toBeUndefined();
		});
	});
});
