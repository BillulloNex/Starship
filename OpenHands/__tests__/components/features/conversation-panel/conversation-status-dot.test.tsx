import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils";
import { ConversationStatusDot } from "#/components/features/conversation-panel/conversation-status-dot";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";

vi.mock("#/components/shared/buttons/styled-tooltip", () => ({
  StyledTooltip: ({
    children,
    content,
  }: {
    children: ReactNode;
    content: string;
  }) => (
    <div data-testid="styled-tooltip" data-content={content}>
      {children}
    </div>
  ),
}));

describe("ConversationStatusDot", () => {
  it.each([
    [ExecutionStatus.RUNNING, "conversation-status-working", "COMMON$WORKING"],
    [ExecutionStatus.ERROR, "conversation-status-error", "COMMON$ERROR"],
    [ExecutionStatus.STUCK, "conversation-status-error", "COMMON$ERROR"],
  ])("renders %s as %s", (status, testId, tooltipLabel) => {
    renderWithProviders(<ConversationStatusDot executionStatus={status} />);

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getByTestId("styled-tooltip")).toHaveAttribute(
      "data-content",
      tooltipLabel,
    );
  });

  it.each([
    [ExecutionStatus.FINISHED],
    [ExecutionStatus.IDLE],
    [ExecutionStatus.PAUSED],
    [ExecutionStatus.WAITING_FOR_CONFIRMATION],
  ])("renders nothing for finished/idle state %s", (status) => {
    const { container } = renderWithProviders(
      <ConversationStatusDot executionStatus={status} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for missing execution status", () => {
    const { container } = renderWithProviders(
      <ConversationStatusDot executionStatus={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

