import React from "react";
import { ExtraProps } from "react-markdown";

export function anchor({
  href,
  children,
}: React.ClassAttributes<HTMLAnchorElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement> &
  ExtraProps) {
  return (
    <a
      className="text-[var(--oh-color-primary)] hover:underline font-medium inline-flex items-center gap-0.5 transition-colors"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
