// @ts-nocheck
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { conversationDbPath } from "../../src/conversation/database";
import { conversationSnapshot } from "../../src/conversation/scan";
import { StreamPoller } from "../../src/conversation/streaming";
import { StepPayload } from "../../src/gen/steps";

describe("conversation/streaming", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-stream-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	function createMockDb(id: string) {
		const dbPath = conversationDbPath(tempDir, id);
		const sqlite = new Database(dbPath);
		sqlite
			.query(
				"CREATE TABLE steps (idx INTEGER, step_type INTEGER, status INTEGER, step_payload BLOB, error_details BLOB, permissions BLOB, task_details BLOB)",
			)
			.run();
		sqlite.close();
	}

	function appendStep(
		id: string,
		idx: number,
		stepType: number,
		payloadObj: any,
	) {
		const dbPath = conversationDbPath(tempDir, id);
		const sqlite = new Database(dbPath);
		const payload = StepPayload.encode(StepPayload.create(payloadObj)).finish();
		sqlite
			.query(
				"INSERT INTO steps (idx, step_type, status, step_payload) VALUES (?, ?, ?, ?)",
			)
			.run(idx, stepType, 0, payload);
		sqlite.close();
	}

	test("StreamPoller binds to existing conversationId", () => {
		createMockDb("bound");

		const poller = new StreamPoller({
			dir: tempDir,
			conversationId: "bound",
			baseStepIdx: -1,
			skipNarration: false,
			snapshot: null,
		});

		expect(poller.conversationId).toBe("bound");
		expect(poller.lastStepIdx).toBe(-1); // Before polling

		// Append a step
		appendStep("bound", 0, 15, { agentText: { text: "hello" } });

		const updates = poller.poll();
		expect(updates.length).toBe(1);
		expect(updates[0].sessionUpdate).toBe("agent_message_chunk");
		expect(poller.lastStepIdx).toBe(0);
		expect(poller.hadUpdates).toBe(true);

		poller.close();
	});

	test("StreamPoller binds to new conversation using snapshot", () => {
		createMockDb("old-db");
		const snapshot = conversationSnapshot(tempDir);

		const poller = new StreamPoller({
			dir: tempDir,
			conversationId: null,
			baseStepIdx: -1,
			skipNarration: false,
			snapshot,
		});

		// At first, poll returns empty because no new DB exists
		expect(poller.poll()).toEqual([]);
		expect(poller.conversationId).toBeNull();

		// Now a new DB appears
		createMockDb("new-db");
		appendStep("new-db", 1, 15, { agentText: { text: "greetings" } });

		const updates = poller.poll();
		expect(poller.conversationId).toBe("new-db");
		expect(updates.length).toBe(1);
		expect(poller.lastStepIdx).toBe(1);

		poller.close();
	});

	test("poll returns empty if db file goes missing", () => {
		const poller = new StreamPoller({
			dir: tempDir,
			conversationId: "missing",
			baseStepIdx: -1,
			skipNarration: false,
			snapshot: null,
		});

		expect(poller.poll()).toEqual([]);
	});

	test("poll dedups emitted tool steps and slices text streams", () => {
		createMockDb("dedup");

		const poller = new StreamPoller({
			dir: tempDir,
			conversationId: "dedup",
			baseStepIdx: -1,
			skipNarration: false,
			snapshot: null,
		});

		// First poll: agent says "hi"
		appendStep("dedup", 0, 15, { agentText: { text: "hi" } });
		// Tool step
		appendStep("dedup", 1, 8, {
			toolRun: { call: { namePrimary: "view_file" } },
		});

		const updates1 = poller.poll();
		expect(updates1.length).toBe(2);
		expect(updates1[0].sessionUpdate).toBe("agent_message_chunk");

		// Second poll: agent says "hi there", tool step still there (but shouldn't be re-emitted)
		appendStep("dedup", 0, 15, { agentText: { text: "hi there" } }); // Mocking an update in place, actually sqlite is append only, but StreamPoller handles it by step idx!
		// Wait, in real sqlite agy appends a new row with the SAME idx to update agent text! Let's mock that.
		appendStep("dedup", 0, 15, { agentText: { text: "hi there" } });

		const updates2 = poller.poll();
		expect(updates2.length).toBe(1);
		expect(updates2[0].sessionUpdate).toBe("agent_message_chunk");
		expect((updates2[0] as any).content.text).toBe(" there"); // Delta!

		poller.close();
	});
});
