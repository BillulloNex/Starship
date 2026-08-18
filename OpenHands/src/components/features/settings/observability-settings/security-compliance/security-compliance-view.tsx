import React, { useState } from "react";
import {
  useDatadogSecuritySummary,
  useDatadogSecuritySignals,
  useDatadogComplianceFindings,
} from "#/hooks/query/use-datadog-security";
import {
  useDatadogLogs,
  useDatadogStatus,
} from "#/hooks/query/use-datadog-observability";
import { SecurityPostureCard } from "./security-posture-card";
import { SecuritySignalsCard } from "./security-signals-card";
import { ComplianceFrameworksCard } from "./compliance-frameworks-card";
import { GovernanceAuditCard } from "./governance-audit-card";
import { cn } from "#/utils/utils";
import {
  RefreshCw,
  ExternalLink,
  Shield,
  Activity,
  FileCheck2,
  ListFilter,
  CheckCircle2,
} from "lucide-react";

export interface SecurityComplianceViewProps {
  site?: string;
  service?: string;
}

type SecuritySubTab = "all" | "signals" | "compliance" | "audit";

export function SecurityComplianceView({
  site: propSite,
  service: propService,
}: SecurityComplianceViewProps) {
  const [timeframe, setTimeframe] = useState<string>("24h");
  const [autoRefresh, setAutoRefresh] = useState<number | false>(30_000);
  const [activeSubTab, setActiveSubTab] = useState<SecuritySubTab>("all");

  const { data: statusData } = useDatadogStatus();
  const site = propSite || statusData?.site || "us5.datadoghq.com";
  const service = propService || statusData?.service || "grokbot";

  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    isFetching: isFetchingSummary,
    refetch: refetchSummary,
  } = useDatadogSecuritySummary(timeframe, autoRefresh);

  const {
    data: signalsData,
    isLoading: isLoadingSignals,
    refetch: refetchSignals,
  } = useDatadogSecuritySignals(timeframe, undefined, 50, autoRefresh);

  const {
    data: findingsData,
    isLoading: isLoadingFindings,
    refetch: refetchFindings,
  } = useDatadogComplianceFindings("all", autoRefresh);

  const {
    data: auditLogsData,
    isLoading: isLoadingAudit,
    refetch: refetchAudit,
  } = useDatadogLogs(timeframe, undefined, "audit", autoRefresh);

  const handleRefreshAll = () => {
    void refetchSummary();
    void refetchSignals();
    void refetchFindings();
    void refetchAudit();
  };

  const signals = signalsData?.signals || [];
  const findings = findingsData?.findings || [];
  const auditLogs = auditLogsData?.logs || [];

  return (
    <div className="space-y-5">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-[var(--oh-border)] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-raised border border-[var(--oh-border)] text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-foreground">
              Datadog Security & CSM
            </span>
            <span className="text-[10px] text-[var(--oh-muted)]">({site})</span>
          </div>

          <div className="hidden md:flex items-center gap-1 text-xs text-[var(--oh-muted)]">
            <span>ASM:</span>
            <span className="text-emerald-400 font-semibold">Active</span>
            <span className="mx-1">•</span>
            <span>SIEM:</span>
            <span className="text-blue-400 font-semibold">Connected</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe selector */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-raised border border-[var(--oh-border)] text-xs">
            {["1h", "6h", "24h", "7d"].map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer text-[11px]",
                  timeframe === tf
                    ? "bg-surface text-foreground shadow-xs font-semibold"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Auto refresh toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(autoRefresh ? false : 30_000)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
              autoRefresh
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-surface-raised text-[var(--oh-muted)] border-[var(--oh-border)]",
            )}
          >
            {autoRefresh ? "Auto-refresh: 30s" : "Auto-refresh: Off"}
          </button>

          {/* Manual refresh button */}
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isFetchingSummary}
            className="p-1.5 rounded-lg bg-surface-raised border border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Security Data"
          >
            <RefreshCw
              className={cn(
                "w-3.5 h-3.5",
                isFetchingSummary && "animate-spin text-primary",
              )}
            />
          </button>

          {/* External Datadog Console Link */}
          <a
            href={`https://app.${site}/security`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-raised border border-[var(--oh-border)] text-foreground hover:bg-surface transition-colors"
          >
            Open in Datadog
            <ExternalLink className="w-3 h-3 text-[var(--oh-muted)]" />
          </a>
        </div>
      </div>

      {/* Main Posture Overview Card */}
      <SecurityPostureCard summary={summaryData} isLoading={isLoadingSummary} />

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--oh-border)] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab("all")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0",
            activeSubTab === "all"
              ? "bg-surface-raised text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <ListFilter className="w-3.5 h-3.5" />
          Complete View
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("signals")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0",
            activeSubTab === "signals"
              ? "bg-surface-raised text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          Cloud SIEM Signals
          {signals.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500/20 text-blue-300 font-mono">
              {signals.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("compliance")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0",
            activeSubTab === "compliance"
              ? "bg-surface-raised text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
          Compliance Frameworks (SOC 2, HIPAA, CIS)
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("audit")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0",
            activeSubTab === "audit"
              ? "bg-surface-raised text-foreground border border-[var(--oh-border)] shadow-xs"
              : "text-[var(--oh-muted)] hover:text-foreground",
          )}
        >
          <Shield className="w-3.5 h-3.5 text-purple-400" />
          Governance & Action Audit Trail
        </button>
      </div>

      {/* Sub-tab Content Panels */}
      {activeSubTab === "all" ? (
        <div className="space-y-5">
          <SecuritySignalsCard
            signals={signals}
            isLoading={isLoadingSignals}
            site={site}
          />
          <ComplianceFrameworksCard
            findings={findings}
            complianceSummary={summaryData?.compliance}
            isLoading={isLoadingFindings}
            site={site}
          />
          <GovernanceAuditCard
            logs={auditLogs}
            isLoading={isLoadingAudit}
            site={site}
            service={service}
          />
        </div>
      ) : activeSubTab === "signals" ? (
        <SecuritySignalsCard
          signals={signals}
          isLoading={isLoadingSignals}
          site={site}
        />
      ) : activeSubTab === "compliance" ? (
        <ComplianceFrameworksCard
          findings={findings}
          complianceSummary={summaryData?.compliance}
          isLoading={isLoadingFindings}
          site={site}
        />
      ) : (
        <GovernanceAuditCard
          logs={auditLogs}
          isLoading={isLoadingAudit}
          site={site}
          service={service}
        />
      )}
    </div>
  );
}
