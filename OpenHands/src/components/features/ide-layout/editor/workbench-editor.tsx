import React from "react";
import { Editor, type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { workbenchDocuments } from "../workbench/document-registry";
import { useWorkbenchSave } from "../workbench/use-workbench-save";

const EDITOR_THEME = "grokbot-workbench";

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fixedOverflowWidgets: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  lineHeight: 20,
  padding: { top: 6 },
  smoothScrolling: true,
  cursorBlinking: "smooth",
  bracketPairColorization: { enabled: true },
  stickyScroll: { enabled: false },
  renderWhitespace: "selection",
  wordWrap: "off",
  scrollbar: {
    alwaysConsumeMouseWheel: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
  // Only syntax diagnostics are enabled (see configureMonaco), so squiggles
  // never flag imports the in-browser checker can't resolve.
  renderValidationDecorations: "on",
};

let languageDefaultsConfigured = false;

function configureMonaco(monaco: Monaco) {
  monaco.editor.defineTheme(EDITOR_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#141414",
      "editor.lineHighlightBackground": "#1c1c1c",
      "editorGutter.background": "#141414",
    },
  });

  if (languageDefaultsConfigured) return;
  languageDefaultsConfigured = true;

  const ts = monaco.typescript;
  if (!ts) return;
  const diagnostics = {
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  };
  [ts.typescriptDefaults, ts.javascriptDefaults].forEach((defaults) => {
    defaults.setDiagnosticsOptions(diagnostics);
    defaults.setCompilerOptions({
      ...defaults.getCompilerOptions(),
      allowJs: true,
      allowNonTsExtensions: true,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
    });
  });
}

function publishModelInfo(monaco: Monaco, model: editor.ITextModel | null) {
  const { setActiveModelInfo } = useWorkbenchStore.getState();
  if (!model) {
    setActiveModelInfo(null);
    return;
  }
  const languageId = model.getLanguageId();
  const alias = monaco.languages
    .getLanguages()
    .find(
      (language: { id: string; aliases?: string[] }) =>
        language.id === languageId,
    )?.aliases?.[0];
  const options = model.getOptions();
  setActiveModelInfo({
    language: alias ?? languageId,
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces,
    eol: model.getEOL() === "\r\n" ? "CRLF" : "LF",
  });
}

interface WorkbenchEditorProps {
  path: string | null;
  /** Current disk content of `path`, or `null` while it is being read. */
  diskText: string | null;
}

/**
 * The IDE's single Monaco editor. It stays mounted and swaps text models
 * as tabs change, so each file keeps its undo history, cursor, and scroll
 * position. Unsaved edits are autosaved when focus leaves the editor.
 */
export function WorkbenchEditor({ path, diskText }: WorkbenchEditorProps) {
  const { workspaceKey } = useWorkspaceRuntime();
  const save = useWorkbenchSave();
  const setCursorPosition = useFilesTabStore((s) => s.setCursorPosition);

  const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = React.useRef<Monaco | null>(null);
  const [isMounted, setIsMounted] = React.useState(false);

  const saveRef = React.useRef(save);
  const workspaceKeyRef = React.useRef(workspaceKey);
  React.useEffect(() => {
    saveRef.current = save;
    workspaceKeyRef.current = workspaceKey;
  }, [save, workspaceKey]);

  const saveCurrentIfDirty = React.useCallback(() => {
    const key = workspaceKeyRef.current;
    const currentPath = workbenchDocuments.getPathForModel(
      editorRef.current?.getModel() ?? null,
    );
    if (key && currentPath && workbenchDocuments.isDirty(key, currentPath)) {
      saveRef.current(currentPath);
    }
  }, []);

  const handleMount = React.useCallback(
    (instance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = instance;
      monacoRef.current = monaco;
      useWorkbenchStore.getState().setEditor(instance);

      instance.onDidChangeCursorPosition((event) => {
        setCursorPosition({
          line: event.position.lineNumber,
          column: event.position.column,
        });
      });
      instance.onDidBlurEditorWidget(saveCurrentIfDirty);
      // In the IDE the workbench keybindings handle ⌘S before it reaches the
      // editor; this covers the editor when it's embedded in the Files tab.
      instance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        saveCurrentIfDirty,
      );
      instance.onDidChangeModelOptions(() =>
        publishModelInfo(monaco, instance.getModel()),
      );
      instance.onDidChangeModelLanguage(() =>
        publishModelInfo(monaco, instance.getModel()),
      );

      setIsMounted(true);
    },
    [setCursorPosition, saveCurrentIfDirty],
  );

  React.useEffect(
    () => () => {
      const instance = editorRef.current;
      const key = workspaceKeyRef.current;
      if (instance && key) {
        const currentPath = workbenchDocuments.getPathForModel(
          instance.getModel(),
        );
        if (currentPath) {
          workbenchDocuments.saveViewState(
            key,
            currentPath,
            instance.saveViewState(),
          );
        }
      }
      saveCurrentIfDirty();
      useWorkbenchStore.getState().setEditor(null);
      useWorkbenchStore.getState().setActiveModelInfo(null);
    },
    [saveCurrentIfDirty],
  );

  React.useEffect(() => {
    const instance = editorRef.current;
    const monaco = monacoRef.current;
    if (!isMounted || !instance || !monaco || !workspaceKey || !path) return;

    if (diskText !== null) {
      workbenchDocuments.sync(monaco, workspaceKey, path, diskText);
    }

    const model = workbenchDocuments.getModel(workspaceKey, path);
    const current = instance.getModel();
    if (!model || model === current) return;

    const previousPath = workbenchDocuments.getPathForModel(current);
    if (previousPath) {
      workbenchDocuments.saveViewState(
        workspaceKey,
        previousPath,
        instance.saveViewState(),
      );
    }
    instance.setModel(model);
    const viewState = workbenchDocuments.getViewState(workspaceKey, path);
    if (viewState) instance.restoreViewState(viewState);
    const position = instance.getPosition();
    setCursorPosition(
      position ? { line: position.lineNumber, column: position.column } : null,
    );
    publishModelInfo(monaco, model);
  }, [isMounted, workspaceKey, path, diskText, setCursorPosition]);

  return (
    <div className="h-full w-full" data-testid="workbench-editor">
      <Editor
        height="100%"
        theme={EDITOR_THEME}
        options={EDITOR_OPTIONS}
        beforeMount={configureMonaco}
        onMount={handleMount}
        keepCurrentModel
        loading={null}
      />
    </div>
  );
}
