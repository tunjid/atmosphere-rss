import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseFeed } from "../src/parse.js";
import { validateFeed, isWritingItem } from "../src/validate.js";
import type { ParsedItem } from "../src/types.js";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("validateFeed — channel-level rejection", () => {
  it("rejects podcast feeds (iTunes namespace metadata)", () => {
    const feed = parseFeed(fixture("rss2-podcast.xml"));
    expect(() => validateFeed(feed)).toThrow("podcast");
  });

  it("rejects video feeds (majority audio/video enclosures)", () => {
    const feed = parseFeed(fixture("mrss-video.xml"));
    expect(() => validateFeed(feed)).toThrow("media feed");
  });

  it("accepts blog feeds", () => {
    const feed = parseFeed(fixture("rss2-blog.xml"));
    expect(() => validateFeed(feed)).not.toThrow();
  });

  it("accepts Atom blog feeds", () => {
    const feed = parseFeed(fixture("atom-blog.xml"));
    expect(() => validateFeed(feed)).not.toThrow();
  });
});

describe("isWritingItem — item-level filtering", () => {
  const baseItem: ParsedItem = {
    title: "Test",
    link: "https://example.com/test",
    path: "/test",
    description: null,
    contentHtml: null,
    publishedAt: "2024-01-01T00:00:00.000Z",
    tags: [],
    coverImageUrl: null,
    enclosures: [],
  };

  it("accepts items with no enclosures", () => {
    expect(isWritingItem(baseItem)).toBe(true);
  });

  it("accepts items with only image enclosures", () => {
    expect(
      isWritingItem({
        ...baseItem,
        enclosures: [
          { url: "https://example.com/img.jpg", mimeType: "image/jpeg", length: null },
        ],
      })
    ).toBe(true);
  });

  it("rejects items with audio enclosure but no written content", () => {
    expect(
      isWritingItem({
        ...baseItem,
        enclosures: [
          { url: "https://example.com/ep.mp3", mimeType: "audio/mpeg", length: null },
        ],
      })
    ).toBe(false);
  });

  it("rejects items with video enclosure but no written content", () => {
    expect(
      isWritingItem({
        ...baseItem,
        enclosures: [
          { url: "https://example.com/vid.mp4", mimeType: "video/mp4", length: null },
        ],
      })
    ).toBe(false);
  });

  it("accepts items with audio enclosure AND written content (e.g. audio narration)", () => {
    expect(
      isWritingItem({
        ...baseItem,
        description: "A blog post with an audio narration",
        enclosures: [
          { url: "https://example.com/ep.mp3", mimeType: "audio/mpeg", length: null },
        ],
      })
    ).toBe(true);
  });

  it("accepts items with audio enclosure AND contentHtml", () => {
    expect(
      isWritingItem({
        ...baseItem,
        contentHtml: "<p>Full article text here</p>",
        enclosures: [
          { url: "https://example.com/ep.mp3", mimeType: "audio/mpeg", length: null },
        ],
      })
    ).toBe(true);
  });
});
