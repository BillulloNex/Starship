import React from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { ChatInputContainer } from "#/components/features/chat/components/chat-input-container";

function Harness({ isAgentProcessing }: { isAgentProcessing: boolean }) {
  const chatContainerRef = React.useRef<HTMLDivElement | null>(null);
  const chatInputRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <ChatInputContainer
      chatContainerRef={chatContainerRef}
      chatInputRef={chatInputRef}
      isDragOver={false}
      isAgentProcessing={isAgentProcessing}
      disabled={false}
      canSubmit={false}
      showButton={false}
      buttonClassName=""
      handleFileIconClick={vi.fn()}
      handleSubmit={vi.fn()}
      onDragOver={vi.fn()}
      onDragLeave={vi.fn()}
      onDrop={vi.fn()}
      onInput={vi.fn()}
      onPaste={vi.fn()}
      onKeyDown={vi.fn()}
    />
  );
}

describe("ChatInputContainer processing indicator", () => {
  it("shows the rainbow edge while the agent is processing", () => {
    renderWithProviders(<Harness isAgentProcessing />);

    const shell = screen.getByTestId("chat-input-shell");
    expect(shell).toHaveAttribute("data-agent-processing", "true");
    expect(shell).toHaveClass("chat-input-processing-border");
  });

  it("removes the rainbow edge when the agent is idle", () => {
    renderWithProviders(<Harness isAgentProcessing={false} />);

    const shell = screen.getByTestId("chat-input-shell");
    expect(shell).not.toHaveAttribute("data-agent-processing");
    expect(shell).not.toHaveClass("chat-input-processing-border");
  });
});
