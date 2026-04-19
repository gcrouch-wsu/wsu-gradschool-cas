export function sanitizeBrandingHtml(input: string): string {
  if (!input.trim()) return "";
  let out = input;
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/\sstyle\s*=\s*(['"])(?:(?!\1).)*\1/gi, "");
  out = out.replace(/\shref\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, ' href="#"');
  out = out.replace(/\ssrc\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, "");
  return out;
}
