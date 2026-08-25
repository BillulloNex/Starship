import { describe, expect, test } from "bun:test";
import { filterNarration, isNarration } from "../../src/narration/index";

describe("narration/index.ts", () => {
	describe("isNarration()", () => {
		test("returns true for lines starting with 'I will', 'I\\'ll', 'I’ll'", () => {
			expect(isNarration("I will create the file")).toBe(true);
			expect(isNarration("I'll do that now")).toBe(true);
			expect(isNarration("I’ll fix this issue")).toBe(true);
		});

		test("returns true for indented narration lines", () => {
			expect(isNarration("  I will check the logs")).toBe(true);
			expect(isNarration("\tI'll fetch the data")).toBe(true);
		});

		test("returns true when every non-empty line is a narration line", () => {
			expect(isNarration("I will start.\n\nI'll continue.")).toBe(true);
		});

		test("returns false for mixed narration and non-narration lines", () => {
			expect(isNarration("I will start.\nHere is some code.")).toBe(false);
		});

		test("returns false for empty strings or whitespace-only", () => {
			expect(isNarration("")).toBe(false);
			expect(isNarration("   ")).toBe(false);
			expect(isNarration("\n\n")).toBe(false);
		});

		test("returns false for non-narration text", () => {
			expect(isNarration("This is a standard response.")).toBe(false);
		});
	});

	describe("filterNarration()", () => {
		test("selectively drops narration parts and preserves valid strings", () => {
			const parts = [
				"I will start by reviewing the code.",
				"The issue is on line 42.",
				"I'll write a fix.",
				"Here is the diff.",
			];
			const filtered = filterNarration(parts);
			expect(filtered).toBe("The issue is on line 42.\nHere is the diff.");
		});

		test("returns null if nothing remains", () => {
			const parts = ["I will do this.", "I'll do that."];
			expect(filterNarration(parts)).toBeNull();
		});

		test("returns null if input is empty array", () => {
			expect(filterNarration([])).toBeNull();
		});
	});
});
