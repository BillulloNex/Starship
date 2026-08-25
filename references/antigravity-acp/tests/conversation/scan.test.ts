// @ts-nocheck
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	conversationSnapshot,
	newConversationId,
} from "../../src/conversation/scan";

describe("conversation/scan", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-scan-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test("conversationSnapshot returns set of db stems", () => {
		fs.writeFileSync(path.join(tempDir, "a.db"), "");
		fs.writeFileSync(path.join(tempDir, "b.db"), "");
		fs.writeFileSync(path.join(tempDir, "c.txt"), ""); // should be ignored

		const snapshot = conversationSnapshot(tempDir);
		expect(snapshot.size).toBe(2);
		expect(snapshot.has("a")).toBe(true);
		expect(snapshot.has("b")).toBe(true);
		expect(snapshot.has("c")).toBe(false);
	});

	test("conversationSnapshot handles empty directory", () => {
		const snapshot = conversationSnapshot(tempDir);
		expect(snapshot.size).toBe(0);
	});

	test("conversationSnapshot handles missing directory by returning empty set", () => {
		const snapshot = conversationSnapshot(path.join(tempDir, "nonexistent"));
		expect(snapshot.size).toBe(0);
	});

	test("newConversationId returns newly created db", () => {
		fs.writeFileSync(path.join(tempDir, "a.db"), "");
		const before = conversationSnapshot(tempDir);

		fs.writeFileSync(path.join(tempDir, "b.db"), "");
		const newId = newConversationId(tempDir, before);
		expect(newId).toBe("b");
	});

	test("newConversationId returns null if no new db", () => {
		fs.writeFileSync(path.join(tempDir, "a.db"), "");
		const before = conversationSnapshot(tempDir);

		const newId = newConversationId(tempDir, before);
		expect(newId).toBeNull();
	});

	test("newConversationId returns null and logs error if multiple new dbs", () => {
		const errorMock = mock(() => {});
		const originalError = console.error;
		console.error = errorMock;

		fs.writeFileSync(path.join(tempDir, "a.db"), "");
		const before = conversationSnapshot(tempDir);

		fs.writeFileSync(path.join(tempDir, "b.db"), "");
		fs.writeFileSync(path.join(tempDir, "c.db"), "");

		const newId = newConversationId(tempDir, before);
		expect(newId).toBeNull();
		expect(errorMock).toHaveBeenCalled();
		expect(errorMock.mock.calls[0][0]).toContain(
			"multiple new agy conversation files appeared",
		);

		console.error = originalError;
	});
});
