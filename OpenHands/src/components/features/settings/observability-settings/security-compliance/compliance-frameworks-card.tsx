import React, { useState } from "react";
import {
  DatadogComplianceFinding,
  DatadogComplianceFrameworkSummary,
} from "#/api/observability-service/datadog.types";
import { cn } from "#/utils/utils";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";

interface ComplianceFrameworksCardProps {
  findings: DatadogComplianceFinding[];
  complianceSummary?: {
    soc2: DatadogComplianceFrameworkSummary;
    hipaa: DatadogComplianceFrameworkSummary;
    cis: DatadogComplianceFrameworkSummary;
  };
  isLoading: boolean;
  site: string;
}

export function ComplianceFrameworksCard({
  findings,
  complianceSummary,
  isLoading,
  site,
}: ComplianceFrameworksCardProps) {
  const [selectedFramework, setSelectedFramework] = useState<string>("all");
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(
    null,
  );

  const filteredFindings = findings.filter((f) => {
    if (selectedFramework === "all") return true;
    return f.framework.toLowerCase().includes(selectedFramework.toLowerCase());
  });

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "passed":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "warn":
      case "warning":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "failed":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      default:
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "passed":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "warn":
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="rounded-xl border border-[var(--oh-border)] bg-surface p-5 shadow-xs space-y-4">
      {/* Header & Framework selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border)]">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Cloud Security Management (CSM) & Compliance Frameworks
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-surface-raised border border-[var(--oh-border)]">
              {filteredFindings.length} checks
            </span>
          </h3>
          <p className="text-xs text-[var(--oh-muted)] mt-0.5">
            Automated compliance rule mapping against SOC 2 Type II, HIPAA
            Security Rule, and CIS Docker benchmarks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Framework tabs */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-raised border border-[var(--oh-border)] text-xs">
            {[
              { id: "all", label: "All Frameworks" },
              { id: "soc 2", label: "SOC 2 Type II" },
              { id: "hipaa", label: "HIPAA" },
              { id: "cis", label: "CIS Docker" },
            ].map((fw) => (
              <button
                key={fw.id}
                type="button"
                onClick={() => setSelectedFramework(fw.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer text-[11px]",
                  selectedFramework === fw.id
                    ? "bg-surface text-foreground shadow-xs font-semibold"
                    : "text-[var(--oh-muted)] hover:text-foreground",
                )}
              >
                {fw.label}
              </button>
            ))}
          </div>

          <a
            href={`https://app.${site}/security/csm`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-surface-raised border border-[var(--oh-border)] text-[var(--oh-muted)] hover:text-foreground transition-colors"
          >
            Datadog CSM
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Framework Summary Progress Cards */}
      {complianceSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* SOC 2 */}
          <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                SOC 2 Type II
              </span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {complianceSummary.soc2.passRate}%
              </span>
            </div>
            <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-[var(--oh-border)]">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{ width: `${complianceSummary.soc2.passRate}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--oh-muted)]">
              <span>{complianceSummary.soc2.passed} passed</span>
              <span>{complianceSummary.soc2.failed} failing</span>
            </div>
          </div>

          {/* HIPAA */}
          <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                HIPAA Security Rule
              </span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {complianceSummary.hipaa.passRate}%
              </span>
            </div>
            <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-[var(--oh-border)]">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{ width: `${complianceSummary.hipaa.passRate}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--oh-muted)]">
              <span>{complianceSummary.hipaa.passed} passed</span>
              <span>{complianceSummary.hipaa.failed} failing</span>
            </div>
          </div>

          {/* CIS */}
          <div className="rounded-lg border border-[var(--oh-border)] bg-surface-raised/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                CIS Docker & Linux
              </span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {complianceSummary.cis.passRate}%
              </span>
            </div>
            <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-[var(--oh-border)]">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{ width: `${complianceSummary.cis.passRate}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--oh-muted)]">
              <span>{complianceSummary.cis.passed} passed</span>
              <span>{complianceSummary.cis.failed} warnings</span>
            </div>
          </div>
        </div>
      )}

      {/* Compliance Rule Table */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-[var(--oh-muted)]">
          Evaluating compliance rules...
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFindings.map((finding) => {
            const isExpanded = expandedFindingId === finding.id;
            return (
              <div
                key={finding.id}
                className={cn(
                  "rounded-lg border transition-colors",
                  isExpanded
                    ? "border-primary bg-surface-raised"
                    : "border-[var(--oh-border)] bg-surface-raised/30 hover:bg-surface-raised/60",
                )}
              >
                <div
                  onClick={() =>
                    setExpandedFindingId(isExpanded ? null : finding.id)
                  }
                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(finding.status)}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">
                          {finding.title}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface border border-[var(--oh-border)] text-[var(--oh-muted)]">
                          {finding.ruleId}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-surface border border-[var(--oh-border)] text-primary">
                          {finding.framework}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--oh-muted)] mt-0.5">
                        Category: {finding.category}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                        getStatusBadge(finding.status),
                      )}
                    >
                      {finding.status}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[var(--oh-muted)]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[var(--oh-muted)]" />
                    )}
                  </div>
                </div>

                {/* Expanded remediation info */}
                {isExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-[var(--oh-border)] space-y-2 text-xs">
                    <div>
                      <span className="text-[11px] font-semibold text-[var(--oh-muted)] block mb-0.5">
                        Requirement Description:
                      </span>
                      <p className="text-xs text-foreground bg-surface p-2 rounded border border-[var(--oh-border)]">
                        {finding.description}
                      </p>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-[var(--oh-muted)] block mb-0.5">
                        Remediation & Evidence:
                      </span>
                      <p className="text-xs text-emerald-400 bg-surface p-2 rounded border border-[var(--oh-border)] font-mono text-[11px]">
                        {finding.remediation}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
