import React from "react";
import { ExtraProps } from "react-markdown";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyableContentWrapper } from "#/components/shared/buttons/copyable-content-wrapper";
import { cn } from "#/utils/utils";
import { SyntaxHighlighter } from "./syntax-highlighter";

// See https://github.com/remarkjs/react-markdown?tab=readme-ov-file#use-custom-components-syntax-highlight

/**
 * Component to render code blocks in markdown.
 */
export function code({
  children,
  className,
}: React.ClassAttributes<HTMLElement> &
  React.HTMLAttributes<HTMLElement> &
  ExtraProps) {
  const match = /language-(\w+)/.exec(className || ""); // get the language
  const codeString = String(children).replace(/\n$/, "");

  if (!match) {
    const isMultiline = String(children).includes("\n");

    if (!isMultiline) {
      return (
        <code
          className={cn(
            className,
            "bg-[var(--oh-surface-raised)] text-[var(--oh-foreground)] border border-white/10 rounded-md px-1.5 py-0.5 font-mono text-[13px] shadow-sm tracking-tight",
          )}
        >
          {children}
        </code>
      );
    }

    return (
      <CopyableContentWrapper text={codeString}>
        <pre className="bg-[var(--oh-surface-deep)] text-[var(--oh-foreground)] border border-white/10 rounded-xl p-3.5 overflow-auto shadow-sm">
          <code className={className}>{codeString}</code>
        </pre>
      </CopyableContentWrapper>
    );
  }

  return (
    <CopyableContentWrapper text={codeString}>
      <SyntaxHighlighter
        className="rounded-xl border border-white/10 shadow-sm"
        style={vscDarkPlus}
        language={match?.[1]}
        PreTag="div"
      >
        {codeString}
      </SyntaxHighlighter>
    </CopyableContentWrapper>
  );
}
