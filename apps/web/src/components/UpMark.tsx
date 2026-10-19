import type { CSSProperties, ComponentProps } from "react";

import { cn } from "~/lib/utils";

/**
 * The UPCode mark, painted from the artwork with a CSS mask instead of a traced
 * path: the shape keeps the logo's own geometry and the ink stays `currentColor`,
 * which is what the sidebar, the welcome screen and the agent avatar all need.
 *
 * `apps/web/public/up-mark.png` is the tight monochrome export of that artwork.
 * Only its alpha channel is read, so the file colour never leaks into the UI.
 */
const MARK_MASK_STYLE = {
  maskImage: "url(/up-mark.png)",
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskImage: "url(/up-mark.png)",
  WebkitMaskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
} satisfies CSSProperties;

/** Sizes like a glyph: pass a height and the mark keeps its own aspect ratio. */
export function UpMark({ className, style, ...props }: ComponentProps<"span">) {
  return (
    <span
      role="img"
      aria-label="UP"
      className={cn("inline-block aspect-[708/366] shrink-0 bg-current", className)}
      style={{ ...MARK_MASK_STYLE, ...style }}
      {...props}
    />
  );
}
