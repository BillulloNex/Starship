import { create } from "zustand";
import type { AgentPhase } from "#/hooks/use-agent-phase-class";

interface AgentPhaseStore {
  /** CSS class name for the current agent phase glow (null = no glow). */
  phaseClass: AgentPhase;
  setPhaseClass: (phase: AgentPhase) => void;
}

/**
 * Tiny store so the computed agent-phase CSS class (determined inside
 * ChatInterface) can be read by ancestors higher in the tree — specifically
 * ConversationMain which owns the full-width chat pane background.
 */
export const useAgentPhaseStore = create<AgentPhaseStore>((set) => ({
  phaseClass: null,
  setPhaseClass: (phase) => set({ phaseClass: phase }),
}));
