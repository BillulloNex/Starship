// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { type AgentContext, methods } from "@agentclientprotocol/sdk";
import { AcpClient } from "../../src/acp/client";

describe("AcpClient", () => {
	test("should correctly structure update via notify", async () => {
		let notifiedMethod = "";
		let notifiedParams: any = null;

		const mockCtx = {
			notify: async (method: string, params: any) => {
				notifiedMethod = method;
				notifiedParams = params;
			},
			request: async () => {},
		} as unknown as AgentContext;

		const client = new AcpClient(mockCtx);
		const dummyUpdate = {
			type: "run_progress" as const,
			status: "running" as const,
			turnId: "t1",
			stepId: "s1",
		};
		await client.update("session-123", dummyUpdate);

		expect(notifiedMethod).toBe(methods.client.session.update);
		expect(notifiedParams).toEqual({
			sessionId: "session-123",
			update: dummyUpdate,
		});
	});

	test("should correctly structure requestPermission", async () => {
		let requestedMethod = "";
		let requestedParams: any = null;
		let requestedOptions: any = null;

		const mockCtx = {
			notify: async () => {},
			request: async (method: string, params: any, options: any) => {
				requestedMethod = method;
				requestedParams = params;
				requestedOptions = options;
				return { result: "ok" };
			},
		} as unknown as AgentContext;

		const client = new AcpClient(mockCtx);

		const dummyPermission = {
			sessionId: "session-123",
			permission: {
				action: "command",
				target: "ls",
			},
		};

		// Test without signal
		const res1 = await client.requestPermission(dummyPermission);
		expect(res1).toEqual({ result: "ok" });
		expect(requestedMethod).toBe(methods.client.session.requestPermission);
		expect(requestedParams).toEqual(dummyPermission);
		expect(requestedOptions).toBeUndefined();

		// Test with signal
		const abortController = new AbortController();
		const res2 = await client.requestPermission(
			dummyPermission,
			abortController.signal,
		);
		expect(res2).toEqual({ result: "ok" });
		expect(requestedOptions).toBeDefined();
		expect(requestedOptions.cancellationSignal).toBe(abortController.signal);
	});
});
