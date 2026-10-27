import {
  AuthSettingsWriteScope,
  type EnvironmentId,
  type ProjectId,
  type ProjectPrompt,
} from "@t3tools/contracts";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useEnvironmentScope } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useComposerHandleContext } from "../../composerHandleContext";
import {
  mapAtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { MessageSquareTextIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { randomUUID } from "~/lib/utils";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuItemLabel, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { THREAD_DETAILS_PANEL_LABEL_CLASS } from "./threadDetailsPanelStyles";

interface EditorRequest {
  readonly promptId: string | null;
  readonly title: string;
  readonly prompt: string;
}

/**
 * Saved prompts for one project. Picking one only fills the composer: nothing
 * is sent until the user reviews and submits it.
 */
export function ProjectPromptsControl({
  environmentId,
  projectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}) {
  const promptsByProject = useEnvironmentSettings(
    environmentId,
    (settings) => settings.projectPrompts,
  );
  const prompts = promptsByProject[projectId] ?? [];
  const canWrite = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const composer = useComposerHandleContext();
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (nextPrompts: ReadonlyArray<ProjectPrompt>) => {
      const result = mapAtomCommandResult(
        await updateSettings({
          environmentId,
          input: {
            patch: { projectPrompts: { ...promptsByProject, [projectId]: [...nextPrompts] } },
          },
        }),
        () => undefined,
      );
      if (result._tag === "Failure") {
        const cause = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to save prompt",
            description: cause instanceof Error ? cause.message : "The server rejected the change.",
          }),
        );
        return false;
      }
      return true;
    },
    [environmentId, projectId, promptsByProject, updateSettings],
  );

  const submit = async () => {
    if (!editor || !canWrite) return;
    const title = editor.title.trim();
    const text = editor.prompt.trim();
    if (!title || !text) return;
    setSaving(true);
    const next = editor.promptId
      ? prompts.map((prompt) =>
          prompt.id === editor.promptId ? { ...prompt, title, prompt: text } : prompt,
        )
      : [...prompts, { id: randomUUID(), title, prompt: text }];
    const ok = await save(next);
    setSaving(false);
    if (ok) setEditor(null);
  };

  const remove = async () => {
    if (!editor?.promptId || !canWrite) return;
    setSaving(true);
    const ok = await save(prompts.filter((prompt) => prompt.id !== editor.promptId));
    setSaving(false);
    if (ok) setEditor(null);
  };

  const insert = (prompt: ProjectPrompt) => {
    if (!composer?.current) {
      toastManager.add({ type: "warning", title: "Open a thread to use this prompt" });
      return;
    }
    composer.current.insertTextAtEnd(prompt.prompt, { ensureLeadingBoundary: true });
    composer.current.focusAtEnd();
  };

  return (
    <>
      <Menu highlightItemOnHover={false}>
        <MenuTrigger
          render={
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part="select"
              aria-label="Project prompts"
            />
          }
        >
          <MessageSquareTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className={THREAD_DETAILS_PANEL_LABEL_CLASS}>Prompts</span>
        </MenuTrigger>
        <MenuPopup align="start" className="w-64">
          {prompts.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved prompts yet.</p>
          ) : (
            prompts.map((prompt) => (
              <MenuItem key={prompt.id} onClick={() => insert(prompt)}>
                <MenuItemLabel>{prompt.title}</MenuItemLabel>
                <span className="ms-auto flex items-center gap-1">
                  <span className="max-w-24 truncate text-3xs text-muted-foreground">
                    {prompt.prompt}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-6"
                    aria-label={`Edit ${prompt.title}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setEditor({
                        promptId: prompt.id,
                        title: prompt.title,
                        prompt: prompt.prompt,
                      });
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                </span>
              </MenuItem>
            ))
          )}
          <MenuSeparator />
          <MenuItem
            disabled={!canWrite}
            onClick={() => setEditor({ promptId: null, title: "", prompt: "" })}
          >
            <PlusIcon className="size-4" />
            <MenuItemLabel>Add prompt</MenuItemLabel>
          </MenuItem>
        </MenuPopup>
      </Menu>

      <Dialog open={editor !== null} onOpenChange={(open) => (open ? undefined : setEditor(null))}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{editor?.promptId ? "Edit prompt" : "Add prompt"}</DialogTitle>
            <DialogDescription>
              Saved for this project. Picking it fills the composer without sending anything.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-3">
              <Input
                aria-label="Prompt name"
                placeholder="Name, for example: Revisar mapeo"
                value={editor?.title ?? ""}
                disabled={saving || !canWrite}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
              />
              <Textarea
                aria-label="Prompt text"
                rows={8}
                placeholder="Prompt to place in the composer…"
                value={editor?.prompt ?? ""}
                disabled={saving || !canWrite}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, prompt: event.target.value } : current,
                  )
                }
              />
            </div>
          </DialogPanel>
          <DialogFooter variant="bare">
            {editor?.promptId ? (
              <Button
                type="button"
                variant="destructive-outline"
                className="mr-auto"
                disabled={saving || !canWrite}
                onClick={() => void remove()}
              >
                Delete
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !canWrite || !editor?.title.trim() || !editor.prompt.trim()}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : "Save prompt"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
