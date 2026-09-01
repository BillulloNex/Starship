import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Code2,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Sparkles,
  Server,
  Terminal,
  Globe,
} from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useAddMcpServer } from "#/hooks/mutation/use-add-mcp-server";
import { useUpdateMcpServer } from "#/hooks/mutation/use-update-mcp-server";
import type { MCPServerConfig } from "#/types/mcp-server";
import {
  parseRawMcpJson,
  type ParsedMcpServerItem,
} from "#/utils/mcp-json-parser";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

const SAMPLE_MCP_JSON = `{
  "mcpServers": {
    "weather": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN_HERE"
      }
    },
    "remote-api": {
      "url": "https://mcp.example.com/sse",
      "transport": "sse"
    }
  }
}`;

interface McpJsonImportModalProps {
  existingServers: MCPServerConfig[];
  onClose: () => void;
}

export function McpJsonImportModal({
  existingServers,
  onClose,
}: McpJsonImportModalProps) {
  const { t } = useTranslation("openhands");
  const [jsonText, setJsonText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(true);

  const { mutateAsync: addServer } = useAddMcpServer();
  const { mutateAsync: updateServer } = useUpdateMcpServer();

  const parseResult = useMemo(() => {
    if (!jsonText.trim()) return null;
    return parseRawMcpJson(jsonText);
  }, [jsonText]);

  const existingNameSet = useMemo(
    () =>
      new Set(
        existingServers.map((s) => (s.name || s.id || "").toLowerCase()),
      ),
    [existingServers],
  );

  const handleFormatJson = () => {
    try {
      if (!jsonText.trim()) return;
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      // Ignore format errors if invalid
    }
  };

  const handleInsertTemplate = () => {
    setJsonText(SAMPLE_MCP_JSON);
  };

  const handleImport = async () => {
    if (!parseResult || !parseResult.success || parseResult.servers.length === 0)
      return;

    setIsSubmitting(true);
    let importedCount = 0;
    const errors: string[] = [];

    for (const item of parseResult.servers) {
      if (!item.isValid) continue;

      const serverName = item.name.toLowerCase();
      const existingMatch = existingServers.find(
        (s) => (s.name || s.id || "").toLowerCase() === serverName,
      );

      try {
        if (existingMatch && overwriteExisting) {
          await updateServer({
            serverId: existingMatch.id,
            server: { ...item.config, id: existingMatch.id },
          });
        } else {
          await addServer(item.config);
        }
        importedCount += 1;
      } catch (err: any) {
        errors.push(`${item.name}: ${err?.message || "Failed to save"}`);
      }
    }

    setIsSubmitting(false);

    if (importedCount > 0) {
      displaySuccessToast(
        `Successfully imported and configured ${importedCount} MCP server(s)!`,
      );
      onClose();
    }

    if (errors.length > 0) {
      displayErrorToast(`Some servers failed to import: ${errors.join(", ")}`);
    }
  };

  const validCount = parseResult?.servers.filter((s) => s.isValid).length || 0;

  return (
    <ModalBackdrop
      onClose={isSubmitting ? undefined : onClose}
      closeOnEscape={!isSubmitting}
      aria-label="Paste MCP JSON"
    >
      <div
        data-testid="mcp-json-import-modal"
        className="relative bg-base-secondary p-6 rounded-2xl border border-[var(--oh-border)] w-[620px] max-w-[94vw] max-h-[90vh] flex flex-col gap-4 overflow-hidden shadow-2xl"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="mcp-json-import-close"
          disabled={isSubmitting}
        />

        {/* Modal Header */}
        <div className="flex items-center gap-3 pr-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Code2 className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">
              Paste Pure MCP JSON
            </h2>
            <p className="text-xs text-[var(--oh-muted)]">
              Import from Claude Desktop, Cursor, Antigravity, or standard{" "}
              <span className="font-mono text-sky-400">mcpServers</span> config
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--oh-border)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInsertTemplate}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              <Sparkles className="size-3" />
              <span>Load Template</span>
            </button>
            <span className="text-[var(--oh-muted)] text-[10px]">•</span>
            <button
              type="button"
              onClick={handleFormatJson}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--oh-muted)] hover:text-foreground transition-colors cursor-pointer"
            >
              <FileCode className="size-3" />
              <span>Format JSON</span>
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-[var(--oh-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              className="size-3.5 rounded border-[var(--oh-border)] accent-sky-500 cursor-pointer"
            />
            <span>Overwrite matching names</span>
          </label>
        </div>

        {/* Monospace JSON Textarea */}
        <div className="relative flex-1 min-h-[180px] max-h-[260px] flex flex-col">
          <textarea
            data-testid="mcp-raw-json-input"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={`{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-name"]\n    }\n  }\n}`}
            className="w-full h-full resize-none rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3.5 font-mono text-xs text-foreground placeholder:text-[var(--oh-muted)]/50 focus:border-sky-500 focus:outline-none custom-scrollbar"
            spellCheck={false}
          />
        </div>

        {/* Validation & Detected Servers Section */}
        {parseResult && (
          <div className="space-y-2.5 max-h-[160px] overflow-y-auto custom-scrollbar">
            {parseResult.error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>{parseResult.error}</span>
              </div>
            )}

            {parseResult.servers.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[var(--oh-muted)] font-medium">
                  <span>Detected MCP Servers ({validCount})</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {parseResult.servers.map((srv) => {
                    const isExisting = existingNameSet.has(
                      srv.name.toLowerCase(),
                    );
                    return (
                      <div
                        key={srv.id}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-3 py-2 text-xs",
                          srv.isValid
                            ? "border-[var(--oh-border)] bg-[var(--oh-surface)]"
                            : "border-red-500/30 bg-red-500/5 text-red-400",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {srv.config.type === "stdio" ? (
                            <Terminal className="size-3.5 text-sky-400 shrink-0" />
                          ) : (
                            <Globe className="size-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span className="font-semibold text-foreground truncate">
                            {srv.name}
                          </span>
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase font-mono text-[var(--oh-muted)]">
                            {srv.config.type}
                          </span>
                          {srv.config.command && (
                            <span className="font-mono text-[11px] text-[var(--oh-muted)] truncate max-w-[180px]">
                              {srv.config.command}{" "}
                              {srv.config.args?.join(" ")}
                            </span>
                          )}
                          {srv.config.url && (
                            <span className="font-mono text-[11px] text-[var(--oh-muted)] truncate max-w-[180px]">
                              {srv.config.url}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isExisting && (
                            <span className="text-[10px] text-amber-400 font-medium">
                              (Exists)
                            </span>
                          )}
                          {srv.isValid ? (
                            <CheckCircle2 className="size-4 text-emerald-400" />
                          ) : (
                            <span className="text-[10px] text-red-400">
                              {srv.error}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--oh-border)]">
          <BrandButton
            type="button"
            variant="secondary"
            testId="mcp-json-cancel"
            onClick={onClose}
            isDisabled={isSubmitting}
          >
            {t("CANCEL", "Cancel")}
          </BrandButton>

          <BrandButton
            type="button"
            variant="primary"
            testId="mcp-json-import-submit"
            onClick={handleImport}
            isDisabled={isSubmitting || validCount === 0}
          >
            {isSubmitting
              ? "Importing..."
              : `Import ${validCount > 0 ? `${validCount} ` : ""}Server(s)`}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}
