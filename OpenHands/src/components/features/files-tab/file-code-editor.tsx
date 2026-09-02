/* eslint-disable i18next/no-literal-string */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor, type Monaco } from "@monaco-editor/react";
import { editor as editor_t } from "monaco-editor";

import { useSaveWorkspaceFile } from "#/hooks/mutation/use-workspace-file-mutations";
import { getLanguageFromPath } from "#/utils/get-language-from-path";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useFilesTabStore } from "#/stores/files-tab-store";

interface FileCodeEditorProps {
  path: string;
  initialContent: string;
  onSave?: (savedPath: string) => void;
}

const EDITOR_OPTIONS: editor_t.IEditorOptions = {
  renderValidationDecorations: "off",
  readOnly: false,
  scrollBeyondLastLine: false,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollbar: { alwaysConsumeMouseWheel: false },
  fontSize: 13,
  lineHeight: 20,
  wordWrap: "off",
  cursorBlinking: "smooth",
  smoothScrolling: true,
  bracketPairColorization: { enabled: true },
};

export function FileCodeEditor({
  path,
  initialContent,
  onSave,
}: FileCodeEditorProps) {
  const [content, setContent] = useState(initialContent);
  const saveMutation = useSaveWorkspaceFile();
  const setFileDirty = useFilesTabStore((s) => s.setFileDirty);
  const setCursorPosition = useFilesTabStore((s) => s.setCursorPosition);
  const editorRef = useRef<editor_t.IStandaloneCodeEditor | null>(null);

  // Reset content when path or initialContent changes from outside
  useEffect(() => {
    setContent(initialContent);
    setFileDirty(path, false);
  }, [path, initialContent, setFileDirty]);

  const isDirty = content !== initialContent;

  useEffect(() => {
    setFileDirty(path, isDirty);
  }, [path, isDirty, setFileDirty]);

  const handleSave = useCallback(async () => {
    if (!isDirty || saveMutation.isPending) return;
    await saveMutation.mutateAsync({ path, content });
    setFileDirty(path, false);
    onSave?.(path);
  }, [isDirty, saveMutation, path, content, setFileDirty, onSave]);

  const handleReset = () => {
    setContent(initialContent);
    setFileDirty(path, false);
  };

  // Keyboard shortcut: Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  const language = getLanguageFromPath(path);

  const handleBeforeMount = (monaco: Monaco) => {
    monaco.editor.defineTheme("grokbot-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#141414",
        "editor.lineHighlightBackground": "#1e1e1e",
        "editorGutter.background": "#141414",
      },
    });
  };

  const handleOnMount = (editor: editor_t.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    const pos = editor.getPosition();
    if (pos) {
      setCursorPosition({ line: pos.lineNumber, column: pos.column });
    }

    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#141414] min-h-0">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-[var(--oh-border)] bg-[var(--oh-surface)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-white truncate">{path}</span>
          {isDirty && (
            <span
              data-testid="editor-unsaved-badge"
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0"
            >
              ● Unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <BrandButton
              type="button"
              variant="tertiary"
              className="px-2.5 py-1 text-xs h-auto min-h-0"
              onClick={handleReset}
              isDisabled={saveMutation.isPending}
              testId="editor-discard-button"
            >
              Discard
            </BrandButton>
          )}
          <BrandButton
            type="button"
            variant="primary"
            className="px-2.5 py-1 text-xs h-auto min-h-0"
            onClick={handleSave}
            isDisabled={!isDirty || saveMutation.isPending}
            testId="editor-save-button"
          >
            {saveMutation.isPending ? (
              <LoadingSpinner size="small" />
            ) : (
              <span>Save (⌘S)</span>
            )}
          </BrandButton>
        </div>
      </div>

      {/* Editor canvas */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          path={path}
          language={language}
          value={content}
          onChange={(val) => setContent(val ?? "")}
          theme="grokbot-dark"
          beforeMount={handleBeforeMount}
          onMount={handleOnMount}
          options={EDITOR_OPTIONS}
        />
      </div>
    </div>
  );
}
