import React from "react";
import { ExtraProps } from "react-markdown";

// Custom component to render <p> in markdown with bottom padding
export function paragraph({
  children,
}: React.ClassAttributes<HTMLParagraphElement> &
  React.HTMLAttributes<HTMLParagraphElement> &
  ExtraProps) {
  return <p className="mb-4 leading-6 first:mt-0 last:mb-0">{children}</p>;
}
