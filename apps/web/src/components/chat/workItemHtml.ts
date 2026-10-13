import DOMPurify from "dompurify";

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
];

/** Azure work item HTML, with scripts and non-http links removed. */
export function workItemHtml(value: string): string {
  const clean = DOMPurify.sanitize(value, {
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
  "text-sm leading-6 [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5";
