import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPENCODE_ACP_PREWARM_ENTRY } from "#/hooks/use-opencode-acp-prewarm";

const createConversation = vi.fn();
const useActiveAcpProfileDetail = vi.fn();
const useSettings = vi.fn();

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({ mutateAsync: createConversation }),
}));

vi.mock("#/hooks/query/use-active-acp-profile-detail", () => ({
  useActiveAcpProfileDetail: () => useActiveAcpProfileDetail(),
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettings(),
}));

describe("useOpencodeAcpPrewarm", () => {
  beforeEach(() => {
    createConversation.mockReset();
    useActiveAcpProfileDetail.mockReturnValue({
      agent_kind: "acp",
      acp_server: "custom",
      acp_command: ["opencode-acp"],
    });
    useSettings.mockReturnValue({ data: undefined });
  });

  it("pre-creates an OpenCode conversation and hands it off once", async () => {
    createConversation.mockResolvedValue({ conversation_id: "conv-warm" });
    const { useOpencodeAcpPrewarm } = await import(
      "#/hooks/use-opencode-acp-prewarm"
    );
    const { result } = renderHook(() =>
      useOpencodeAcpPrewarm({ enabled: true }),
    );

    await waitFor(() =>
      expect(createConversation).toHaveBeenCalledWith({
        entryPoint: OPENCODE_ACP_PREWARM_ENTRY,
        workingDir: undefined,
        workspaceMode: undefined,
        plugins: undefined,
      }),
    );

    let first: string | null = null;
    let second: string | null = null;
    act(() => {
      first = result.current.take({});
      second = result.current.take({});
    });
    expect(first).toBe("conv-warm");
    expect(second).toBeNull();
  });

  it("does not pre-create for non-OpenCode agents", async () => {
    useActiveAcpProfileDetail.mockReturnValue({
      agent_kind: "acp",
      acp_server: "claude-code",
      acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
    });
    const { useOpencodeAcpPrewarm } = await import(
      "#/hooks/use-opencode-acp-prewarm"
    );
    renderHook(() => useOpencodeAcpPrewarm({ enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(createConversation).not.toHaveBeenCalled();
  });
});
