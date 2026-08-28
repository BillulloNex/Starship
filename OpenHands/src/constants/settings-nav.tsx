import { AppWindow, Brain, Fuel, Shield } from "lucide-react";
import KeyIcon from "#/icons/key.svg?react";
import MemoryIcon from "#/icons/memory_icon.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";
import RobotIcon from "#/icons/u-robot.svg?react";
import ServerProcessIcon from "#/icons/server-process.svg?react";
import SkillsIcon from "#/icons/skills.svg?react";

export interface SettingsNavItem {
  icon: React.ReactElement;
  to: string;
  text: string;
  /** Short grey subline under the page title (`settings.tsx`). */
  subtitle: string;
}

export const OSS_NAV_ITEMS: SettingsNavItem[] = [
  {
    // "Agent" is the Agent Profile library: it lists the user's agent profiles
    // and its create/edit view is the reused Agent settings form plus a name.
    // The active profile is the current agent (#1571). Replaces the old split
    // of a global "Agent" form + a separate "Agent profiles" library.
    icon: <RobotIcon width={16} height={16} />,
    to: "/settings/agents",
    text: "SETTINGS$NAV_AGENT",
    subtitle: "SETTINGS$PAGE_AGENT_PROFILES_SUBLINE",
  },
  {
    icon: <CircuitIcon width={16} height={16} />,
    to: "/settings/llm",
    text: "SETTINGS$NAV_LLM",
    subtitle: "SETTINGS$PAGE_LLM_SUBLINE",
  },
  {
    icon: <MemoryIcon width={16} height={16} />,
    to: "/settings/condenser",
    text: "SETTINGS$NAV_CONDENSER",
    subtitle: "SETTINGS$PAGE_CONDENSER_SUBLINE",
  },
  {
    // The agent's ``agent_context`` section, whatever the schema exposes in it
    // — today only persistent memory (``agent_context.load_memory``). Not
    // ``disabledByAcp``: the stored flag rides the shared agent_settings
    // record into ACP conversations too — inline launches spread it into
    // ``agent_context``, and profile launches (the normal ACP path) have the
    // agent-server stamp it onto the profile-resolved agent.
    icon: <Brain className="size-4" strokeWidth={2} aria-hidden />,
    to: "/settings/agent-context",
    text: "SETTINGS$NAV_AGENT_CONTEXT",
    subtitle: "SETTINGS$PAGE_AGENT_CONTEXT_SUBLINE",
  },
  {
    icon: <KeyIcon width={16} height={16} />,
    to: "/settings/secrets",
    text: "SETTINGS$NAV_SECRETS",
    subtitle: "SETTINGS$PAGE_SECRETS_SUBLINE",
  },
  {
    icon: <ServerProcessIcon width={16} height={16} />,
    to: "/settings/mcp",
    text: "SETTINGS$NAV_MCP",
    subtitle: "SETTINGS$MCP_DESCRIPTION",
  },
  {
    icon: <SkillsIcon width={16} height={16} aria-hidden="true" />,
    to: "/settings/skills",
    text: "SETTINGS$NAV_SKILLS",
    subtitle: "SETTINGS$SKILLS_PAGE_DESCRIPTION",
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width={16}
        height={16}
        aria-hidden="true"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
    to: "/settings/plugins",
    text: "SETTINGS$NAV_PLUGINS",
    subtitle: "SETTINGS$PLUGINS_DESCRIPTION",
  },
  {
    icon: <Shield className="size-4" strokeWidth={2} aria-hidden />,
    to: "/settings/verification",
    text: "SETTINGS$NAV_VERIFICATION",
    subtitle: "SETTINGS$PAGE_VERIFICATION_SUBLINE",
  },
  {
    icon: <Fuel className="size-4" strokeWidth={2} aria-hidden />,
    to: "/settings/fuel-gauge",
    text: "SETTINGS$NAV_FUEL_GAUGE",
    subtitle: "SETTINGS$PAGE_FUEL_GAUGE_SUBLINE",
  },
  {
    icon: <AppWindow className="size-4" strokeWidth={2} aria-hidden />,
    to: "/settings/app",
    text: "SETTINGS$NAV_APPLICATION",
    subtitle: "SETTINGS$PAGE_APPLICATION_SUBLINE",
  },
];
