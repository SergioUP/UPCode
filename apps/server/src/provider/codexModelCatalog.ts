/**
 * Codex's view of its manifest catalog. Codex discovers models from its app
 * server, so the catalog only reclassifies them, moves the default, and names
 * models a newer Codex build would unlock.
 *
 * @module provider/codexModelCatalog
 */
import type {
  ProviderOptionDescriptor,
  ServerProviderModel,
  ServerProviderUpdateRequiredModel,
} from "@t3tools/contracts";
import * as ModelCatalog from "@t3tools/provider-core/server/ModelCatalog";
import type { ServerProviderDraft } from "@t3tools/provider-core/server/snapshotProbe";
import { codexModelFamily, createModelCapabilities } from "@t3tools/shared/model";
import { compareSemverVersions, parseSemver } from "@t3tools/shared/semver";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "@t3tools/contracts";

/** Dated Codex builds match their base model's catalog entry. */
const CODEX_MATCHING: ModelCatalog.CatalogMatching = { family: codexModelFamily };

/**
 * Context-window sizes T3 offers for Codex models. Codex's `model/list` reports
 * no window size, so the choice is ours: the value travels to the thread as
 * `model_context_window` and Codex uses it for token accounting and automatic
 * compaction. `default` omits the override and leaves Codex's own value alone,
 * which is always the safe pick for a model we do not know.
 *
 * Order is narrowest to widest. A value wider than the model's real cap only
 * makes Codex compact too late, so keep the ladder conservative.
 */
const CODEX_CONTEXT_WINDOW_CHOICES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "272k", label: "272k" },
  { id: "400k", label: "400k" },
  { id: "1m", label: "1M" },
];

const CODEX_CONTEXT_WINDOW_DEFAULT_ID = "default";

function codexContextWindowDescriptor(): ProviderOptionDescriptor {
  return {
    id: "contextWindow",
    label: "Context Window",
    type: "select",
    options: [
      { id: CODEX_CONTEXT_WINDOW_DEFAULT_ID, label: "Auto", isDefault: true },
      ...CODEX_CONTEXT_WINDOW_CHOICES.map((choice) => ({ ...choice })),
    ],
  };
}

/**
 * Adds the context-window choice to every model Codex discovers. Custom models
 * are user-authored slugs with unknown windows, so they keep whatever the user
 * configured and never inherit Codex's ladder.
 */
function applyCodexContextWindowChoices(
  models: ReadonlyArray<ServerProviderModel>,
): ReadonlyArray<ServerProviderModel> {
  return models.map((model) => {
    if (model.isCustom) return model;
    const optionDescriptors = model.capabilities?.optionDescriptors ?? [];
    if (optionDescriptors.some((descriptor) => descriptor.id === "contextWindow")) return model;
    return {
      ...model,
      capabilities: createModelCapabilities({
        optionDescriptors: [...optionDescriptors, codexContextWindowDescriptor()],
      }),
    };
  });
}

const CodexModelAdapter = Schema.Struct({
  codex: Schema.optional(Schema.Struct({ minVersion: Schema.optional(TrimmedNonEmptyString) })),
});
const decodeCodexModelAdapter = Schema.decodeUnknownOption(CodexModelAdapter);

/**
 * Codex lists only the models its own build knows, so a model released after
 * the installed CLI never shows up. A current catalog entry with
 * `adapter.codex.minVersion` names that model, letting the picker say an update
 * unlocks it instead of leaving users to wonder where it is.
 */
function codexUpdateRequiredModels(
  catalog: ModelCatalog.ProviderCatalog | undefined,
  draft: ServerProviderDraft,
): ReadonlyArray<ServerProviderUpdateRequiredModel> {
  const version = draft.version?.replace(/^v/, "");
  if (!catalog || !version || parseSemver(version) === null) return [];
  const discovered = new Set(draft.models.map((model) => codexModelFamily(model.slug)));
  return catalog.models.flatMap((entry) => {
    if (entry.status !== "current" || discovered.has(codexModelFamily(entry.slug))) return [];
    const minVersion = Option.getOrUndefined(decodeCodexModelAdapter(entry.adapter ?? {}))?.codex
      ?.minVersion;
    if (!minVersion || parseSemver(minVersion) === null) return [];
    if (compareSemverVersions(version, minVersion) >= 0) return [];
    return [
      {
        slug: entry.slug,
        name: entry.name,
        ...(entry.badge ? { badge: entry.badge } : {}),
        minVersion,
      },
    ];
  });
}

/** Reclassifies a Codex snapshot draft's models against its catalog. */
export function applyCodexModelCatalog(
  draft: ServerProviderDraft,
  catalog: ModelCatalog.ProviderCatalog | undefined,
): ServerProviderDraft {
  const updateRequiredModels = codexUpdateRequiredModels(catalog, draft);
  const classified = ModelCatalog.applyModelCatalog(draft, catalog, CODEX_MATCHING);
  return {
    ...classified,
    models: applyCodexContextWindowChoices(classified.models),
    ...(updateRequiredModels.length > 0 ? { updateRequiredModels } : {}),
  };
}
