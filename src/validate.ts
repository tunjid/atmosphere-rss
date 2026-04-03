import type { ParsedFeed, ParsedItem } from "./types.js";

/**
 * Validate that a parsed feed is a long-form writing feed (blog, newsletter).
 * Throws if the feed is a podcast, video feed, or other non-writing feed.
 *
 * Channel-level rejection:
 *  - iTunes podcast namespace metadata present (itunes:type, itunes:category, itunes:explicit)
 *  - Majority (>50%) of items have audio or video enclosures
 */
export function validateFeed(feed: ParsedFeed): void {
  // Channel-level: iTunes podcast namespace metadata
  if (feed.hasPodcastMetadata) {
    throw new Error(
      "This feed appears to be a podcast (iTunes namespace metadata detected). " +
        "Only long-form writing feeds (blogs, newsletters) are supported."
    );
  }

  // Channel-level: majority of items have audio/video enclosures
  const items = feed.items;
  if (items.length > 0) {
    const mediaItemCount = items.filter((item) =>
      item.enclosures.some(
        (e) =>
          e.mimeType.startsWith("audio/") || e.mimeType.startsWith("video/")
      )
    ).length;

    if (mediaItemCount / items.length > 0.5) {
      throw new Error(
        `This feed appears to be a media feed (${mediaItemCount} of ${items.length} items have audio/video enclosures). ` +
          "Only long-form writing feeds (blogs, newsletters) are supported."
      );
    }
  }
}

/**
 * Check whether a parsed item is a writing item (as opposed to purely media).
 *
 * An item is considered writing if it has written content (contentHtml or description),
 * even if it also has audio/video enclosures (e.g., a blog post with audio narration).
 *
 * An item is NOT writing if it has audio/video enclosures but no written content.
 */
export function isWritingItem(item: ParsedItem): boolean {
  const hasAudioVideo = item.enclosures.some(
    (e) =>
      e.mimeType.startsWith("audio/") || e.mimeType.startsWith("video/")
  );

  // If no audio/video enclosures, it's a writing item
  if (!hasAudioVideo) return true;

  // If it has audio/video, it's only a writing item if it also has written content
  const hasWrittenContent =
    (item.contentHtml != null && item.contentHtml.length > 0) ||
    (item.description != null && item.description.length > 0);

  return hasWrittenContent;
}
