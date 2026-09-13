import { useEffect, useRef } from "react";
import { useMonaco } from "@monaco-editor/react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import {
  lintWorkspaceFile,
  lintToolFor,
} from "#/api/runtime-service/workspace-lint.service";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "./document-registry";
import { setLanguageFeatureRuntime } from "./language-features";

const MARKER_OWNER = "grokbot-lint";

/**
 * Runs the project's linter on files as they're opened, saved, or changed
 * on disk, and shows the results as squiggles. Also keeps the editor's
 * workspace-aware language features pointed at the current workspace.
 */
export function useLintDiagnostics() {
  const monaco = useMonaco();
  const { workspaceKey, conversationUrl, sessionApiKey, workingDir } =
    useWorkspaceRuntime();
  const lintRequests = useWorkbenchStore((s) => s.lintRequests);
  const handled = useRef<Record<string, number>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const isCloud = getActiveBackend().backend.kind === "cloud";

  useEffect(() => {
    setLanguageFeatureRuntime(
      workspaceKey
        ? { workspaceKey, conversationUrl, sessionApiKey, workingDir }
        : null,
    );
    return () => setLanguageFeatureRuntime(null);
  }, [workspaceKey, conversationUrl, sessionApiKey, workingDir]);

  useEffect(() => {
    if (!monaco || !workspaceKey || isCloud) return;
    const target = { conversationUrl, sessionApiKey, workingDir };

    const run = async (path: string, version: number) => {
      inFlight.current.add(path);
      handled.current[path] = version;
      try {
        const problems = await lintWorkspaceFile(target, path);
        const model = workbenchDocuments.getModel(workspaceKey, path);
        if (problems && model && !model.isDisposed()) {
          monaco.editor.setModelMarkers(
            model,
            MARKER_OWNER,
            problems.map((problem) => ({
              severity:
                problem.severity === "error"
                  ? monaco.MarkerSeverity.Error
                  : monaco.MarkerSeverity.Warning,
              message: problem.message,
              source: problem.source,
              code: problem.code ?? undefined,
              startLineNumber: problem.line,
              startColumn: problem.column,
              endLineNumber: problem.endLine,
              endColumn: problem.endColumn,
            })),
          );
        }
      } catch {
        // Linting is best-effort; a failed run leaves the last results.
      } finally {
        inFlight.current.delete(path);
        // A save that landed mid-run gets its own pass.
        const latest = useWorkbenchStore.getState().lintRequests[path] ?? 0;
        if (latest > (handled.current[path] ?? 0)) run(path, latest);
      }
    };

    Object.entries(lintRequests).forEach(([path, version]) => {
      if (!lintToolFor(path)) return;
      if (inFlight.current.has(path)) return;
      if ((handled.current[path] ?? 0) >= version) return;
      run(path, version);
    });
  }, [
    monaco,
    lintRequests,
    workspaceKey,
    conversationUrl,
    sessionApiKey,
    workingDir,
    isCloud,
  ]);
}
