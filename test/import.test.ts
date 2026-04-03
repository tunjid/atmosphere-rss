import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseFeed } from "../src/parse.js";
import { buildDocumentRecord, buildPublicationRecord } from "../src/records.js";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

function mockAgent() {
  return {
    did: "did:plc:test123",
    com: {
      atproto: {
        repo: {
          putRecord: vi.fn().mockResolvedValue({}),
          uploadBlob: vi.fn().mockResolvedValue({
            data: {
              blob: {
                $type: "blob",
                ref: { $link: "bafkreitest" },
                mimeType: "image/png",
                size: 1000,
              },
            },
          }),
        },
      },
    },
  } as unknown as import("@atproto/api").Agent;
}

describe("buildPublicationRecord", () => {
  it("builds a valid publication record", async () => {
    const feed = parseFeed(fixture("rss2-blog.xml"));
    const agent = mockAgent();
    const record = await buildPublicationRecord(agent, feed.publication);

    expect(record.$type).toBe("site.standard.publication");
    expect(record.url).toBe("https://example.com");
    expect(record.name).toBe("My Blog");
    expect(record.description).toBe("A test blog");
  });

  it("truncates long names to 128 graphemes", async () => {
    const agent = mockAgent();
    const record = await buildPublicationRecord(agent, {
      name: "A".repeat(200),
      url: "https://example.com",
      description: null,
      iconUrl: null,
    });
    expect((record.name as string).length).toBe(128);
  });
});

describe("buildDocumentRecord", () => {
  it("builds a blog document record", async () => {
    const feed = parseFeed(fixture("rss2-blog.xml"));
    const agent = mockAgent();
    const item = feed.items[0];
    const record = await buildDocumentRecord(
      agent,
      item,
      "at://did:plc:test/site.standard.publication/abc"
    );

    expect(record.$type).toBe("site.standard.document");
    expect(record.site).toBe(
      "at://did:plc:test/site.standard.publication/abc"
    );
    expect(record.title).toBe("First Post");
    expect(record.path).toBe("/blog/first-post");
    expect(record.description).toBe("A short description");
    expect(record.tags).toEqual(["tech", "blog"]);
    // No content union — no custom lexicons
    expect(record.content).toBeUndefined();
  });
});
