import {
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type ScopedThreadRef,
  type ServerProviderModel,
} from "@upcode/contracts";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
} from "@upcode/shared/model";
import { useCallback } from "react";

import { type DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { getProviderModelCapabilities } from "../../providerModels";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { replaceDescriptorCurrentValue } from "./TraitsPicker";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

/** The context-window choice a model offers, or null when the provider brings none. */
export function resolveContextWindowDescriptor(input: {
  provider: ProviderDriverKind;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  modelOptions?: ReadonlyArray<ProviderOptionSelection> | null | undefined;
}): SelectDescriptor | null {
  if (!input.model) return null;
  const caps = getProviderModelCapabilities(input.models, input.model, input.provider);
  const descriptor = getProviderOptionDescriptors({
    caps,
    selections: input.modelOptions,
  }).find(
    (candidate): candidate is SelectDescriptor =>
      candidate.type === "select" && candidate.id === "contextWindow",
  );
  return descriptor && descriptor.options.length > 1 ? descriptor : null;
}

/**
 * Context-window size picker for the composer's context meter. Only models that
 * publish a window choice get one: Codex's own ladder (UPCode-side, because
 * `model/list` reports no sizes) and Claude's standard/expanded.
 */
export function ContextWindowSelector(props: {
  provider: ProviderDriverKind;
  instanceId?: ProviderInstanceId;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  modelOptions?: ReadonlyArray<ProviderOptionSelection> | null | undefined;
  threadRef?: ScopedThreadRef | undefined;
  draftId?: DraftId | undefined;
}) {
  const { provider, instanceId, models, model, modelOptions, threadRef, draftId } = props;
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);
  const descriptor = resolveContextWindowDescriptor({ provider, models, model, modelOptions });
  const currentValue = getProviderOptionCurrentValue(descriptor);

  const handleValueChange = useCallback(
    (value: string) => {
      if (!model || !descriptor) return;
      const threadTarget = threadRef ?? draftId;
      if (!threadTarget) return;
      const caps = getProviderModelCapabilities(models, model, provider);
      const nextDescriptors = replaceDescriptorCurrentValue(
        getProviderOptionDescriptors({ caps, selections: modelOptions }),
        descriptor.id,
        value,
      );
      setProviderModelOptions(
        threadTarget,
        provider,
        buildProviderOptionSelectionsFromDescriptors(nextDescriptors),
        { ...(instanceId ? { instanceId } : {}), model, persistSticky: true },
      );
    },
    [
      descriptor,
      draftId,
      instanceId,
      model,
      modelOptions,
      models,
      provider,
      setProviderModelOptions,
      threadRef,
    ],
  );

  if (!descriptor || typeof currentValue !== "string") {
    return null;
  }

  // Codex applies the window at thread/start and keeps it on resume, so an
  // existing thread cannot change size under itself.
  const reloadNote = provider === "codex" ? "Se aplica al empezar un hilo nuevo." : null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs leading-4 text-secondary-label">{descriptor.label}</span>
      <ToggleGroup
        aria-label={descriptor.label}
        className="w-full"
        variant="segmented"
        value={[currentValue]}
        onValueChange={(value) => {
          const next = value[0];
          if (next !== undefined && next !== currentValue) handleValueChange(next);
        }}
      >
        {descriptor.options.map((option) => (
          <Toggle
            key={option.id}
            aria-label={option.label}
            className="flex-1"
            value={option.id}
            title={option.description ?? undefined}
          >
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
      {reloadNote ? (
        <div className="text-pretty text-secondary-label text-2xs">{reloadNote}</div>
      ) : null}
    </div>
  );
}
