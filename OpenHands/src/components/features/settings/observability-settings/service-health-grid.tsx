import React from "react";
import { Server, Cpu, Globe, ShieldCheck } from "lucide-react";
import { DatadogSummaryResponse } from "#/api/observability-service/datadog.types";

export interface ServiceHealthGridProps {
  site?: string;
  summary?: DatadogSummaryResponse;
}

export function ServiceHealthGrid({
  site = "us5.datadoghq.com",
  summary,
}: ServiceHealthGridProps) {
  const services = [
    {
      id: "agent-server",
      name: "Agent Server",
      service: "grokbot-agent-server",
      port: 18000,
      tracer: "ddtrace-run (Python)",
      status: summary?.services?.agentServer?.status ?? "unknown",
      icon: <Server className="size-4 text-sky-400" />,
      tag: "APM Traced",
    },
    {
      id: "automation",
      name: "Automation Server",
      service: "grokbot-automation",
      port: 18001,
      tracer: "ddtrace-run (FastAPI)",
      status: summary?.services?.automation?.status ?? "unknown",
      icon: <Cpu className="size-4 text-amber-400" />,
      tag: "APM Traced",
    },
    {
      id: "frontend",
      name: "Frontend & Ingress",
      service: "grokbot-frontend",
      port: 8000,
      tracer: "Datadog RUM + Logs SDK",
      status: summary?.services?.frontend?.status ?? "unknown",
      icon: <Globe className="size-4 text-emerald-400" />,
      tag: "RUM Active",
    },
    {
      id: "sidecar",
      name: "Datadog Sidecar",
      service: "datadog-agent",
      port: 8126,
      tracer: site,
      status: summary?.services?.sidecar?.status ?? "unknown",
      icon: <ShieldCheck className="size-4 text-sky-400" />,
      tag: "Intake Ready",
    },
  ];

  const renderStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "healthy" || s === "connected") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
          <span className="size-1 rounded-full bg-emerald-400" />
          {s === "healthy" ? "Healthy" : "Connected"}
        </span>
      );
    }
    if (s === "degraded" || s === "error") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-900/50 text-rose-300 border border-rose-700/50">
          <span className="size-1 rounded-full bg-rose-400" />
          {s === "degraded" ? "Degraded" : "Error"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800/50 text-zinc-400 border border-zinc-700/50">
        <span className="size-1 rounded-full bg-zinc-400" />
        Unknown
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {services.map((svc) => (
        <div
          key={svc.id}
          className="flex flex-col justify-between p-3 rounded-md border border-[var(--oh-border)] bg-surface-raised transition-colors"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center size-7 rounded bg-surface border border-[var(--oh-border)]">
                {svc.icon}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  {svc.name}
                </h4>
                <span className="font-mono text-[10px] text-[var(--oh-muted)]">
                  :{svc.port}
                </span>
              </div>
            </div>
            {renderStatusBadge(svc.status)}
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[var(--oh-border)] text-[var(--oh-muted)]">
            <span className="truncate max-w-[130px] font-mono text-[10px] text-[var(--oh-muted)]">
              {svc.service}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface border border-[var(--oh-border)] text-[9px] text-[var(--oh-muted)] font-mono">
              {svc.tag}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
