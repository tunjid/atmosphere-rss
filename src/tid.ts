const BASE32_SORT = "234567abcdefghijklmnopqrstuvwxyz";

function encodeBase32Sort(value: bigint, length: number): string {
  const chars: string[] = [];
  let v = value;
  for (let i = 0; i < length; i++) {
    chars.unshift(BASE32_SORT[Number(v & 31n)]);
    v >>= 5n;
  }
  return chars.join("");
}

/**
 * Generate a TID from a date and an arbitrary string.
 * The date is truncated to second precision (milliseconds floored)
 * for compatibility with RSS date formats (RFC 2822 has second-level granularity).
 * The string is SHA-256 hashed to derive the 10-bit clockId.
 */
export async function tidFromDateAndString(
  date: Date,
  str: string
): Promise<string> {
  const dateMs = Math.floor(date.getTime() / 1000) * 1000;
  const microseconds = BigInt(dateMs) * 1000n;

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  const hashView = new DataView(hashBuffer);
  const clockId = BigInt(hashView.getUint16(0)) & 0x3ffn;

  const tid = (microseconds << 10n) | clockId;
  return encodeBase32Sort(tid, 13);
}

/**
 * Generate a TID from a date only (clockId = 0).
 */
export function tidFromDate(date: Date): string {
  const microseconds = BigInt(date.getTime()) * 1000n;
  const tid = microseconds << 10n;
  return encodeBase32Sort(tid, 13);
}
