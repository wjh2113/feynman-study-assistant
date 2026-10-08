/**
 * PostgreSQL jsonb rejects \u0000 inside string values ("unsupported Unicode escape sequence").
 * Strip NULs and lone UTF-16 surrogates before JSON.stringify → ::jsonb.
 */

export function sanitizeJsonbString(value = "") {
  let out = "";
  const text = String(value ?? "");
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i] + text[i + 1];
        i += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += text[i];
  }
  return out;
}

export function sanitizeForJsonb(value) {
  if (value == null) return value;
  if (typeof value === "string") return sanitizeJsonbString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(value)) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeForJsonb(item));
  if (typeof value === "object") {
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      next[sanitizeJsonbString(key)] = sanitizeForJsonb(item);
    }
    return next;
  }
  return value;
}

export function stringifyJsonb(value) {
  return JSON.stringify(sanitizeForJsonb(value));
}
