export function slugFromText(text: string) {
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host) return host;
  } catch {
    // not a URL: fall through to slugging the text
  }
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "qr-code";
}
