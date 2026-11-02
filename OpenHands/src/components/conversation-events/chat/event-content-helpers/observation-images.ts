import { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isACPToolCallEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";
import { getACPToolCallImageDataUri } from "./get-acp-tool-call-content";

/**
 * Image URLs the chat can hand straight to an `<img src>`: inline data URIs
 * and absolute http(s) URLs. Anything else (sandbox file paths, blob refs)
 * would 404 against the GUI origin, so it is left out here.
 */
const RENDERABLE_IMAGE_URL = /^(?:data:image\/|https?:\/\/)/i;

export const isRenderableImageUrl = (url: unknown): url is string =>
  typeof url === "string" && RENDERABLE_IMAGE_URL.test(url);

/** Wrap raw base64 in a data URI; pass an existing data URI through. */
export const toImageDataUri = (
  data: string,
  mimeType: string = "image/png",
): string =>
  data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;

/**
 * Collect renderable image URLs from a tool observation's `content` array
 * (`ImageContent` blocks carry `image_urls`). Text blocks are ignored.
 */
export const getImageUrlsFromContent = (content: unknown): string[] => {
  if (!Array.isArray(content)) return [];
  const urls: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "image" &&
      Array.isArray((block as { image_urls?: unknown }).image_urls)
    ) {
      for (const url of (block as { image_urls: unknown[] }).image_urls) {
        if (isRenderableImageUrl(url)) urls.push(url);
      }
    }
  }
  return urls;
};

/**
 * Every image a tool result carries that the chat can show inline: MCP tool
 * results (e.g. chrome-devtools-mcp `take_screenshot` without `filePath`),
 * the legacy `BrowserObservation.screenshot_data`, finish/other observations
 * with image blocks, and ACP tool calls that attached an image.
 */
export const getObservationImageUrls = (event: OpenHandsEvent): string[] => {
  if (isObservationEvent(event)) {
    const { observation } = event;
    const urls = getImageUrlsFromContent(
      (observation as { content?: unknown }).content,
    );
    if (
      observation.kind === "BrowserObservation" &&
      observation.screenshot_data
    ) {
      urls.push(toImageDataUri(observation.screenshot_data));
    }
    return urls;
  }
  if (isACPToolCallEvent(event)) {
    const uri = getACPToolCallImageDataUri(event);
    return uri ? [uri] : [];
  }
  return [];
};

/** Markdown image lines for an observation card body. */
export const imagesToMarkdown = (urls: string[], alt: string): string =>
  urls
    .map(
      (url, index) =>
        `![${urls.length > 1 ? `${alt} ${index + 1}` : alt}](${url})`,
    )
    .join("\n\n");
