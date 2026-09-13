import { lazy } from "react";
import { LazyPanel } from "./lazy-panel";

const GitChanges = lazy(() => import("#/routes/changes-tab"));
const BrowserTab = lazy(() => import("#/routes/browser-tab"));
const TaskListTab = lazy(() => import("#/routes/task-list-tab"));

export function ChangesPanel() {
  return (
    <LazyPanel>
      <GitChanges />
    </LazyPanel>
  );
}

export function WebBrowserPanel() {
  return (
    <LazyPanel>
      <BrowserTab />
    </LazyPanel>
  );
}

export function TasksPanel() {
  return (
    <LazyPanel>
      <TaskListTab />
    </LazyPanel>
  );
}
