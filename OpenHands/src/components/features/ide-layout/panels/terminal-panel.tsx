import { lazy } from "react";
import { LazyPanel } from "./lazy-panel";

const Terminal = lazy(() => import("#/components/features/terminal/terminal"));

export function TerminalPanel() {
  return (
    <LazyPanel>
      <Terminal />
    </LazyPanel>
  );
}
