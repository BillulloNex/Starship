import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { SessionManager } from "../../src/acp/sessions";
import { MAX_SESSIONS } from "../../src/constants";
import { SessionStore } from "../../src/store/sessionStore";

describe("SessionManager", () => {
	const tempDir = path.join(process.cwd(), "tmp-sessions-manager");
	const tempFile = path.join(tempDir, "sessions.json");
	let store: SessionStore;
	let manager: SessionManager;

	beforeAll(() => {
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}
	});

	afterAll(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	beforeEach(() => {
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}
		store = new SessionStore(tempFile, tempDir);
		manager = new SessionManager(store);
	});

	test("should create a new session", () => {
		const { sessionId, session } = manager.create("/test/cwd", ["/test/dir"]);
		expect(sessionId).toBeDefined();
		expect(session.cwd).toBe("/test/cwd");
		expect(session.additionalDirs).toEqual(["/test/dir"]);

		const peeked = manager.peek(sessionId);
		expect(peeked).toBe(session);
	});

	test("should persist and ensure a session", async () => {
		const { sessionId, session } = manager.create("/persist/cwd");
		session.modelId = "test-model";

		await manager.persist(sessionId, session);

		// create a new manager to test restoring from disk
		const newManager = new SessionManager(store);

		const peekedBefore = newManager.peek(sessionId);
		expect(peekedBefore).toBeUndefined();

		const restored = await newManager.ensure(sessionId);
		expect(restored).not.toBeNull();
		expect(restored?.cwd).toBe("/persist/cwd");
		expect(restored?.modelId).toBe("test-model");

		const peekedAfter = newManager.peek(sessionId);
		expect(peekedAfter).toBe(restored!);
	});

	test("should adopt a session", () => {
		const sessionData = manager.create("/adopt/cwd").session;
		const customId = "custom-id-123";

		manager.adopt(customId, sessionData);
		const peeked = manager.peek(customId);
		expect(peeked).toBe(sessionData);
	});

	test("should list sessions from store", async () => {
		const { sessionId, session } = manager.create("/list/cwd");
		await manager.persist(sessionId, session);

		const list = await manager.list();
		expect(list).toHaveLength(1);
		expect(list[0]!.sessionId).toBe(sessionId);
		expect(list[0]!.session.cwd).toBe("/list/cwd");
	});

	test("should delete a session from memory and disk", async () => {
		const { sessionId, session } = manager.create("/delete/cwd");
		await manager.persist(sessionId, session);

		const deleted = await manager.delete(sessionId);
		expect(deleted).toBe(true);

		expect(manager.peek(sessionId)).toBeUndefined();

		const list = await manager.list();
		expect(list).toHaveLength(0);
	});

	test("should evict least recently added when reaching MAX_SESSIONS", () => {
		// Just ensure that eviction logic runs without crashing.
		// Testing exact LRU eviction can be tricky, but we can test that size is bounded.
		const createdIds: string[] = [];
		for (let i = 0; i < MAX_SESSIONS + 5; i++) {
			const { sessionId } = manager.create(`/cwd/${i}`);
			createdIds.push(sessionId);
		}

		// The first 5 should have been evicted from memory
		for (let i = 0; i < 5; i++) {
			expect(manager.peek(createdIds[i]!)).toBeUndefined();
		}

		// The last MAX_SESSIONS should still be in memory
		for (let i = 5; i < MAX_SESSIONS + 5; i++) {
			expect(manager.peek(createdIds[i]!)).toBeDefined();
		}
	});
});
