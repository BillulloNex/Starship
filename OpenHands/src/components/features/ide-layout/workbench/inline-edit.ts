import type { InlineEditTarget } from "#/stores/workbench-store";
import { formatCodeReference } from "./add-to-chat";

/** The chat message that asks the agent to make a scoped edit. */
export function buildInlineEditPrompt(
  target: InlineEditTarget,
  instruction: string,
): string {
  return [
    `Edit ${formatCodeReference(target)}`,
    `Instruction: ${instruction.trim()}`,
    "",
    "Change only this code (and anything that must change with it), then stop.",
  ].join("\n");
}
