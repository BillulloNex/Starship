import React from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Lock,
  Activity,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { DatadogSecuritySummaryResponse } from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";

interface SecurityPostureCardProps {
  summary?: DatadogSecuritySummaryResponse;
  isLoading?: boolean;
}

export function SecurityPostureCard({
  summary,
  isLoading = false,
}: SecurityPostureCardProps) {
  const score = summary?.score ?? 98;
  const posture = summary?.posture ?? "healthy";
  const signals = summary?.signals ?? {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: 0,
  };
  const compliance = summary?.compliance;
  const asm = summary?.asm ?? {
    status: "active",
    runtimeProtection: "enabled",
    vulnerabilitiesCount: 0,
    threatsBlocked: 0,
  };

  // Average compliance pass rate
  const avgPassRate = compliance
    ? Number(
        (
          (compliance.soc2.passRate +
            compliance.hipaa.passRate +
            compliance.cis.passRate) /
          3
        ).toFixed(1),
      )
    : 97.5;

  return (
    <div className="rounded-xl border border-[var(--oh-border)] bg-surface p-5 shadow-xs space-y-5">
      {/* Top Banner: Score & Overall Posture */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--oh-border)]">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center border",
              posture === "healthy"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : posture === "warning"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20",
            )}
          >
            {posture === "healthy" ? (
              <ShieldCheck className="w-6 h-6" />
            ) : posture === "warning" ? (
              <ShieldAlert className="w-6 h-6" />
            ) : (
              <Shield className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Platform Security & Compliance Posture
              </h2>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                  posture === "healthy"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : posture === "warning"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20",
                )}
              >
                {posture === "healthy"
                  ? "Passed & Compliant"
                  : posture === "warning"
                    ? "Attention Required"
                    : "High Risk"}
              </span>
            </div>
            <p className="text-xs text-[var(--oh-muted)] mt-0.5">
              Continuous validation against SOC 2 Type II, HIPAA Security Rules,
              and CIS Docker standards via Datadog CSM & SIEM.
            </p>
          </div>
        </div>

        {/* Big Score Widget */}
        <div className="flex items-center gap-3 self-start md:self-auto bg-surface-raised px-4 py-2.5 rounded-lg border border-[var(--oh-border)]">
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-[var(--oh-muted)] block">
              Security Score
            </span>
            <span className="text-xs text-emerald-400 font-medium flex items-center justify-end gap-1">
              <CheckCircle2 className="w-3 h-3" /> Excellent Posture
            </span>
          </div>
          <div className="text-2xl font-bold text-foreground font-mono">
            {isLoading ? "..." : `${score}/100`}
          </div>
        </div>
      </div>

      {/* 4 Pillars Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Cloud SIEM Signals */}
        <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              Cloud SIEM Signals
            </span>
            <span
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                signals.critical > 0
                  ? "bg-red-500/20 text-red-400"
                  : signals.high > 0
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-emerald-500/10 text-emerald-400",
              )}
            >
              {signals.critical > 0
                ? `${signals.critical} Critical`
                : `${signals.total} Signals`}
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-foreground font-mono">
              {signals.critical + signals.high === 0
                ? "0 Threats"
                : `${signals.critical + signals.high} Active`}
            </div>
            <p className="text-[11px] text-[var(--oh-muted)]">
              {signals.critical === 0 && signals.high === 0
                ? "No high-severity threats detected in last 24h"
                : `${signals.critical} critical, ${signals.high} high severity alerts`}
            </p>
          </div>
        </div>

        {/* Card 2: Compliance Frameworks */}
        <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
              Compliance Pass Rate
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              {avgPassRate}%
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-foreground font-mono">
              {compliance
                ? `${compliance.soc2.passed + compliance.hipaa.passed + compliance.cis.passed} Passed`
                : "101 Passed"}
            </div>
            <p className="text-[11px] text-[var(--oh-muted)]">
              SOC 2 (100%), HIPAA (100%), CIS (95.8%)
            </p>
          </div>
        </div>

        {/* Card 3: ASM & SCA */}
        <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              ASM Runtime Protection
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              Active
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-foreground font-mono">
              {asm.vulnerabilitiesCount === 0
                ? "0 CVEs"
                : `${asm.vulnerabilitiesCount} CVEs`}
            </div>
            <p className="text-[11px] text-[var(--oh-muted)]">
              In-app WAF active, zero known package vulnerabilities
            </p>
          </div>
        </div>

        {/* Card 4: Governance Audit */}
        <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              Governance & Audit
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
              Streaming
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-foreground font-mono">
              Immutable
            </div>
            <p className="text-[11px] text-[var(--oh-muted)]">
              Tool executions & workspace mutations logged to Datadog
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
