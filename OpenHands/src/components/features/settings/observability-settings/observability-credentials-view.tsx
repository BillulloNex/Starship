import React, { useState, useMemo, useCallback } from "react";
import {
  Key,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
} from "lucide-react";
import { useSearchSecrets } from "#/hooks/query/use-get-secrets";
import { useCreateSecret } from "#/hooks/mutation/use-create-secret";
import { useUpdateSecret } from "#/hooks/mutation/use-update-secret";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

/**
 * Credential definitions for each observability platform.
 * Each credential maps to a secret name in the secrets store.
 */
interface CredentialField {
  /** The secret key name stored in the secrets backend. */
  secretName: string;
  /** Human-readable label. */
  label: string;
  /** Placeholder / example value. */
  placeholder: string;
  /** Short description shown under the input. */
  description: string;
  /** Whether this is a "secret" (masked by default). */
  isSensitive: boolean;
}

interface PlatformConfig {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  dashboardUrl: string;
  dashboardLabel: string;
  fields: CredentialField[];
}

const PLATFORMS: PlatformConfig[] = [
  {
    name: "Datadog",
    color: "text-purple-300",
    bgColor: "bg-purple-900/30",
    borderColor: "border-purple-700/40",
    dotColor: "bg-purple-400",
    dashboardUrl: "https://app.datadoghq.com",
    dashboardLabel: "Datadog Dashboard",
    fields: [
      {
        secretName: "DD_API_KEY",
        label: "API Key",
        placeholder: "Enter your Datadog API key",
        description: "Found in Organization Settings → API Keys",
        isSensitive: true,
      },
      {
        secretName: "DD_APP_KEY",
        label: "Application Key",
        placeholder: "Enter your Datadog Application key",
        description: "Found in Organization Settings → Application Keys",
        isSensitive: true,
      },
      {
        secretName: "DD_SITE",
        label: "Site",
        placeholder: "us5.datadoghq.com",
        description: "Your Datadog site (e.g. us5.datadoghq.com, datadoghq.eu)",
        isSensitive: false,
      },
    ],
  },
  {
    name: "Langfuse",
    color: "text-sky-300",
    bgColor: "bg-sky-900/30",
    borderColor: "border-sky-700/40",
    dotColor: "bg-sky-400",
    dashboardUrl: "https://cloud.langfuse.com",
    dashboardLabel: "Langfuse Dashboard",
    fields: [
      {
        secretName: "LANGFUSE_PUBLIC_KEY",
        label: "Public Key",
        placeholder: "pk-lf-...",
        description: "Project → Settings → API Keys → Public Key",
        isSensitive: false,
      },
      {
        secretName: "LANGFUSE_SECRET_KEY",
        label: "Secret Key",
        placeholder: "sk-lf-...",
        description: "Project → Settings → API Keys → Secret Key",
        isSensitive: true,
      },
      {
        secretName: "LANGFUSE_HOST",
        label: "Host",
        placeholder: "https://cloud.langfuse.com",
        description: "Self-hosted URL or https://cloud.langfuse.com",
        isSensitive: false,
      },
    ],
  },
  {
    name: "PostHog",
    color: "text-orange-300",
    bgColor: "bg-orange-900/30",
    borderColor: "border-orange-700/40",
    dotColor: "bg-orange-400",
    dashboardUrl: "https://app.posthog.com",
    dashboardLabel: "PostHog Dashboard",
    fields: [
      {
        secretName: "POSTHOG_API_KEY",
        label: "Project API Key",
        placeholder: "phc_...",
        description: "Project → Settings → Project API Key",
        isSensitive: true,
      },
      {
        secretName: "POSTHOG_HOST",
        label: "Host",
        placeholder: "https://app.posthog.com",
        description: "PostHog instance URL (cloud or self-hosted)",
        isSensitive: false,
      },
    ],
  },
];

export function ObservabilityCredentialsView() {
  return (
    <div className="space-y-6">
      {/* Intro card */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--oh-border)] bg-surface-raised">
        <div className="flex items-center justify-center size-9 shrink-0 rounded-lg bg-surface border border-[var(--oh-border)] text-amber-400">
          <Shield className="size-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Observability Credentials
          </h3>
          <p className="text-xs text-[var(--oh-muted)] mt-0.5 leading-relaxed">
            Add and manage API keys for your observability platforms. Credentials
            are stored securely and used to connect Starship to your monitoring
            dashboards.
          </p>
        </div>
      </div>

      {/* Platform credential cards */}
      {PLATFORMS.map((platform) => (
        <PlatformCredentialCard key={platform.name} platform={platform} />
      ))}
    </div>
  );
}

/* ── Per-Platform Credential Card ─────────────────────────────────────── */

function PlatformCredentialCard({ platform }: { platform: PlatformConfig }) {
  const { data: secrets, refetch } = useSearchSecrets();
  const { mutateAsync: createSecret } = useCreateSecret();
  const { mutateAsync: updateSecret } = useUpdateSecret();

  // Track local edits per field
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set());

  // Check which secrets already exist
  const existingSecretNames = useMemo(
    () => new Set((secrets ?? []).map((s) => s.name)),
    [secrets],
  );

  const toggleVisibility = useCallback((fieldName: string) => {
    setVisibleFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  }, []);

  const handleSave = useCallback(
    async (field: CredentialField) => {
      const value = editValues[field.secretName];
      if (!value?.trim()) return;

      setSavingFields((prev) => new Set(prev).add(field.secretName));
      try {
        const exists = existingSecretNames.has(field.secretName);
        if (exists) {
          await updateSecret({
            secretToEdit: field.secretName,
            name: field.secretName,
            description: `${platform.name} - ${field.label}`,
            value: value.trim(),
          });
        } else {
          await createSecret({
            name: field.secretName,
            value: value.trim(),
            description: `${platform.name} - ${field.label}`,
          });
        }
        displaySuccessToast(`${field.label} saved successfully`);
        setSavedFields((prev) => new Set(prev).add(field.secretName));
        setEditValues((prev) => {
          const next = { ...prev };
          delete next[field.secretName];
          return next;
        });
        refetch();
        // Clear the "saved" indicator after 2s
        setTimeout(() => {
          setSavedFields((prev) => {
            const next = new Set(prev);
            next.delete(field.secretName);
            return next;
          });
        }, 2000);
      } catch (err: any) {
        displayErrorToast(
          `Failed to save ${field.label}: ${err?.message || "Unknown error"}`,
        );
      } finally {
        setSavingFields((prev) => {
          const next = new Set(prev);
          next.delete(field.secretName);
          return next;
        });
      }
    },
    [
      editValues,
      existingSecretNames,
      createSecret,
      updateSecret,
      platform.name,
      refetch,
    ],
  );

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-4",
        platform.borderColor,
        "bg-surface",
      )}
    >
      {/* Platform header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "size-2 rounded-full",
              platform.dotColor,
            )}
          />
          <h3 className={cn("text-sm font-semibold", platform.color)}>
            {platform.name}
          </h3>
          {platform.fields.every((f) => existingSecretNames.has(f.secretName)) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
              <CheckCircle2 className="size-2.5" />
              All configured
            </span>
          )}
        </div>
        <a
          href={platform.dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-1 text-[11px] font-medium transition-colors hover:brightness-125",
            platform.color,
          )}
        >
          {platform.dashboardLabel}
          <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Credential fields */}
      <div className="space-y-3">
        {platform.fields.map((field) => {
          const exists = existingSecretNames.has(field.secretName);
          const isEditing = field.secretName in editValues;
          const isSaving = savingFields.has(field.secretName);
          const justSaved = savedFields.has(field.secretName);
          const isVisible = visibleFields.has(field.secretName);

          return (
            <div key={field.secretName} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Key className="size-3 text-[var(--oh-muted)]" />
                  {field.label}
                  <span className="font-mono text-[10px] text-[var(--oh-muted)]">
                    {field.secretName}
                  </span>
                </label>
                <div className="flex items-center gap-1.5">
                  {exists && !isEditing && (
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-2.5" />
                      Configured
                    </span>
                  )}
                  {!exists && !isEditing && (
                    <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                      <AlertCircle className="size-2.5" />
                      Not set
                    </span>
                  )}
                  {justSaved && (
                    <span className="text-[10px] text-emerald-400 font-medium animate-pulse">
                      Saved ✓
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={
                      field.isSensitive && !isVisible ? "password" : "text"
                    }
                    value={
                      isEditing
                        ? editValues[field.secretName]
                        : exists
                          ? "••••••••••••"
                          : ""
                    }
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        [field.secretName]: e.target.value,
                      }))
                    }
                    onFocus={() => {
                      if (!isEditing) {
                        setEditValues((prev) => ({
                          ...prev,
                          [field.secretName]: "",
                        }));
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-xs font-mono text-foreground placeholder:text-[var(--oh-muted)]/50 focus:border-sky-500/60 focus:outline-none transition-colors"
                    disabled={isSaving}
                  />
                  {field.isSensitive && (
                    <button
                      type="button"
                      onClick={() => toggleVisibility(field.secretName)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--oh-muted)] hover:text-foreground transition-colors cursor-pointer"
                    >
                      {isVisible ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </button>
                  )}
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => handleSave(field)}
                    disabled={
                      isSaving || !editValues[field.secretName]?.trim()
                    }
                    className={cn(
                      "flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                      isSaving
                        ? "bg-sky-900/40 text-sky-400 border border-sky-700/40 opacity-60"
                        : "bg-sky-600 hover:bg-sky-500 text-white shadow-sm",
                    )}
                  >
                    <Save className="size-3" />
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[var(--oh-muted)] pl-0.5">
                {field.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
