/** Extracts the clean src URL from a pasted <iframe> embed snippet. */
export function sanitizeVideoEmbedUrl(input: string): string {
  if (!input) return "";
  let clean = input.trim();
  const m = clean.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (m?.[1]) clean = m[1].trim();
  if (clean.startsWith("//")) clean = `https:${clean}`;
  return clean.replace(/&amp;/g, "&");
}
