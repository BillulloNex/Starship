import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useDatadogStatus } from "#/hooks/query/use-datadog-observability";
import {
  LlmObservabilityView,
  DatadogObservabilityView,
} from "#/components/features/settings/observability-settings";
import { I18nKey } from "#/i18n/declaration";
import { Bot, Activity } from "lucide-react";
import { cn } from "#/utils/utils";
import { isLangfuseEnabled } from "#/services/langfuse-service";

export type ObservabilityTab = "llm" | "datadog";

export function ObservabilityScreen() {
  const { t } = useTranslation("openhands");
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");
  const initialTab: ObservabilityTab =
    tabParam === "datadog" ? "datadog" : "llm";

  const [activeTab, setActiveTab] = useState<ObservabilityTab>(initialTab);

  const { data: statusData } = useDatadogStatus();
  const site = statusData?.site || "us5.datadoghq.com";
  const service = statusData?.service || "grokbot";

  const handleTabChange = (newTab: ObservabilityTab) => {
    setActiveTab(newTab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", newTab);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <main
      data-testid="observability-screen"
      className="h-full flex-1 overflow-y-auto p-6"
    >
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Header & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-content">
              {t(I18nKey.SETTINGS$NAV_OBSERVABILITY)}
            </h1>
            <p className="text-sm text-muted">
              {t(I18nKey.SETTINGS$PAGE_OBSERVABILITY_SUBLINE)}
            </p>
          </div>

          {/* Top-Level Segmented Screen Toggle */}
          <div className="inline-flex items-center p-1 rounded-lg bg-surface border border-[var(--oh-border)] shadow-inner">
            <button
              type="button"
              data-testid="observability-tab-llm"
              onClick={() => handleTabChange("llm")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                activeTab === "llm"
                  ? "bg-sky-950/60 text-sky-300 border border-sky-700/50 shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              <Bot className="size-3.5 text-sky-400" />
              <span>LLM & Agent Tracing</span>
              {isLangfuseEnabled() && (
                <span className="size-1.5 rounded-full bg-sky-400" />
              )}
            </button>

            <button
              type="button"
              data-testid="observability-tab-datadog"
              onClick={() => handleTabChange("datadog")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                activeTab === "datadog"
                  ? "bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 shadow-sm"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              <Activity className="size-3.5 text-emerald-400" />
              <span>Infrastructure & Datadog</span>
              {statusData?.isValidKey && (
                <span className="size-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>
        </div>

        {/* View Switching */}
        {activeTab === "llm" ? (
          <LlmObservabilityView site={site} />
        ) : (
          <DatadogObservabilityView site={site} service={service} />
        )}
      </div>
    </main>
  );
}

export default ObservabilityScreen;
