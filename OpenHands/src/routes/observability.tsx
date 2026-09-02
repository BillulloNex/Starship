import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useDatadogStatus } from "#/hooks/query/use-datadog-observability";
import {
  LlmObservabilityView,
  DatadogObservabilityView,
} from "#/components/features/settings/observability-settings";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { Info } from "lucide-react";

export const handle = { hideTitle: true };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-[var(--oh-border)]">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">
              {t(I18nKey.SETTINGS$NAV_OBSERVABILITY)}
            </h1>
            <button
              type="button"
              className="text-[var(--oh-muted)] hover:text-foreground transition-colors cursor-help"
              title={t(I18nKey.SETTINGS$PAGE_OBSERVABILITY_SUBLINE)}
            >
              <Info className="size-3.5" />
            </button>
          </div>

          {/* Top-Level Segmented Screen Toggle */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-surface border border-[var(--oh-border)]">
            <button
              type="button"
              data-testid="observability-tab-llm"
              onClick={() => handleTabChange("llm")}
              className={cn(
                "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                activeTab === "llm"
                  ? "bg-surface-raised text-foreground shadow-xs border border-[var(--oh-border)]"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              LLM & Agent Tracing
            </button>

            <button
              type="button"
              data-testid="observability-tab-datadog"
              onClick={() => handleTabChange("datadog")}
              className={cn(
                "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                activeTab === "datadog"
                  ? "bg-surface-raised text-foreground shadow-xs border border-[var(--oh-border)]"
                  : "text-[var(--oh-muted)] hover:text-foreground",
              )}
            >
              Infrastructure & Datadog
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
