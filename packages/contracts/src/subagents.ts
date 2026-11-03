import * as Schema from "effect/Schema";
import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Subagents are named, reusable roles the user writes once and every thread can
 * use: a name, an internal prompt (role, tone, workflow, rules), and how they
 * look in the app.
 *
 * They are **global on purpose**: they belong to the person, not to a project,
 * so the same reviewer is available in every repository.
 *
 * @module Subagents
 */

export const SUBAGENT_NAME_MAX_LENGTH = 20;
export const SUBAGENT_PROMPT_MAX_LENGTH = 8000;
export const SUBAGENT_MAX_COUNT = 200;
/** How many tool names a role may pin; empty means "the harness decides". */
export const SUBAGENT_TOOLS_MAX = 40;
/**
 * A 128×128 avatar as a data URL lands around 20-40 KB; the cap only exists so
 * a mistake cannot bloat the settings file.
 */
export const SUBAGENT_AVATAR_MAX_LENGTH = 200_000;

export const SubagentId = TrimmedNonEmptyString.check(Schema.isMaxLength(64));

export const Subagent = Schema.Struct({
  id: SubagentId,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(SUBAGENT_NAME_MAX_LENGTH)),
  /**
   * A Lucide icon name in kebab-case (`scan-search`, `database`, `shield-check`).
   * Stored as a string so the web can resolve it without the server knowing the
   * icon library, and so an unknown name degrades to a default instead of
   * failing to decode.
   */
  icon: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(64))),
  /** Hue 0-359. The card and the icon are drawn in it. */
  hue: Schema.optionalKey(NonNegativeInt.check(Schema.isLessThanOrEqualTo(359))),
  /**
   * A picture instead of the glyph, as a small data URL the client already
   * downscaled to 128×128. It rides in the settings JSON, so it is capped: a
   * role is a name and a few rules, not an asset library.
   */
  avatar: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(SUBAGENT_AVATAR_MAX_LENGTH))),
  /** The role: tone, workflow, rules. This is what the agent receives. */
  prompt: Schema.String.check(Schema.isMaxLength(SUBAGENT_PROMPT_MAX_LENGTH)),
  /**
   * Tool names this role is meant to use. Advisory: it is written into the
   * delegated prompt, not enforced, because the child agent's tools are decided
   * by its provider.
   */
  tools: Schema.optionalKey(
    Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(SUBAGENT_TOOLS_MAX)),
  ),
  createdAt: NonNegativeInt,
  updatedAt: NonNegativeInt,
});
export type Subagent = typeof Subagent.Type;

export const SubagentList = Schema.Array(Subagent).check(Schema.isMaxLength(SUBAGENT_MAX_COUNT));
export type SubagentList = typeof SubagentList.Type;

/** The palette the UI offers; the server only stores the number. */
export const SUBAGENT_HUES = [8, 24, 48, 96, 152, 190, 214, 258, 292, 322] as const;
