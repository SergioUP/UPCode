import {
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  BugIcon,
  CompassIcon,
  CpuIcon,
  DatabaseIcon,
  FileSearchIcon,
  GaugeIcon,
  GitBranchIcon,
  GlobeIcon,
  LayersIcon,
  LockIcon,
  MicroscopeIcon,
  PaletteIcon,
  RocketIcon,
  ScanSearchIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  TestTubeIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * The icon set a subagent can wear.
 *
 * A fixed list instead of "any Lucide icon" keeps the picker scannable and means
 * an unknown name stored by an older build still resolves to something sane.
 */
export const SUBAGENT_ICONS: ReadonlyArray<{ name: string; Icon: LucideIcon }> = [
  { name: "bot", Icon: BotIcon },
  { name: "brain", Icon: BrainIcon },
  { name: "scan-search", Icon: ScanSearchIcon },
  { name: "database", Icon: DatabaseIcon },
  { name: "shield-check", Icon: ShieldCheckIcon },
  { name: "wrench", Icon: WrenchIcon },
  { name: "bug", Icon: BugIcon },
  { name: "rocket", Icon: RocketIcon },
  { name: "palette", Icon: PaletteIcon },
  { name: "git-branch", Icon: GitBranchIcon },
  { name: "server", Icon: ServerIcon },
  { name: "test-tube", Icon: TestTubeIcon },
  { name: "file-search", Icon: FileSearchIcon },
  { name: "book-open", Icon: BookOpenIcon },
  { name: "zap", Icon: ZapIcon },
  { name: "compass", Icon: CompassIcon },
  { name: "layers", Icon: LayersIcon },
  { name: "cpu", Icon: CpuIcon },
  { name: "globe", Icon: GlobeIcon },
  { name: "lock", Icon: LockIcon },
  { name: "sparkles", Icon: SparklesIcon },
  { name: "terminal", Icon: TerminalIcon },
  { name: "gauge", Icon: GaugeIcon },
  { name: "microscope", Icon: MicroscopeIcon },
];

const BY_NAME = new Map(SUBAGENT_ICONS.map((entry) => [entry.name, entry.Icon]));

/** Falls back to the bot, so a missing or renamed icon never breaks a card. */
export function resolveSubagentIcon(name: string | undefined): LucideIcon {
  if (name === undefined) return BotIcon;
  return BY_NAME.get(name) ?? BotIcon;
}

/** Ten hues, spread so two neighbouring cards never look the same. */
export const SUBAGENT_HUES = [8, 24, 48, 96, 152, 190, 214, 258, 292, 322] as const;

export function subagentColor(hue: number | undefined, seen = true): string {
  const value = hue ?? 214;
  return seen ? `hsl(${value} 85% 62%)` : `hsl(${value} 30% 30%)`;
}

/** A stable pick for a new role, so creating several does not look cloned. */
export function nextSubagentLook(existing: ReadonlyArray<{ icon?: string; hue?: number }>): {
  icon: string;
  hue: number;
} {
  const usedIcons = new Set(existing.map((subagent) => subagent.icon));
  const icon =
    SUBAGENT_ICONS.find((entry) => !usedIcons.has(entry.name))?.name ??
    SUBAGENT_ICONS[existing.length % SUBAGENT_ICONS.length]!.name;
  const hue = SUBAGENT_HUES[existing.length % SUBAGENT_HUES.length]!;
  return { icon, hue };
}
