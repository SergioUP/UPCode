/** Some providers report only hunks; give the parser the real filename for syntax detection. */
export function normalizeProviderPatch(diff: string, path: string): string {
  const normalized = diff.replace(/\r\n/g, "\n");
  if (/^diff --git /m.test(normalized) || /^--- .+\n\+\+\+ /m.test(normalized)) {
    return normalized;
  }
  const firstHunk = normalized.search(/^@@ /m);
  // Leave unrecognized output intact so the viewer can fall back to the exact provider text.
  if (firstHunk < 0 || !path) return normalized;
  const name = path.replace(/\\/g, "/");
  return `--- ${JSON.stringify(name)}\n+++ ${JSON.stringify(name)}\n${normalized.slice(firstHunk)}`;
}
