// @ts-nocheck
import { describe, expect, test } from "bun:test";
import type { StepRow } from "../../src/types";
import {
	asNum,
	asStr,
	codeBlock,
	fsPath,
	parseRawInput,
	pick,
	textBlock,
	toDisplayPath,
	toolCallId,
	toolCallStatus,
	toolCallUpdate,
} from "../../src/updates/utils";

describe("updates/utils.ts", () => {
	describe("parseRawInput()", () => {
		test("parses valid JSON", () => {
			const step = {
				stepPayload: { toolRun: { call: { rawInputJson: '{"key":"value"}' } } },
			} as StepRow;
			expect(parseRawInput(step)).toEqual({ key: "value" });
		});

		test("returns null for invalid JSON", () => {
			const step = {
				stepPayload: { toolRun: { call: { rawInputJson: '{"key":"val' } } },
			} as StepRow;
			expect(parseRawInput(step)).toBeNull();
		});

		test("returns null for empty string or whitespace", () => {
			const step1 = {
				stepPayload: { toolRun: { call: { rawInputJson: "" } } },
			} as StepRow;
			expect(parseRawInput(step1)).toBeNull();

			const step2 = {
				stepPayload: { toolRun: { call: { rawInputJson: "   " } } },
			} as StepRow;
			expect(parseRawInput(step2)).toBeNull();
		});

		test("returns null for missing payload", () => {
			const step = { stepPayload: {} } as StepRow;
			expect(parseRawInput(step)).toBeNull();
		});
	});

	describe("toolCallId()", () => {
		test("returns callId if present", () => {
			const step = {
				idx: 5,
				stepType: 20,
				stepPayload: { toolRun: { call: { callId: "call_123" } } },
			} as StepRow;
			expect(toolCallId(step)).toBe("call_123");
		});

		test("returns synthetic id if callId is missing", () => {
			const step = {
				idx: 5,
				stepType: 20,
				stepPayload: { toolRun: { call: {} } },
			} as StepRow;
			expect(toolCallId(step)).toBe("agy-5-20");
		});
	});

	describe("toolCallStatus()", () => {
		test("maps statuses correctly", () => {
			expect(toolCallStatus({ status: 2 } as StepRow)).toBe("in_progress");
			expect(toolCallStatus({ status: 3 } as StepRow)).toBe("completed");
			expect(toolCallStatus({ status: 6 } as StepRow)).toBe("failed");
			expect(toolCallStatus({ status: 7 } as StepRow)).toBe("failed");
			expect(toolCallStatus({ status: 99 } as StepRow)).toBe("completed");
		});
	});

	describe("blocks validation", () => {
		test("textBlock()", () => {
			expect(textBlock("hello")).toEqual({
				type: "content",
				content: { type: "text", text: "hello" },
			});
		});

		test("codeBlock()", () => {
			expect(codeBlock("hello")).toEqual({
				type: "content",
				content: { type: "text", text: "```\nhello\n```" },
			});
		});
	});

	describe("toolCallUpdate()", () => {
		test("builds tool_call with task, permission, and error blocks", () => {
			const step = {
				idx: 1,
				stepType: 20,
				status: 7,
				stepPayload: {
					toolRun: { call: { callId: "c1", rawInputJson: '{"a":1}' } },
				},
				task: { taskId: "t1", logUri: "/log", description: "my task" },
				permission: { kind: "command", value: "ls" },
				error: {
					message: "Failed",
					detail: "Extra detail",
					stackTrace: "stack",
				},
			} as unknown as StepRow;

			const update: any = toolCallUpdate({
				stepRow: step,
				title: "My Tool",
				kind: "execute",
			});

			expect(update.sessionUpdate).toBe("tool_call");
			expect(update.toolCallId).toBe("c1");
			expect(update.title).toBe("My Tool");
			expect(update.kind).toBe("execute");
			expect(update.status).toBe("failed");
			expect(update.rawInput).toEqual({ a: 1 });
			expect(update.rawOutput).toEqual({
				message: "Failed",
				detail: "Extra detail",
				stackTrace: "stack",
			});

			// Checks that blocks are present
			expect(update.content).toBeDefined();
			expect(update.content?.length).toBe(3); // task, permission, error
		});
	});

	describe("toDisplayPath()", () => {
		test("returns relative path when inside cwd", () => {
			expect(toDisplayPath("/a/b/c.txt", "/a/b")).toBe("c.txt");
		});
		test("returns original path if outside cwd", () => {
			expect(toDisplayPath("/a/b/c.txt", "/x/y")).toBe("/a/b/c.txt");
		});
		test("returns original path if no cwd", () => {
			expect(toDisplayPath("/a/b/c.txt")).toBe("/a/b/c.txt");
		});
	});

	describe("pick()", () => {
		test("picks the first available key", () => {
			expect(pick({ a: 1, b: 2 }, "b", "a")).toBe(2);
			expect(pick({ a: 1 }, "b", "a")).toBe(1);
			expect(pick({ a: 1 }, "c", "d")).toBeUndefined();
			expect(pick(null, "a")).toBeUndefined();
			expect(pick([], "a")).toBeUndefined();
			expect(pick("string", "a")).toBeUndefined();
		});
	});

	describe("asStr()", () => {
		test("returns string or null", () => {
			expect(asStr("foo")).toBe("foo");
			expect(asStr(123)).toBeNull();
			expect(asStr(null)).toBeNull();
		});
	});

	describe("asNum()", () => {
		test("returns number or null", () => {
			expect(asNum(123)).toBe(123);
			expect(asNum("456")).toBe(456);
			expect(asNum("   ")).toBeNull();
			expect(asNum("abc")).toBeNull();
			expect(asNum(null)).toBeNull();
		});
	});

	describe("fsPath()", () => {
		test("strips file:// prefix and decodes", () => {
			expect(fsPath("file:///a/b/c%20d.txt")).toBe("/a/b/c d.txt");
			expect(fsPath("file:///a/b.txt")).toBe("/a/b.txt");
			expect(fsPath("/a/b.txt")).toBe("/a/b.txt");
			expect(fsPath(null)).toBeNull();
		});
	});
});
