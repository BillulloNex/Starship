import React from "react";
import {
  FileCode,
  FileText,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  Settings,
  Database,
  File,
  Globe,
  Palette,
  Layers,
  Braces,
  Hash,
  Sparkles,
} from "lucide-react";
import { cn } from "#/utils/utils";

interface FileTypeIconProps {
  path: string;
  className?: string;
}

export function FileTypeIcon({
  path,
  className = "w-3.5 h-3.5",
}: FileTypeIconProps) {
  const cleanPath = path.toLowerCase();
  const filename = cleanPath.split("/").pop() || "";
  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts.pop() || "" : "";

  // Exact filename matches
  if (
    filename === "package.json" ||
    filename === "tsconfig.json" ||
    filename === "jsconfig.json"
  ) {
    return <FileJson className={cn(className, "text-amber-400")} />;
  }
  if (
    filename.startsWith(".env") ||
    filename === "dockerfile" ||
    filename === ".dockerignore" ||
    filename === ".gitignore"
  ) {
    return <Settings className={cn(className, "text-yellow-500")} />;
  }
  if (filename === "agents.md" || filename === "goal.md") {
    return <Sparkles className={cn(className, "text-indigo-400")} />;
  }

  // Extension based matches
  switch (ext) {
    // TypeScript / JavaScript
    case "ts":
      return <FileCode className={cn(className, "text-blue-400")} />;
    case "tsx":
      return <Layers className={cn(className, "text-cyan-400")} />;
    case "js":
    case "mjs":
    case "cjs":
      return <FileCode className={cn(className, "text-yellow-400")} />;
    case "jsx":
      return <Layers className={cn(className, "text-amber-300")} />;

    // Python
    case "py":
    case "pyw":
    case "ipynb":
      return <FileCode className={cn(className, "text-emerald-400")} />;

    // Web Markup & Styling
    case "html":
    case "htm":
      return <Globe className={cn(className, "text-orange-400")} />;
    case "css":
    case "scss":
    case "sass":
    case "less":
      return <Palette className={cn(className, "text-sky-400")} />;

    // Data & Config
    case "json":
    case "json5":
    case "jsonc":
      return <FileJson className={cn(className, "text-amber-400")} />;
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "xml":
      return <Braces className={cn(className, "text-rose-400")} />;
    case "sql":
    case "sqlite":
    case "db":
      return <Database className={cn(className, "text-teal-400")} />;

    // Shell scripts
    case "sh":
    case "bash":
    case "zsh":
      return <FileTerminal className={cn(className, "text-emerald-500")} />;

    // Docs & Markdown
    case "md":
    case "markdown":
    case "mdx":
      return <FileText className={cn(className, "text-blue-300")} />;
    case "txt":
    case "log":
      return <FileText className={cn(className, "text-[var(--oh-muted)]")} />;

    // Spreadsheets / tabular
    case "csv":
    case "tsv":
    case "xlsx":
    case "xls":
      return <FileSpreadsheet className={cn(className, "text-green-400")} />;

    // Images
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "ico":
      return <FileImage className={cn(className, "text-purple-400")} />;

    // Systems languages
    case "rs":
      return <Hash className={cn(className, "text-orange-500")} />;
    case "go":
      return <FileCode className={cn(className, "text-cyan-500")} />;
    case "c":
    case "cpp":
    case "h":
    case "hpp":
      return <FileCode className={cn(className, "text-indigo-400")} />;

    default:
      return <File className={cn(className, "text-[var(--oh-muted)]")} />;
  }
}
