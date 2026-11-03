import { resolveSubagentIcon, subagentColor } from "./subagentIcons";

const SIZES = {
  sm: { box: "size-6", glyph: "size-3.5", text: "text-3xs" },
  md: { box: "size-9", glyph: "size-4", text: "text-2xs" },
  lg: { box: "size-12", glyph: "size-6", text: "text-sm" },
} as const;

/**
 * A role's face: the uploaded picture when there is one, the glyph and hue
 * otherwise. Both live in the same box so a list never jumps when a role gets an
 * avatar.
 */
export function SubagentAvatar({
  avatar,
  icon,
  hue,
  name,
  size = "md",
}: {
  readonly avatar?: string | undefined;
  readonly icon?: string | undefined;
  readonly hue?: number | undefined;
  readonly name: string;
  readonly size?: keyof typeof SIZES;
}) {
  const dimensions = SIZES[size];

  if (avatar !== undefined && avatar.length > 0) {
    return (
      <img
        src={avatar}
        alt=""
        aria-hidden
        className={`${dimensions.box} shrink-0 rounded-full border border-border/60 object-cover`}
      />
    );
  }

  const Icon = resolveSubagentIcon(icon);
  return (
    <span
      role="img"
      aria-label={name}
      className={`${dimensions.box} flex shrink-0 items-center justify-center rounded-full border`}
      style={{
        color: subagentColor(hue),
        background: `color-mix(in srgb, ${subagentColor(hue)} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${subagentColor(hue)} 35%, transparent)`,
      }}
    >
      <Icon className={dimensions.glyph} />
    </span>
  );
}
