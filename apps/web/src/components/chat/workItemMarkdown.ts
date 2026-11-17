/** Block-level HTML that Azure's own editor writes. Its presence means the text is already HTML. */
const HTML_BLOCK = /<\/?(p|div|br|ul|ol|li|h[1-6]|table|pre|blockquote|span|strong|b|em|i)\b/i;

/** Syntax a person or an agent types when writing a description as markdown. */
const MARKDOWN_SIGNAL =
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|\*\*|\|\s*:?-{3,}|\[[^\]]+\]\([^)]+\)|`[^`\n]+`/;

/**
 * Whether a description was written as markdown rather than as Azure's HTML. Azure stores
 * whatever was sent, so descriptions written by tools and agents arrive as raw markdown and show
 * its punctuation unless they are rendered.
 */
export function isMarkdownDescription(value: string): boolean {
  return !HTML_BLOCK.test(value) && MARKDOWN_SIGNAL.test(value);
}

/**
 * Descriptions often wrap a whole italic paragraph as `***text*`, opening bold-italic and closing
 * italic only, which leaves literal asterisks behind. Read as the italic it was meant to be.
 */
export function normalizeDescriptionMarkdown(value: string): string {
  return value.replace(/^(\s*)\*{3}(?!\*)(.*[^*\s])\*(\s*)$/gm, "$1*$2*$3");
}
