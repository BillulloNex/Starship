import type { Monaco } from "@monaco-editor/react";
import type {
  editor,
  IDisposable,
  IPosition,
  IRange,
  Position,
  Uri,
} from "monaco-editor";
import { searchWorkspace } from "#/api/runtime-service/workspace-search.service";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "./document-registry";
import { getDocumentUri } from "./documents";
import { buildDefinitionSearch, rankDefinitions } from "./definition-search";

export interface LanguageFeatureRuntime {
  workspaceKey: string;
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string | undefined;
}

let runtime: LanguageFeatureRuntime | null = null;

/** Points the language features at the workspace currently on screen. */
export function setLanguageFeatureRuntime(next: LanguageFeatureRuntime | null) {
  runtime = next;
  definitionCache.clear();
}

const DEFINITION_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "ruby",
];
const CACHE_TTL_MS = 30_000;
const definitionCache = new Map<
  string,
  {
    at: number;
    result: Promise<{ path: string; line: number; column: number } | null>;
  }
>();

function parseDocumentUri(uri: { path: string }) {
  const [, encodedKey, ...rest] = uri.path.split("/");
  if (!encodedKey || rest.length === 0) return null;
  return { workspaceKey: decodeURIComponent(encodedKey), path: rest.join("/") };
}

function findDefinition(symbol: string, currentPath: string) {
  const key = `${symbol} ${currentPath}`;
  const cached = definitionCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const options = buildDefinitionSearch(symbol);
  const target = runtime;
  const result =
    options && target
      ? searchWorkspace(
          target.conversationUrl,
          target.sessionApiKey,
          target.workingDir,
          options,
        )
          .then(({ matches }) => {
            const [best] = rankDefinitions(matches, currentPath);
            if (!best) return null;
            const column = best.text.indexOf(symbol) + 1;
            return {
              path: best.path,
              line: best.line,
              column: Math.max(column, 1),
            };
          })
          .catch(() => null)
      : Promise.resolve(null);

  definitionCache.set(key, { at: Date.now(), result });
  return result;
}

let registered = false;

/**
 * Registers editor features that need the workspace: search-based go to
 * definition (⌘-click / F12), and opening other files from the editor.
 * Safe to call on every editor mount.
 */
export function registerLanguageFeatures(monaco: Monaco): IDisposable[] {
  if (registered) return [];
  registered = true;

  const definitions = monaco.languages.registerDefinitionProvider(
    DEFINITION_LANGUAGES,
    {
      provideDefinition: async (
        model: editor.ITextModel,
        position: Position,
      ) => {
        const word = model.getWordAtPosition(position);
        const current = parseDocumentUri(model.uri);
        if (!word || !current || !runtime) return null;
        if (current.workspaceKey !== runtime.workspaceKey) return null;

        const found = await findDefinition(word.word, current.path);
        if (!found) return null;
        // Already on the declaration: nothing to jump to.
        if (found.path === current.path && found.line === position.lineNumber) {
          return null;
        }
        return {
          uri: getDocumentUri(monaco, runtime.workspaceKey, found.path),
          range: {
            startLineNumber: found.line,
            startColumn: found.column,
            endLineNumber: found.line,
            endColumn: found.column + word.word.length,
          },
        };
      },
    },
  );

  // Monaco only knows how to navigate within the open model; opening another
  // file goes through the workbench so it gets a tab and a document.
  const opener = monaco.editor.registerEditorOpener({
    openCodeEditor: (
      _source: editor.ICodeEditor,
      resource: Uri,
      selectionOrPosition?: IRange | IPosition,
    ) => {
      const target = parseDocumentUri(resource);
      if (!target) return false;
      let line = 1;
      let column = 1;
      if (selectionOrPosition && "lineNumber" in selectionOrPosition) {
        line = selectionOrPosition.lineNumber;
        column = selectionOrPosition.column;
      } else if (
        selectionOrPosition &&
        "startLineNumber" in selectionOrPosition
      ) {
        line = selectionOrPosition.startLineNumber;
        column = selectionOrPosition.startColumn;
      }
      useFilesTabStore
        .getState()
        .setSelectedPath(target.path, target.workspaceKey);
      useWorkbenchStore
        .getState()
        .setPendingReveal({ path: target.path, line, column, length: 0 });
      return true;
    },
  });

  return [definitions, opener];
}

/** Exposed for the status bar: problems on a document, by severity. */
export function countProblems(
  monaco: Monaco,
  workspaceKey: string,
  path: string,
): { errors: number; warnings: number } {
  const model = workbenchDocuments.getModel(workspaceKey, path);
  if (!model) return { errors: 0, warnings: 0 };
  const markers = monaco.editor.getModelMarkers({ resource: model.uri });
  return {
    errors: markers.filter(
      (marker: editor.IMarker) =>
        marker.severity === monaco.MarkerSeverity.Error,
    ).length,
    warnings: markers.filter(
      (marker: editor.IMarker) =>
        marker.severity === monaco.MarkerSeverity.Warning,
    ).length,
  };
}
