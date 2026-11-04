import { assert, describe, it } from "@effect/vitest";
import type { ServerProviderModel } from "@t3tools/contracts";
import type * as ModelCatalog from "@t3tools/provider-core/server/ModelCatalog";

import { applyCodexModelCatalog } from "./codexModelCatalog.ts";

/** Synthetic models only; real Codex model data lives in model-manifest.json. */
const model = (overrides: Partial<ServerProviderModel>): ServerProviderModel => ({
  slug: "gpt-test",
  name: "GPT Test",
  isCustom: false,
  capabilities: null,
  ...overrides,
});

const entry = (
  overrides: Partial<ModelCatalog.ProviderCatalogModel> & { readonly slug: string },
): ModelCatalog.ProviderCatalogModel => ({
  name: overrides.slug,
  status: "current",
  capabilities: null,
  adapter: undefined,
  profileAdapter: undefined,
  ...overrides,
});

const catalog: ModelCatalog.ProviderCatalog = {
  defaultChatModel: undefined,
  models: [
    entry({
      slug: "gpt-next",
      name: "GPT Next",
      badge: "new",
      adapter: { codex: { minVersion: "1.2.0" } },
    }),
    entry({ slug: "gpt-unversioned" }),
    entry({ slug: "gpt-retired", status: "legacy", adapter: { codex: { minVersion: "1.2.0" } } }),
  ],
};

const draft = (version: string | null, models: ReadonlyArray<ServerProviderModel> = []) => ({
  enabled: true,
  installed: true,
  version,
  status: "ready" as const,
  auth: { status: "authenticated" as const },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models,
  slashCommands: [],
  skills: [],
});

describe("applyCodexModelCatalog", () => {
  it("names current models that need a newer Codex and are missing from discovery", () => {
    assert.deepStrictEqual(applyCodexModelCatalog(draft("1.1.9"), catalog).updateRequiredModels, [
      { slug: "gpt-next", name: "GPT Next", badge: "new", minVersion: "1.2.0" },
    ]);
    for (const result of [
      // The CLI is new enough.
      applyCodexModelCatalog(draft("1.2.0"), catalog),
      // The CLI already lists the model, even under a qualified slug.
      applyCodexModelCatalog(draft("1.1.9", [model({ slug: "openai.gpt-next" })]), catalog),
      // An unknown version cannot be compared.
      applyCodexModelCatalog(draft(null), catalog),
      // A qualified catalog slug still matches the discovered family.
      applyCodexModelCatalog(draft("1.1.9", [model({ slug: "gpt-next" })]), {
        ...catalog,
        models: [{ ...catalog.models[0]!, slug: "openai.gpt-next" }],
      }),
    ]) {
      assert.isUndefined(result.updateRequiredModels);
    }
  });

  it("classifies qualified Codex families without changing their wire ids", () => {
    const classified = applyCodexModelCatalog(
      draft("1.2.0", [
        model({ slug: "openai.gpt-test", isLegacy: true }),
        model({ slug: "openai.gpt-retired" }),
      ]),
      catalog,
    );
    assert.deepStrictEqual(
      classified.models.map((entry) => [entry.slug, entry.isLegacy ?? false]),
      [
        ["openai.gpt-test", false],
        ["openai.gpt-retired", true],
      ],
    );
  });

  it("offers the T3 context-window ladder on discovered models", () => {
    const withWindow = applyCodexModelCatalog(
      draft("1.2.0", [
        model({
          slug: "gpt-test",
          capabilities: {
            optionDescriptors: [
              {
                id: "reasoningEffort",
                label: "Reasoning",
                type: "select",
                options: [{ id: "high", label: "High" }],
              },
            ],
          },
        }),
      ]),
      catalog,
    );

    assert.deepStrictEqual(
      withWindow.models[0]?.capabilities?.optionDescriptors?.map((descriptor) => descriptor.id),
      ["reasoningEffort", "contextWindow"],
    );
    assert.deepStrictEqual(withWindow.models[0]?.capabilities?.optionDescriptors?.[1], {
      id: "contextWindow",
      label: "Context Window",
      type: "select",
      options: [
        { id: "default", label: "Auto", isDefault: true },
        { id: "272k", label: "272k" },
        { id: "400k", label: "400k" },
        { id: "1m", label: "1M" },
      ],
    });
  });

  it("skips custom models and models that already choose a window", () => {
    const described = {
      id: "contextWindow",
      label: "Context Window",
      type: "select" as const,
      options: [{ id: "wide", label: "Wide" }],
    };
    const result = applyCodexModelCatalog(
      draft("1.2.0", [
        model({ slug: "gpt-custom", isCustom: true }),
        model({ slug: "gpt-described", capabilities: { optionDescriptors: [described] } }),
      ]),
      catalog,
    );

    assert.isNull(result.models[0]?.capabilities ?? null);
    assert.deepStrictEqual(result.models[1]?.capabilities?.optionDescriptors, [described]);
  });
});
