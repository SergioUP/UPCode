import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, type ServerProviderModel } from "@upcode/contracts";

import { resolveContextWindowDescriptor } from "./ContextWindowSelector";

const CODEX = ProviderDriverKind.make("codex");

const model = (overrides: Partial<ServerProviderModel>): ServerProviderModel => ({
  slug: "gpt-6-astra",
  name: "GPT-6 Astra",
  isCustom: false,
  capabilities: null,
  ...overrides,
});

const withContextWindow = model({
  capabilities: {
    optionDescriptors: [
      {
        id: "reasoningEffort",
        label: "Reasoning",
        type: "select",
        options: [{ id: "high", label: "High" }],
      },
      {
        id: "contextWindow",
        label: "Context Window",
        type: "select",
        options: [
          { id: "default", label: "Default", isDefault: true },
          { id: "272k", label: "272k" },
          { id: "1m", label: "1M" },
        ],
      },
    ],
  },
});

describe("resolveContextWindowDescriptor", () => {
  it("returns the model's window choices with the saved selection applied", () => {
    const descriptor = resolveContextWindowDescriptor({
      provider: CODEX,
      models: [withContextWindow],
      model: "gpt-6-astra",
      modelOptions: [{ id: "contextWindow", value: "1m" }],
    });

    expect(descriptor?.id).toBe("contextWindow");
    expect(descriptor?.currentValue).toBe("1m");
  });

  it("falls back to the descriptor default when nothing is saved", () => {
    const descriptor = resolveContextWindowDescriptor({
      provider: CODEX,
      models: [withContextWindow],
      model: "gpt-6-astra",
      modelOptions: undefined,
    });

    expect(descriptor?.currentValue).toBe("default");
  });

  it("returns null for models that bring no window choice", () => {
    expect(
      resolveContextWindowDescriptor({
        provider: CODEX,
        models: [model({})],
        model: "gpt-6-astra",
        modelOptions: undefined,
      }),
    ).toBeNull();
    expect(
      resolveContextWindowDescriptor({
        provider: CODEX,
        models: [withContextWindow],
        model: null,
        modelOptions: undefined,
      }),
    ).toBeNull();
  });
});
