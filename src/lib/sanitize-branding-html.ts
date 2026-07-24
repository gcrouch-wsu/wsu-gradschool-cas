const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "u",
  "ul",
]);

const VOID_TAGS = new Set(["br"]);

function sanitizeHref(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    s.startsWith("//")
  ) {
    return null;
  }
  if (s.startsWith("/") || s.startsWith("#") || s.startsWith("mailto:") || s.startsWith("tel:")) {
    return s;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Allowlist sanitizer for CAS branding / question HTML rendered on the public page.
 * Strips scripts, styles, event handlers, and disallowed tags (iframe, object, etc.).
 */
export function sanitizeBrandingHtml(input: string): string {
  if (!input.trim()) return "";

  let out = input;
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  out = out.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const isClose = full.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (isClose) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;

    if (tag === "br") return "<br>";

    if (tag === "a") {
      const hrefMatch = rawAttrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i) ?? rawAttrs.match(/\bhref\s*=\s*([^\s>]+)/i);
      const hrefRaw = hrefMatch?.[2] ?? hrefMatch?.[1] ?? "";
      const href = sanitizeHref(hrefRaw.replace(/^["']|["']$/g, ""));
      if (!href) return "<span>";
      const targetBlank = /\btarget\s*=\s*(["']?)_blank\1/i.test(rawAttrs);
      const rel = targetBlank ? ' rel="noopener noreferrer"' : "";
      const target = targetBlank ? ' target="_blank"' : "";
      return `<a href="${escapeAttr(href)}"${target}${rel}>`;
    }

    return `<${tag}>`;
  });

  return out;
}
