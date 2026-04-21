import { diffWords } from "diff";

const BRANDING_BLOCK_RE =
  /<(p|li|h[1-6]|blockquote|div)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const BRANDING_LINE_BREAK_RE = /<br\s*\/?>/gi;

/** Whole block accent when HTML is too rich for safe inline diff. */
export const BRANDING_DIFF_BLOCK_CLASS =
  "border-l-4 border-amber-400 bg-amber-50 pl-3 py-2 rounded-r my-1.5";

const INLINE_MARK_CLASS =
  "bg-amber-100/90 text-amber-950 rounded px-0.5 box-decoration-clone";

function normalizeForComparison(value: string): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text for diffing (br → space; strip other tags). */
export function stripInnerForDiff(inner: string): string {
  return inner
    .replace(BRANDING_LINE_BREAK_RE, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if inner has markup beyond <br>, so we keep block-level highlight only. */
export function hasNestedMarkup(inner: string): boolean {
  const withoutBr = inner.replace(BRANDING_LINE_BREAK_RE, "");
  return /<[^>]+>/.test(withoutBr);
}

function mergeHtmlClass(attrs: string, cls: string): string {
  const a = attrs.trim();
  const m = a.match(/class\s*=\s*"([^"]*)"/i);
  if (m) {
    return a.replace(/class\s*=\s*"[^"]*"/i, `class="${m[1]} ${cls}"`);
  }
  return `${a ? `${a} ` : ""}class="${cls}"`;
}

export type BrandingBlock = {
  tag: string;
  attrs: string;
  inner: string;
};

export function extractBrandingBlocks(html: string): BrandingBlock[] {
  const blocks: BrandingBlock[] = [];
  const re = new RegExp(BRANDING_BLOCK_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    blocks.push({ tag: m[1], attrs: m[2] || "", inner: m[3] });
  }
  if (blocks.length === 0 && html.trim()) {
    blocks.push({ tag: "div", attrs: "", inner: html });
  }
  return blocks;
}

function buildWordDiffPairHtml(plainA: string, plainB: string): { left: string; right: string } {
  const parts = diffWords(plainA, plainB);
  let left = "";
  let right = "";
  for (const part of parts) {
    const esc = escapeHtml(part.value);
    if (part.added) {
      right += `<mark class="${INLINE_MARK_CLASS}">${esc}</mark>`;
    } else if (part.removed) {
      left += `<mark class="${INLINE_MARK_CLASS}">${esc}</mark>`;
    } else {
      left += esc;
      right += esc;
    }
  }
  return { left, right };
}

function wrapBlockWhole(tag: string, attrs: string, inner: string): string {
  const merged = mergeHtmlClass(attrs, BRANDING_DIFF_BLOCK_CLASS);
  return `<${tag}${merged}>${inner}</${tag}>`;
}

/**
 * Side-by-side instructions: word-level highlights where plain text differs.
 * Falls back to block-level left accent when markup is nested (not just &lt;br&gt;).
 */
export function highlightInstructionPairwise(
  htmlA: string,
  htmlB: string
): { htmlA: string; htmlB: string } {
  const blocksA = extractBrandingBlocks(htmlA);
  const blocksB = extractBrandingBlocks(htmlB);
  const n = Math.max(blocksA.length, blocksB.length);
  const outA: string[] = [];
  const outB: string[] = [];

  for (let i = 0; i < n; i++) {
    const ba = blocksA[i];
    const bb = blocksB[i];
    if (ba && !bb) {
      outA.push(wrapBlockWhole(ba.tag, ba.attrs, ba.inner));
      outB.push("");
      continue;
    }
    if (!ba && bb) {
      outA.push("");
      outB.push(wrapBlockWhole(bb.tag, bb.attrs, bb.inner));
      continue;
    }
    if (!ba || !bb) continue;

    const plainA = stripInnerForDiff(ba.inner);
    const plainB = stripInnerForDiff(bb.inner);
    const na = normalizeForComparison(plainA);
    const nb = normalizeForComparison(plainB);

    if (na === nb) {
      outA.push(`<${ba.tag}${ba.attrs}>${ba.inner}</${ba.tag}>`);
      outB.push(`<${bb.tag}${bb.attrs}>${bb.inner}</${bb.tag}>`);
      continue;
    }

    if (!hasNestedMarkup(ba.inner) && !hasNestedMarkup(bb.inner)) {
      const { left, right } = buildWordDiffPairHtml(plainA, plainB);
      outA.push(`<${ba.tag}${ba.attrs}>${left}</${ba.tag}>`);
      outB.push(`<${bb.tag}${bb.attrs}>${right}</${bb.tag}>`);
    } else {
      outA.push(wrapBlockWhole(ba.tag, ba.attrs, ba.inner));
      outB.push(wrapBlockWhole(bb.tag, bb.attrs, bb.inner));
    }
  }

  return { htmlA: outA.join(""), htmlB: outB.join("") };
}
