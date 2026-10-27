import type { ServerProviderUsageLimits } from "@t3tools/contracts";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** The provider's five-hour allowance, not its weekly or context limit. */
export function ComposerProviderLimit({
  limits,
  onOpen,
}: {
  readonly limits: ServerProviderUsageLimits | undefined;
  readonly onOpen?: (() => void) | undefined;
}) {
  const window = limits?.windows.find(
    (entry) => entry.windowDurationMins === 300 || entry.id === "five_hour",
  );
  const remaining = window ? Math.max(0, Math.round(100 - window.usedPercent)) : null;
  const label = window
    ? `${window.label}: ${remaining}% remaining${window.resetsAt ? `, resets ${new Date(window.resetsAt).toLocaleString()}` : ""}${limits?.checkedAt ? `, checked ${new Date(limits.checkedAt).toLocaleString()}` : ""}${limits?.unavailable ? "; last available reading" : ""}`
    : "Five-hour provider limit unavailable";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onOpen}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-2xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <span className="h-1.5 w-8 overflow-hidden rounded-full bg-muted-foreground/20" aria-hidden>
          {remaining !== null ? (
            <span
              className={`block h-full rounded-full ${remaining <= 15 ? "bg-destructive" : remaining <= 35 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${remaining}%` }}
            />
          ) : null}
        </span>
        <span>{remaining === null ? "—" : `${remaining}%`}</span>
      </TooltipTrigger>
      <TooltipPopup>
        {label}
        {onOpen ? " · View limits" : ""}
      </TooltipPopup>
    </Tooltip>
  );
}
