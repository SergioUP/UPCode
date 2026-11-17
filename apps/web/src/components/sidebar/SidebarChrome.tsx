import {
  ArrowLeftIcon,
  BrainIcon,
  ChartNoAxesColumnIcon,
  SettingsIcon,
  VaultIcon,
} from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement, memo, useCallback } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { useServerConfigs } from "../../state/entities";
import { cn } from "../../lib/utils";
import { UpMark } from "../UpMark";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { AzureDevOpsGlyphIcon, AzureDevOpsIcon } from "~/components/Icons";
import { observeResize } from "~/lib/observeResize";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    // The titlebar row, not a padded SidebarHeader: it aligns to the window controls.
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      {/* Match the fixed control's inset and border compensation inside the sheet's safe area. */}
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          // Over the stage artwork: the media viewer's control-on-imagery treatment.
          variant={backdropVariant ? "media-navigation" : "ghost"}
          className="relative top-auto translate-y-0"
          aria-label="Toggle main sidebar"
        />
      </div>
      {/* One visible line: the pill wraps onto the clipped second line once it no longer fits.
          The padding keeps the brand's focus ring inside the clip. */}
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <SidebarBrand onBackdrop={backdropVariant !== null} />
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
});

// Measures the brand at its titlebar inset, plus the header's right padding and the
// sidebar border, so the sidebar minimum follows font size, zoom and macOS window controls.
export function SidebarBrandWidthProbe({
  onWidthChange,
}: {
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = useCallback(
    (probe: HTMLDivElement) => {
      return observeResize(probe, ([entry]) => {
        if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
      });
    },
    [onWidthChange],
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex">
        <SidebarBrandMark onBackdrop={false} />
      </div>
    </div>
  );
}

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <SidebarBrandMark onBackdrop={onBackdrop} />
    </Link>
  );
}

function SidebarBrandMark({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    // Center the visible capitals, without the font's ascender/descender space.
    // Padding keeps ascenders and round-letter overshoot inside the truncation clip.
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <UpMark aria-label="UP" className="h-[1cap] w-auto shrink-0" />
      <span
        className={cn(
          "truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </span>
    </span>
  );
}

/**
 * Colour has to be set on the glyph itself: `SidebarMenuButton` paints every
 * direct `svg` with `[&>svg]:text-[var(--sidebar-icon-color)]`, which outranks
 * any class or inherited colour. An inline style on the element, however, wins.
 */
function colorIcon(icon: ReactNode, color: string | undefined): ReactNode {
  if (color === undefined || !isValidElement(icon)) return icon;
  return cloneElement(icon as ReactElement<{ style?: CSSProperties }>, { style: { color } });
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
  color,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  /** Each section owns a hue, so the row reads as a palette instead of grey glyphs. */
  color?: string | undefined;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              aria-label={label}
              onClick={onClick}
              size="icon"
              style={color === undefined ? undefined : { color }}
            >
              {colorIcon(icon, color)}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

/** The row's palette: one hue per section, tuned to stay readable on both themes. */
const UTILITY_COLORS = {
  settings: "hsl(220 12% 62%)",
  devops: "#4c9aff",
  brain: "hsl(272 85% 70%)",
  vault: "hsl(32 65% 60%)",
  pullRequests: "hsl(152 70% 52%)",
  usage: "hsl(40 95% 58%)",
} as const;

interface SidebarUtilityEntry {
  readonly key: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  /** Each section owns a hue, so the row reads as a palette instead of grey glyphs. */
  readonly color?: string;
}

function useBackToMainApp() {
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  return useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigateToMainApp();
  }, [isMobile, navigateToMainApp, setOpenMobile]);
}

/** The sections the utility menu offers, shared by the compact icon row and the full list. */
function useUtilityEntries(): ReadonlyArray<SidebarUtilityEntry> {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const serverConfigs = useServerConfigs();

  /**
   * The provider's own allowance, the same figure the composer shows: the
   * five-hour window when the provider reports one. Subscription drivers
   * (Claude Code, Codex) publish it; API-key drivers never do, and then there is
   * no badge at all rather than a fake zero.
   */
  const allowance = (() => {
    for (const config of serverConfigs.values()) {
      for (const provider of config.providers) {
        const window = provider.usageLimits?.windows.find(
          (entry) => entry.windowDurationMins === 300 || entry.id === "five_hour",
        );
        if (window === undefined) continue;
        return {
          remaining: Math.max(0, Math.round(100 - window.usedPercent)),
          label: window.label,
          provider: provider.displayName ?? provider.driver,
          resetsAt: window.resetsAt,
        };
      }
    }
    return null;
  })();
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const handleSettingsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings" });
  }, [closeMobileSidebar, navigate]);
  const handleDevOpsClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/issues" });
  }, [closeMobileSidebar, navigate]);

  const handleBrainClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/brain" });
  }, [closeMobileSidebar, navigate]);

  const handleAzureReposClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/azure-repos" });
  }, [closeMobileSidebar, navigate]);

  const handleVaultClick = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/vault" });
  }, [closeMobileSidebar, navigate]);

  const handleUsageClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  return [
    {
      key: "settings",
      icon: <SettingsIcon className="text-current" />,
      label: "Settings",
      onClick: handleSettingsClick,
      color: UTILITY_COLORS.settings,
    },
    {
      key: "devops",
      icon: <AzureDevOpsIcon className="size-4" />,
      label: "DevOps",
      onClick: handleDevOpsClick,
      color: UTILITY_COLORS.devops,
    },
    {
      key: "brain",
      icon: <BrainIcon className="size-4 text-current" />,
      label: "Cerebro",
      onClick: handleBrainClick,
      color: UTILITY_COLORS.brain,
    },
    {
      key: "vault",
      icon: <VaultIcon className="size-4 text-current" />,
      label: "Baúl",
      onClick: handleVaultClick,
      color: UTILITY_COLORS.vault,
    },
    {
      key: "devops-pr",
      icon: <AzureDevOpsGlyphIcon className="size-4 text-current" />,
      label: "DevOps PR",
      onClick: handleAzureReposClick,
      color: UTILITY_COLORS.pullRequests,
    },
    {
      key: "usage",
      icon: <ChartNoAxesColumnIcon className="text-current" />,
      label:
        allowance === null
          ? "Usage"
          : `Usage: ${allowance.remaining}% restante de ${allowance.provider} (${allowance.label})`,
      onClick: handleUsageClick,
      color: UTILITY_COLORS.usage,
    },
  ];
}

export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const entries = useUtilityEntries();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const handleBackClick = useBackToMainApp();

  return (
    <SidebarMenu className="flex-row items-center">
      {isOnUtilityPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : (
        entries.map((entry) => (
          <SidebarUtilityItem
            key={entry.key}
            icon={entry.icon}
            label={entry.label}
            onClick={entry.onClick}
            color={entry.color}
          />
        ))
      )}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
