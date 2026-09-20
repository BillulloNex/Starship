import { describe, expect, it } from "vitest";

import {
  formatRunningTitle,
  RUNNING_TITLE_FRAMES,
} from "#/utils/running-title-frames";

describe("formatRunningTitle", () => {
  it("prefixes the base title with the current spinner frame", () => {
    expect(formatRunningTitle("My Conversation | Starship", 0)).toBe(
      `${RUNNING_TITLE_FRAMES[0]} My Conversation | Starship`,
    );
    expect(formatRunningTitle("My Conversation | Starship", 1)).toBe(
      `${RUNNING_TITLE_FRAMES[1]} My Conversation | Starship`,
    );
  });

  it("wraps the frame index around the spinner cycle", () => {
    expect(formatRunningTitle("Starship", RUNNING_TITLE_FRAMES.length)).toBe(
      `${RUNNING_TITLE_FRAMES[0]} Starship`,
    );
  });
});
