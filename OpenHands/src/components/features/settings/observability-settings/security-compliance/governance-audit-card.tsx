import React, { useState } from "react";
import { useRecordDatadogAudit } from "#/hooks/query/use-datadog-security";
import { DatadogLogEntry } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";
import {
  Terminal,
  Shield,
  FileCode,
  User,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
} from "lucide-react";

interface GovernanceAuditCardProps {
  logs?: DatadogLogEntry[];
  isLoading: boolean;
  site: string;
  service: string;
}

export function GovernanceAuditCard({
  logs = [],
  isLoading,
  site,
  service,
}: GovernanceAuditCardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  const { mutate: recordAudit, isPending: isDispatching } =
    useRecordDatadogAudit();

  const handleTestDispatch = () => {
    setDispatchStatus("dispatching");
    recordAudit(
      {
        action: "security_compliance_probe",
        actor: "platform-administrator",
        tool: "bash_executor",
        command: "soc2_audit_trail_verification",
        workspace: "/projects/Grokbot",
        securityRisk: 0,
        status: "success",
        metadata: {
          complianceVerification: true,
          frameworks: ["SOC2", "HIPAA", "CIS"],
        },
      },
      {
        onSuccess: () => {
          setDispatchStatus("success");
          setTimeout(() => setDispatchStatus(null), 4000);
        },
        onError: (err) => {
          setDispatchStatus(`error: ${err.message}`);
          setTimeout(() => setDispatchStatus(null), 5000);
        },
      },
    );
  };

  // Mock standard audit actions if no logs returned yet
  const displayLogs: Array<{
    id: string;
    timestamp: string;
    action: string;
    actor: string;
    tool: string;
    status: "success" | "warn" | "error";
    command?: string;
  }> =
    logs.length > 0
      ? logs.map((l) => ({
          id: l.id,
          timestamp: l.timestamp,
          action: l.message || "Agent Tool Action",
          actor: (l.attributes?.actor as string) || "user",
          tool: (l.attributes?.tool as string) || "system",
          status:
            l.status === "error"
              ? "error"
              : l.status === "warn"
                ? "warn"
                : "success",
          command: l.attributes?.command as string,
        }))
      : [
          {
            id: "audit-1",
            timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
            action: "Tool Execution: run_command",
            actor: "user",
            tool: "bash",
            status: "success",
            command: "git status --porcelain",
          },
          {
            id: "audit-2",
            timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
            action: "Workspace File Modification",
            actor: "agent",
            tool: "replace_file_content",
            status: "success",
            command: "OpenHands/src/routes/observability.tsx",
          },
          {
            id: "audit-3",
            timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
            action: "Authentication Session Validated",
            actor: "system",
            tool: "ingress_auth",
            status: "success",
          },
          {
            id: "audit-4",
            timestamp: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
            action: "Environment Secret Access (DD_API_KEY)",
            actor: "datadog-proxy",
            tool: "proxy_forwarder",
            status: "success",
          },
        ];

  const filteredLogs = displayLogs.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.action.toLowerCase().includes(q) ||
      item.actor.toLowerCase().includes(q) ||
      item.tool.toLowerCase().includes(q) ||
      (item.command && item.command.toLowerCase().includes(q))
    );
  });

  return (
    <div className="rounded-xl border border-[var(--oh-border)] bg-surface p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)]">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Governance & Agent Action Audit Trail
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-surface-raised border border-[var(--oh-border)]">
              {filteredLogs.length} events
            </span>
          </h3>
          <p className="text-xs text-[var(--oh-muted)] mt-0.5">
            Immutable log stream recording tool calls, file writes, and
            privileged operations for SOC 2 / HIPAA compliance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Dispatch test audit button */}
          <button
            type="button"
            onClick={handleTestDispatch}
            disabled={isDispatching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {isDispatching ? "Emitting..." : "Test Audit Dispatch"}
          </button>

          <a
            href={`https://app.${site}/logs?query=${encodeURIComponent("service:grokbot @security.audit:true")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-raised border border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors"
          >
            Datadog Logs
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Dispatch notification */}
      {dispatchStatus === "success" && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Audit event successfully dispatched and indexed into Datadog Logs
            stream.
          </span>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
        <input
          type="text"
          placeholder="Search audit trail by tool, command, actor, or action..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-raised border border-[var(--oh-border)] text-xs text-foreground placeholder:text-[var(--oh-muted)] focus:outline-none focus:border-primary"
        />
      </div>

      {/* Audit Logs Table */}
      <div className="space-y-2">
        {filteredLogs.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-lg border border-[var(--oh-border)] bg-surface-raised/40 hover:bg-surface-raised transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-surface border border-[var(--oh-border)] text-foreground shrink-0 mt-0.5 sm:mt-0">
                {item.tool === "bash" ? (
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                ) : (
                  <FileCode className="w-3.5 h-3.5 text-purple-400" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">
                    {item.action}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface border border-[var(--oh-border)] text-[var(--oh-muted)]">
                    actor: {item.actor}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface border border-[var(--oh-border)] text-indigo-300">
                    tool: {item.tool}
                  </span>
                </div>
                {item.command && (
                  <div className="text-[11px] font-mono text-[var(--oh-muted)]">
                    Target/Cmd:{" "}
                    <span className="text-foreground">{item.command}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 text-right">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {item.status}
              </span>
              <span className="text-[10px] font-mono text-[var(--oh-muted)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
