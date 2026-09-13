import { lazy } from "react";
import { LazyPanel } from "./lazy-panel";

const WorkbenchTerminalPanel = lazy(() =>
  import("../terminal/workbench-terminal-panel").then((module) => ({
    default: module.WorkbenchTerminalPanel,
  })),
);

export function TerminalPanel() {
  return (
    <LazyPanel>
      <WorkbenchTerminalPanel />
    </LazyPanel>
  );
}
