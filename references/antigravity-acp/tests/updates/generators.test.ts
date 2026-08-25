import { describe, expect, test } from "bun:test";
import type { StepRow } from "../../src/types";
import { agentUpdate } from "../../src/updates/agent";
import { lifecycleUpdate } from "../../src/updates/lifecycle";
import { titleUpdate } from "../../src/updates/title";
import { userPromptUpdate } from "../../src/updates/userPrompt";

describe("updates/generators", () => {
	describe("agentUpdate()", () => {
		test("returns agent_message_chunk with text", () => {
			const step = {
				idx: 5,
				stepPayload: { agentText: { text: "Hello there" } },
			} as StepRow;
			expect(agentUpdate(step)).toEqual({
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "Hello there" },
				messageId: "5",
			});
		});

		test("fallbacks to empty string", () => {
			const step = {
				idx: 6,
				stepPayload: {},
			} as StepRow;
			expect(agentUpdate(step)).toEqual({
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "" },
				messageId: "6",
			});
		});
	});

	describe("lifecycleUpdate()", () => {
		test("definitively always returns null", () => {
			expect(lifecycleUpdate({} as StepRow)).toBeNull();
			expect(lifecycleUpdate({ idx: 10 } as StepRow)).toBeNull();
		});
	});

	describe("titleUpdate()", () => {
		test("extracts title string", () => {
			const step = {
				idx: 1,
				stepType: 23,
				stepPayload: { titleUpdate: { title: "New Title" } },
			} as StepRow;
			expect(titleUpdate(step)).toEqual([
				{
					sessionUpdate: "session_info_update",
					title: "New Title",
				},
			]);
		});

		test("fallbacks to null when title is missing", () => {
			const step = {
				idx: 2,
				stepType: 23,
				stepPayload: {},
			} as StepRow;
			expect(titleUpdate(step)).toEqual([
				{
					sessionUpdate: "session_info_update",
					title: null,
				},
			]);
		});
	});

	describe("userPromptUpdate()", () => {
		test("parses user_text XML tags", () => {
			const step = {
				idx: 1,
				stepPayload: {
					userPrompt: { text: "<user_text>\nHello world\n</user_text>" },
				},
			} as StepRow;
			expect(userPromptUpdate(step)).toEqual([
				{
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "Hello world" },
					messageId: "1",
				},
			]);
		});

		test("parses resource_link XML tags and unescapes quotes", () => {
			const step = {
				idx: 2,
				stepPayload: {
					userPrompt: {
						text: `<resource_link uri="https://example.com" title="My &quot;Cool&quot; Link"/>`,
					},
				},
			} as StepRow;
			expect(userPromptUpdate(step)).toEqual([
				{
					sessionUpdate: "user_message_chunk",
					content: {
						type: "resource_link",
						uri: "https://example.com",
						name: 'My "Cool" Link',
						title: 'My "Cool" Link',
					},
					messageId: "2",
				},
			]);
		});

		test("parses embedded_resource XML tags", () => {
			const step = {
				idx: 3,
				stepPayload: {
					userPrompt: {
						text: `<embedded_resource uri="file:///tmp/test.txt">\nFile content here\n</embedded_resource>`,
					},
				},
			} as StepRow;
			expect(userPromptUpdate(step)).toEqual([
				{
					sessionUpdate: "user_message_chunk",
					content: {
						type: "resource",
						resource: {
							uri: "file:///tmp/test.txt",
							text: "File content here",
						},
					},
					messageId: "3",
				},
			]);
		});

		test("parses multiple mixed blocks", () => {
			const text = `<user_text>\nHello\n</user_text><resource_link uri="https://example.com" title="Link"/><embedded_resource uri="file.txt">\nContent\n</embedded_resource>`;
			const step = {
				idx: 4,
				stepPayload: { userPrompt: { text } },
			} as StepRow;
			expect(userPromptUpdate(step)).toEqual([
				{
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "Hello" },
					messageId: "4",
				},
				{
					sessionUpdate: "user_message_chunk",
					content: {
						type: "resource_link",
						uri: "https://example.com",
						name: "Link",
						title: "Link",
					},
					messageId: "4",
				},
				{
					sessionUpdate: "user_message_chunk",
					content: {
						type: "resource",
						resource: { uri: "file.txt", text: "Content" },
					},
					messageId: "4",
				},
			]);
		});

		test("fallbacks to plaintext if no XML tags are found", () => {
			const step = {
				idx: 5,
				stepPayload: {
					userPrompt: { text: "Just some plain text without tags" },
				},
			} as StepRow;
			expect(userPromptUpdate(step)).toEqual([
				{
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "Just some plain text without tags" },
					messageId: "5",
				},
			]);
		});

		test("fallbacks to empty string if missing", () => {
			const step = {
				idx: 6,
				stepPayload: {},
			} as StepRow;
			expect(userPromptUpdate(step)).toEqual([
				{
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "" },
					messageId: "6",
				},
			]);
		});
	});
});
