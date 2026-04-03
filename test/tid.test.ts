import { describe, it, expect } from "vitest";
import { tidFromDateAndString, tidFromDate } from "../src/tid.js";

describe("tidFromDateAndString", () => {
  it("produces a 13-character base32sort string", async () => {
    const tid = await tidFromDateAndString(
      new Date("2025-04-02T10:30:00.000Z"),
      "/articles/my-post"
    );
    expect(tid).toHaveLength(13);
    expect(tid).toMatch(/^[234567a-z]{13}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const date = new Date("2024-01-20T14:30:00.000Z");
    const path = "/blog/getting-started";
    const tid1 = await tidFromDateAndString(date, path);
    const tid2 = await tidFromDateAndString(date, path);
    expect(tid1).toBe(tid2);
  });

  it("truncates milliseconds for consistency with RSS date precision", async () => {
    // These two dates differ only in milliseconds — should produce the same TID
    const tid1 = await tidFromDateAndString(
      new Date("2025-04-02T10:30:00.000Z"),
      "/test"
    );
    const tid2 = await tidFromDateAndString(
      new Date("2025-04-02T10:30:00.500Z"),
      "/test"
    );
    expect(tid1).toBe(tid2);
  });

  it("produces different TIDs for different paths", async () => {
    const date = new Date("2025-01-01T00:00:00.000Z");
    const tid1 = await tidFromDateAndString(date, "/post-a");
    const tid2 = await tidFromDateAndString(date, "/post-b");
    expect(tid1).not.toBe(tid2);
  });

  it("produces different TIDs for different dates", async () => {
    const tid1 = await tidFromDateAndString(
      new Date("2025-01-01T00:00:00.000Z"),
      "/post"
    );
    const tid2 = await tidFromDateAndString(
      new Date("2025-01-02T00:00:00.000Z"),
      "/post"
    );
    expect(tid1).not.toBe(tid2);
  });

  it("matches the tunji-web-deux implementation for known input", async () => {
    // Replicate the logic from ReactRouter.tsx:tidFromDateAndPath
    // Date: 2024-01-20T14:30:00.000Z, path: /blog/getting-started
    const date = new Date("2024-01-20T14:30:00.000Z");
    const path = "/blog/getting-started";
    const tid = await tidFromDateAndString(date, path);
    // The TID should be stable — verify it doesn't change
    expect(tid).toMatchInlineSnapshot(`"3kjg7rbo4k2at"`);
  });

  it("produces correct record key for a known tunjid.com article", async () => {
    // RSS pubDate: Mon, 08 Dec 2025 13:31:30 GMT
    // URL: https://www.tunjid.com/articles/shared-element-transitions-for-large-screened-devices-6936d332566f1145a11726a8
    const date = new Date("2025-12-08T13:31:30.000Z");
    const path =
      "/articles/shared-element-transitions-for-large-screened-devices-6936d332566f1145a11726a8";
    const tid = await tidFromDateAndString(date, path);
    expect(tid).toBe("3m7i5c3fg62tl");
  });

  it("produces the same record key for the same path on different domains", async () => {
    const date = new Date("2025-12-08T13:31:30.000Z");
    const path =
      "/articles/shared-element-transitions-for-large-screened-devices-6936d332566f1145a11726a8";

    const domains = [
      "https://www.tunjid.com",
      "https://tunjid.com",
      "https://example.com",
      "https://mirror.blog.example.org",
      "http://localhost:3000",
    ];

    const tids = await Promise.all(
      domains.map((domain) =>
        tidFromDateAndString(date, new URL(domain + path).pathname)
      )
    );

    // All TIDs should be identical — only the pathname matters
    for (const tid of tids) {
      expect(tid).toBe("3m7i5c3fg62tl");
    }
  });
});

describe("tidFromDate", () => {
  it("produces a 13-character base32sort string", () => {
    const tid = tidFromDate(new Date("2025-01-01T00:00:00.000Z"));
    expect(tid).toHaveLength(13);
    expect(tid).toMatch(/^[234567a-z]{13}$/);
  });

  it("is deterministic", () => {
    const date = new Date("2025-01-01T00:00:00.000Z");
    expect(tidFromDate(date)).toBe(tidFromDate(date));
  });

  it("produces TIDs that sort chronologically", () => {
    const earlier = tidFromDate(new Date("2024-01-01T00:00:00.000Z"));
    const later = tidFromDate(new Date("2025-01-01T00:00:00.000Z"));
    expect(earlier < later).toBe(true);
  });
});
