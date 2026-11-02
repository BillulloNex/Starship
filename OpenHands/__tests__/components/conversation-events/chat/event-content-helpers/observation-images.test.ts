import { describe, it, expect } from "vitest";
import {
  getImageUrlsFromContent,
  getObservationImageUrls,
  imagesToMarkdown,
  isRenderableImageUrl,
  toImageDataUri,
} from "#/components/conversation-events/chat/event-content-helpers/observation-images";
import { ObservationEvent } from "#/types/agent-server/core";
import {
  BrowserObservation,
  MCPToolObservation,
} from "#/types/agent-server/core/base/observation";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const makeMcpObservation = (
  content: MCPToolObservation["content"],
): ObservationEvent<MCPToolObservation> => ({
  id: "obs-1",
  timestamp: "2024-01-01T00:00:00Z",
  source: "environment",
  tool_name: "take_screenshot",
  tool_call_id: "call-1",
  action_id: "action-1",
  observation: {
    kind: "MCPToolObservation",
    tool_name: "take_screenshot",
    is_error: false,
    content,
  },
});

describe("observation-images", () => {
  it("accepts data:image and http(s) URLs only", () => {
    expect(isRenderableImageUrl(PNG)).toBe(true);
    expect(isRenderableImageUrl("https://example.com/a.png")).toBe(true);
    expect(isRenderableImageUrl("data:text/html,<b>x</b>")).toBe(false);
    expect(isRenderableImageUrl("/workspace/shot.png")).toBe(false);
    expect(isRenderableImageUrl(undefined)).toBe(false);
  });

  it("wraps raw base64 in a data URI and passes data URIs through", () => {
    expect(toImageDataUri("abc")).toBe("data:image/png;base64,abc");
    expect(toImageDataUri("abc", "image/jpeg")).toBe(
      "data:image/jpeg;base64,abc",
    );
    expect(toImageDataUri(PNG)).toBe(PNG);
  });

  it("collects image_urls from image blocks and ignores text blocks", () => {
    expect(
      getImageUrlsFromContent([
        { type: "text", text: "Saved screenshot" },
        { type: "image", image_urls: [PNG, "/not/a/url.png"] },
      ]),
    ).toEqual([PNG]);
    expect(getImageUrlsFromContent("nope")).toEqual([]);
  });

  it("reads images off an MCP tool observation", () => {
    const event = makeMcpObservation([
      { type: "text", text: "ok" },
      { type: "image", image_urls: [PNG] },
    ]);
    expect(getObservationImageUrls(event)).toEqual([PNG]);
  });

  it("reads the legacy screenshot_data off a BrowserObservation", () => {
    const event: ObservationEvent<BrowserObservation> = {
      id: "obs-2",
      timestamp: "2024-01-01T00:00:00Z",
      source: "environment",
      tool_name: "browser_navigate",
      tool_call_id: "call-2",
      action_id: "action-2",
      observation: {
        kind: "BrowserObservation",
        output: "done",
        error: null,
        screenshot_data: "iVBORw0KGgo=",
      },
    };
    expect(getObservationImageUrls(event)).toEqual([PNG]);
  });

  it("renders one markdown image per url, numbering only when several", () => {
    expect(imagesToMarkdown([PNG], "Shot")).toBe(`![Shot](${PNG})`);
    expect(imagesToMarkdown([PNG, PNG], "Shot")).toBe(
      `![Shot 1](${PNG})\n\n![Shot 2](${PNG})`,
    );
    expect(imagesToMarkdown([], "Shot")).toBe("");
  });
});
