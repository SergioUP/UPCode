import DOMPurify from "dompurify";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { isMarkdownDescription, normalizeDescriptionMarkdown } from "./workItemMarkdown";

const WORK_ITEM_HTML_TAGS = [
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "p",
  "br",
  "div",
  "span",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "code",
  "pre",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "del",
];

/**
 * Azure stores a description exactly as it was sent, so one written as markdown is rendered here
 * and one written as plain text keeps its line breaks.
 */
function descriptionAsHtml(value: string): string {
  if (isMarkdownDescription(value)) {
    return renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        { remarkPlugins: [remarkGfm] },
        normalizeDescriptionMarkdown(value),
      ),
    );
  }
  return /<[a-z][^>]*>/i.test(value) ? value : value.replace(/\r?\n/g, "<br>");
}

/** Azure work item HTML, with scripts and non-http links removed. */
export function workItemHtml(value: string): string {
  const clean = DOMPurify.sanitize(descriptionAsHtml(value), {
    ALLOWED_TAGS: WORK_ITEM_HTML_TAGS,
    ALLOWED_ATTR: ["href"],
  });
  const document = new DOMParser().parseFromString(clean, "text/html");
  for (const anchor of document.querySelectorAll("a")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) {
      anchor.removeAttribute("href");
      continue;
    }
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer noopener");
  }
  return document.body.innerHTML;
}

export const WORK_ITEM_HTML_CLASS =
  "text-base leading-7 break-words [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_code]:rounded [&_code]:bg-muted [&_code]:px-1";
