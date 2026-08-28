/**
 * Multer (and some browsers) may deliver UTF-8 filenames as latin1 bytes.
 * Reconstruct readable CJK names for display.
 */
export function decodeUploadName(filename) {
  const raw = String(filename || "");
  if (!raw) return raw;
  try {
    const bytes = Uint8Array.from(Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!decoded || decoded.includes("\uFFFD")) return raw;
    if (decoded !== raw && /[^\u0000-\u007f]/.test(decoded)) return decoded;
  } catch {
    // keep original
  }
  return raw;
}
