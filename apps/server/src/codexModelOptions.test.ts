import { assert, it } from "@effect/vitest";

import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

import {
  getCodexContextWindowTokens,
  getCodexServiceTierOptionValue,
} from "./codexModelOptions.ts";

it("returns the selected Codex service tier id", () => {
  const selection = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.5", [
    { id: "serviceTier", value: "flex" },
  ]);

  assert.equal(getCodexServiceTierOptionValue(selection), "flex");
});

it("keeps legacy persisted fast mode selections working", () => {
  const selection = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4", [
    { id: "fastMode", value: true },
  ]);

  assert.equal(getCodexServiceTierOptionValue(selection), "fast");
});

it("parses a selected Codex context window into tokens", () => {
  const contextWindow = (value: string) =>
    getCodexContextWindowTokens(
      createModelSelection(ProviderInstanceId.make("codex"), "gpt-6-astra", [
        { id: "contextWindow", value },
      ]),
    );

  assert.equal(contextWindow("272k"), 272_000);
  assert.equal(contextWindow("1m"), 1_000_000);
  assert.equal(contextWindow("1.5m"), 1_500_000);
});

it("leaves Codex's own context window alone by default", () => {
  assert.isUndefined(
    getCodexContextWindowTokens(
      createModelSelection(ProviderInstanceId.make("codex"), "gpt-6-astra", [
        { id: "contextWindow", value: "default" },
      ]),
    ),
  );
  assert.isUndefined(getCodexContextWindowTokens(null));
  assert.isUndefined(
    getCodexContextWindowTokens(
      createModelSelection(ProviderInstanceId.make("codex"), "gpt-6-astra", [
        { id: "contextWindow", value: "wide" },
      ]),
    ),
  );
});
