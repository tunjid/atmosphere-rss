import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseFeed } from "../src/parse.js";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("parseFeed — RSS 2.0 blog", () => {
  const feed = parseFeed(fixture("rss2-blog.xml"));

  it("parses publication metadata", () => {
    expect(feed.publication.name).toBe("My Blog");
    expect(feed.publication.url).toBe("https://example.com");
    expect(feed.publication.description).toBe("A test blog");
    expect(feed.publication.iconUrl).toBe("https://example.com/icon.png");
  });

  it("parses all items", () => {
    expect(feed.items).toHaveLength(3);
  });

  it("parses item with content:encoded", () => {
    const item = feed.items[0];
    expect(item.title).toBe("First Post");
    expect(item.link).toBe("https://example.com/blog/first-post");
    expect(item.path).toBe("/blog/first-post");
    expect(item.description).toBe("A short description");
    expect(item.contentHtml).toBe("<p>Full HTML content here</p>");
    expect(item.publishedAt).toBe("2024-01-20T14:30:00.000Z");
    expect(item.tags).toEqual(["tech", "blog"]);
  });

  it("handles item without date", () => {
    const item = feed.items[2];
    expect(item.title).toBe("No Date Post");
    expect(item.publishedAt).toBeNull();
  });

  it("is not detected as a podcast feed", () => {
    expect(feed.hasPodcastMetadata).toBe(false);
  });
});

describe("parseFeed — RSS 2.0 podcast", () => {
  const feed = parseFeed(fixture("rss2-podcast.xml"));

  it("parses podcast publication", () => {
    expect(feed.publication.name).toBe("My Podcast");
    expect(feed.publication.iconUrl).toBe(
      "https://podcast.example.com/artwork.jpg"
    );
  });

  it("detects iTunes podcast metadata at channel level", () => {
    expect(feed.hasPodcastMetadata).toBe(true);
  });

  it("parses podcast episode enclosures", () => {
    const item = feed.items[0];
    expect(item.enclosures).toHaveLength(1);
    expect(item.enclosures[0]).toEqual({
      url: "https://cdn.example.com/ep1.mp3",
      mimeType: "audio/mpeg",
      length: 52428800,
    });
  });
});

describe("parseFeed — Atom", () => {
  const feed = parseFeed(fixture("atom-blog.xml"));

  it("parses Atom publication metadata", () => {
    expect(feed.publication.name).toBe("Atom Blog");
    expect(feed.publication.url).toBe("https://atom.example.com");
    expect(feed.publication.description).toBe("An Atom feed");
    expect(feed.publication.iconUrl).toBe(
      "https://atom.example.com/favicon.png"
    );
  });

  it("parses Atom entries", () => {
    expect(feed.items).toHaveLength(2);
  });

  it("parses entry with HTML content", () => {
    const item = feed.items[0];
    expect(item.title).toBe("Hello World");
    expect(item.link).toBe("https://atom.example.com/hello-world");
    expect(item.path).toBe("/hello-world");
    expect(item.description).toBe("A summary of the post");
    expect(item.contentHtml).toBe(
      "<h1>Hello World</h1><p>Content here</p>"
    );
    expect(item.publishedAt).toBe("2024-02-01T12:00:00.000Z");
    expect(item.tags).toEqual(["intro", "first"]);
  });

  it("falls back to updated date when published is missing", () => {
    const item = feed.items[1];
    expect(item.publishedAt).toBe("2024-02-02T15:00:00.000Z");
  });

  it("is not detected as a podcast feed", () => {
    expect(feed.hasPodcastMetadata).toBe(false);
  });
});

describe("parseFeed — MRSS video", () => {
  const feed = parseFeed(fixture("mrss-video.xml"));

  it("parses video publication", () => {
    expect(feed.publication.name).toBe("Video Channel");
  });

  it("parses video enclosure from media:content", () => {
    const item = feed.items[0];
    expect(item.enclosures).toHaveLength(1);
    expect(item.enclosures[0].url).toBe(
      "https://cdn.example.com/video.mp4"
    );
    expect(item.enclosures[0].mimeType).toBe("video/mp4");
  });

  it("extracts cover image from media:thumbnail", () => {
    const item = feed.items[0];
    expect(item.coverImageUrl).toBe("https://cdn.example.com/thumb.jpg");
  });
});

describe("parseFeed — declared AT URI", () => {
  it("extracts declaredAtUri from atom:link in RSS feed", () => {
    const feed = parseFeed(fixture("rss2-with-atproto.xml"));
    expect(feed.declaredAtUri).toBe(
      "at://did:plc:abc123/site.standard.publication/3lwafzkjqm25s"
    );
  });

  it("returns undefined when no AT URI is declared", () => {
    const feed = parseFeed(fixture("rss2-blog.xml"));
    expect(feed.declaredAtUri).toBeUndefined();
  });
});

describe("parseFeed — error handling", () => {
  it("throws on invalid XML", () => {
    expect(() => parseFeed("not xml")).toThrow("Unrecognized feed format");
  });

  it("throws on unrecognized format", () => {
    expect(() => parseFeed('<?xml version="1.0"?><unknown/>')).toThrow(
      "Unrecognized feed format"
    );
  });
});
