import { diffArrays, diffWords } from "diff";

const BRANDING_BLOCK_RE =
  /<(p|li|h[1-6]|blockquote|div)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const BRANDING_LINE_BREAK_RE = /<br\s*\/?>/gi;

/** Whole block accent when HTML is too rich for safe inline diff. */
export const BRANDING_DIFF_BLOCK_CLASS =
  "border-l-4 border-amber-400 bg-amber-50 pl-3 py-2 rounded-r my-1.5";

const INLINE_MARK_CLASS =
  "font-semibold text-amber-950 underline decoration-amber-500 decoration-2 underline-offset-2";
const DIFF_LINE_CLASS =
  "border-l-4 border-amber-400 bg-amber-50 pl-3 pr-2 py-1.5 my-1 rounded-r";

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

function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity) => {
    const e = String(entity).toLowerCase();
    if (e === "nbsp") return " ";
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    if (e.startsWith("#x")) {
      const code = Number.parseInt(e.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (e.startsWith("#")) {
      const code = Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return full;
  });
}

function normalizeTextLine(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function instructionLinesFromHtml(html: string): string[] {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(BRANDING_LINE_BREAK_RE, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map(normalizeTextLine)
    .filter(Boolean);
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
      right += `<span class="${INLINE_MARK_CLASS}">${esc}</span>`;
    } else if (part.removed) {
      left += `<span class="${INLINE_MARK_CLASS}">${esc}</span>`;
    } else {
      left += esc;
      right += esc;
    }
  }
  return { left, right };
}

function buildChangedLinePairHtml(lineA: string, lineB: string): { left: string; right: string } {
  const { left, right } = buildWordDiffPairHtml(lineA, lineB);
  return {
    left: `<div class="${DIFF_LINE_CLASS}">${left}</div>`,
    right: `<div class="${DIFF_LINE_CLASS}">${right}</div>`,
  };
}

function buildAddedRemovedLineHtml(line: string): string {
  return `<div class="${DIFF_LINE_CLASS}"><span class="${INLINE_MARK_CLASS}">${escapeHtml(
    line
  )}</span></div>`;
}

function buildUnchangedLineHtml(line: string): string {
  return `<div>${escapeHtml(line)}</div>`;
}

function lineKey(line: string): string {
  return normalizeForComparison(line);
}

function lineSimilarity(a: string, b: string): number {
  const tokensA = new Set(lineKey(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(lineKey(b).split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) shared++;
  }
  return shared / Math.max(tokensA.size, tokensB.size);
}

function closestPeerLine(line: string, peerLines: string[], sameIndexPeers: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const peer of sameIndexPeers) {
    if (lineKey(peer) === lineKey(line)) continue;
    const score = lineSimilarity(line, peer);
    if (score > bestScore) {
      best = peer;
      bestScore = score;
    }
  }
  if (bestScore >= 0.55) return best;

  for (const peer of peerLines) {
    if (lineKey(peer) === lineKey(line)) continue;
    const score = lineSimilarity(line, peer);
    if (score > bestScore) {
      best = peer;
      bestScore = score;
    }
  }
  return bestScore >= 0.7 ? best : null;
}

function buildChangedLineAgainstPeerHtml(line: string, peer: string | null): string {
  if (!peer) return buildAddedRemovedLineHtml(line);
  const { right } = buildWordDiffPairHtml(peer, line);
  return `<div class="${DIFF_LINE_CLASS}">${right}</div>`;
}

function buildLineDiffPairHtml(linesA: string[], linesB: string[]): { htmlA: string; htmlB: string } {
  const parts = diffArrays(linesA, linesB);
  const outA: string[] = [];
  const outB: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    if (part.removed && next?.added) {
      const n = Math.max(part.value.length, next.value.length);
      for (let j = 0; j < n; j++) {
        const leftLine = part.value[j];
        const rightLine = next.value[j];
        if (leftLine !== undefined && rightLine !== undefined) {
          const pair = buildChangedLinePairHtml(leftLine, rightLine);
          outA.push(pair.left);
          outB.push(pair.right);
        } else if (leftLine !== undefined) {
          outA.push(buildAddedRemovedLineHtml(leftLine));
          outB.push("");
        } else if (rightLine !== undefined) {
          outA.push("");
          outB.push(buildAddedRemovedLineHtml(rightLine));
        }
      }
      i++;
      continue;
    }
    if (part.removed) {
      for (const line of part.value) {
        outA.push(buildAddedRemovedLineHtml(line));
        outB.push("");
      }
      continue;
    }
    if (part.added) {
      for (const line of part.value) {
        outA.push("");
        outB.push(buildAddedRemovedLineHtml(line));
      }
      continue;
    }
    for (const line of part.value) {
      const unchanged = buildUnchangedLineHtml(line);
      outA.push(unchanged);
      outB.push(unchanged);
    }
  }

  return { htmlA: outA.join(""), htmlB: outB.join("") };
}

function buildLineDiffSetHtml(linesByWindow: string[][]): string[] {
  const windowCount = linesByWindow.length;
  const lineWindows = new Map<string, Set<number>>();
  for (let windowIndex = 0; windowIndex < linesByWindow.length; windowIndex++) {
    const seenInWindow = new Set<string>();
    for (const line of linesByWindow[windowIndex]) {
      const key = lineKey(line);
      if (key) seenInWindow.add(key);
    }
    for (const key of seenInWindow) {
      const windows = lineWindows.get(key) ?? new Set<number>();
      windows.add(windowIndex);
      lineWindows.set(key, windows);
    }
  }

  return linesByWindow.map((lines, windowIndex) => {
    const peerLines = linesByWindow.flatMap((peer, peerIndex) =>
      peerIndex === windowIndex ? [] : peer
    );
    return lines
      .map((line, lineIndex) => {
        const key = lineKey(line);
        if (key && lineWindows.get(key)?.size === windowCount) {
          return buildUnchangedLineHtml(line);
        }
        const sameIndexPeers = linesByWindow.flatMap((peer, peerIndex) =>
          peerIndex === windowIndex ? [] : peer[lineIndex] !== undefined ? [peer[lineIndex]] : []
        );
        return buildChangedLineAgainstPeerHtml(
          line,
          closestPeerLine(line, peerLines, sameIndexPeers)
        );
      })
      .join("");
  });
}

function wrapBlockWhole(tag: string, attrs: string, inner: string): string {
  const merged = mergeHtmlClass(attrs, BRANDING_DIFF_BLOCK_CLASS);
  return `<${tag}${merged}>${inner}</${tag}>`;
}

/**
 * Side-by-side instructions: prefer visible line rows so <br>-separated contact
 * blocks stay comparable. This intentionally flattens links/lists/formatting in
 * diff mode; exact sanitized HTML is preserved only when the line path is not usable.
 */
export function highlightInstructionPairwise(
  htmlA: string,
  htmlB: string
): { htmlA: string; htmlB: string } {
  const linesA = instructionLinesFromHtml(htmlA);
  const linesB = instructionLinesFromHtml(htmlB);
  if (
    linesA.length > 0 &&
    linesB.length > 0 &&
    normalizeForComparison(linesA.join(" ")) !== normalizeForComparison(linesB.join(" "))
  ) {
    return buildLineDiffPairHtml(linesA, linesB);
  }

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

/**
 * Multi-window instructions: any visible line not shared by every non-empty window
 * gets a line callout. Empty instruction windows are left as original HTML instead
 * of disabling highlights for the rest of the group.
 */
export function highlightInstructionSet(htmls: string[]): string[] {
  if (htmls.length <= 1) return htmls;
  if (htmls.length === 2) {
    const { htmlA, htmlB } = highlightInstructionPairwise(htmls[0], htmls[1]);
    return [htmlA, htmlB];
  }

  const linesByWindow = htmls.map(instructionLinesFromHtml);
  const nonEmptyIndexes = linesByWindow
    .map((lines, index) => ({ lines, index }))
    .filter(({ lines }) => lines.length > 0);
  if (nonEmptyIndexes.length <= 1) return htmls;
  const comparable = nonEmptyIndexes.map(({ lines }) => normalizeForComparison(lines.join(" ")));
  if (new Set(comparable).size <= 1) return htmls;
  const highlighted = buildLineDiffSetHtml(nonEmptyIndexes.map(({ lines }) => lines));
  const out = [...htmls];
  for (let i = 0; i < nonEmptyIndexes.length; i++) {
    out[nonEmptyIndexes[i].index] = highlighted[i];
  }
  return out;
}
