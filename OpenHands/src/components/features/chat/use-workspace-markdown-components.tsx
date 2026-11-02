import React from "react";
import type { Components } from "react-markdown";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import { useWorkspaceSession } from "#/hooks/query/use-workspace-session";
import { resolveWorkspaceImageSrc } from "#/utils/resolve-workspace-image-src";
import { MARKDOWN_IMAGE_CLASS_NAME } from "../markdown/markdown-renderer";

/**
 * Markdown component overrides for agent-authored chat messages.
 *
 * The one override is `img`: a workspace-relative `![shot](shots/page.png)`
 * is rewritten to the conversation's static workspace fileserver (the same
 * route the Files tab uses), so an image the agent just saved renders inline
 * in its reply. Everything else — absolute URLs, data URIs — is untouched.
 *
 * Local agent-server only: on cloud the workspace session is never minted
 * (`useWorkspaceSession` stays disabled) and sources pass through as-is.
 */
export function useWorkspaceMarkdownComponents(): Partial<Components> {
  const { t } = useTranslation("openhands");
  const { workingDir } = useWorkspaceRuntime();
  const { data: session } = useWorkspaceSession();
  const baseUrl = session?.baseUrl ?? null;

  return React.useMemo(
    () => ({
      img: ({ src, alt, ...props }) => (
        <img
          src={resolveWorkspaceImageSrc(src, { baseUrl, workingDir })}
          alt={alt ?? t(I18nKey.MARKDOWN$IMAGE_ALT)}
          className={MARKDOWN_IMAGE_CLASS_NAME}
          loading="lazy"
          {...props}
        />
      ),
    }),
    [baseUrl, workingDir, t],
  );
}
