/**
 * Converts pasted HTML content to clean Markdown, preserving links,
 * bold/italic, headings, and lists while stripping unnecessary formatting.
 */
import TurndownService from "turndown";

// Singleton – create once, reuse on every paste.
let _service: TurndownService | null = null;

function getService(): TurndownService {
  if (_service) return _service;

  _service = new TurndownService({
    headingStyle: "atx", // # style headings
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined", // [text](url)
    hr: "---",
  });

  // Strip scripts, styles, and form elements – we never want these.
  _service.remove(["script", "style", "noscript", "iframe", "form"]);

  // Strip images that are just decorative/tiny icons (< 5 chars alt text
  // and data-URIs) but keep real images with meaningful alt text.
  _service.addRule("cleanImages", {
    filter: "img",
    replacement(_content, node) {
      const el = node as HTMLImageElement;
      const alt = el.getAttribute("alt") || "";
      const src = el.getAttribute("src") || "";

      // Skip data-URI images and tiny tracking pixels
      if (src.startsWith("data:") || !alt.trim()) return "";

      return `![${alt}](${src})`;
    },
  });

  return _service;
}

/**
 * Convert an HTML string to Markdown.
 *
 * Returns the original `plainText` fallback if the HTML is empty/trivial
 * or if conversion produces nothing useful.
 */
export function htmlToMarkdown(html: string, plainText: string): string {
  if (!html.trim()) return plainText;

  try {
    const md = getService().turndown(html);
    // If conversion produced nothing useful, fall back to plain text
    return md.trim() || plainText;
  } catch {
    // Turndown can choke on truly malformed HTML – degrade gracefully.
    return plainText;
  }
}
