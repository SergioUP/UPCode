import type { ModelSelection, ProviderOptionSelections } from "@upcode/contracts";
import {
  getModelSelectionBooleanOptionValue,
  getModelSelectionStringOptionValue,
  getProviderOptionStringSelectionValue,
} from "@upcode/shared/model";

export function getCodexServiceTierOptionValue(
  modelSelection: ModelSelection | null | undefined,
): string | undefined {
  return (
    getModelSelectionStringOptionValue(modelSelection, "serviceTier") ??
    (getModelSelectionBooleanOptionValue(modelSelection, "fastMode") === true ? "fast" : undefined)
  );
}

const CONTEXT_WINDOW_MULTIPLIERS: Readonly<Record<string, number>> = {
  k: 1_000,
  m: 1_000_000,
};

/**
 * Token count for a context-window option id such as `272k` or `1m`.
 *
 * Codex discovers no window sizes, so UPCode offers its own ladder and the option id
 * is the size itself. Anything unparsable (including the `default` choice) is
 * `undefined`, which leaves Codex's own `model_context_window` in place.
 */
function parseCodexContextWindowTokens(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+(?:\.\d+)?)([km])$/i.exec(value.trim());
  if (match === null) return undefined;
  const amount = Number(match[1]);
  const multiplier = CONTEXT_WINDOW_MULTIPLIERS[match[2]!.toLowerCase()];
  if (multiplier === undefined || !Number.isFinite(amount)) return undefined;
  const tokens = Math.round(amount * multiplier);
  return tokens > 0 ? tokens : undefined;
}

/** The `model_context_window` a model selection asks for, if it asks for one. */
export function getCodexContextWindowTokens(
  modelSelection: { readonly options?: ProviderOptionSelections } | null | undefined,
): number | undefined {
  return parseCodexContextWindowTokens(
    getProviderOptionStringSelectionValue(modelSelection?.options, "contextWindow"),
  );
}
