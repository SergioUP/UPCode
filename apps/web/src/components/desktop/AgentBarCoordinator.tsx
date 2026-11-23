import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { scopeThreadRef, scopedThreadKey } from "@upcode/client-runtime/environment";
import {
  presentThreadShell,
  scopeProject,
  type EnvironmentThreadShell,
} from "@upcode/client-runtime/state/models";
import type { DesktopAgentBarEntry } from "@upcode/contracts";
import { backgroundWorkHoldsCompletion } from "@upcode/shared/orchestrationV2PendingBackgroundWork";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { useEffect, useMemo, useRef } from "react";

import { useClientSettings } from "../../hooks/useSettings";
import { useEnvironmentIds } from "../../state/environments";
import { environmentShell } from "../../state/shell";
import { useUiStateStore } from "../../uiStateStore";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";
import { toastManager } from "../ui/toast";
import { agentBarProjectIcon } from "./agentBarProjectIcon";

export function agentBarStatus(
  thread: Pick<
    EnvironmentThreadShell,
    | "archivedAt"
    | "lineage"
    | "runtime"
    | "latestRun"
    | "lastVisitedAt"
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "hasActionableProposedPlan"
    | "interactionMode"
  > &
    Partial<Pick<EnvironmentThreadShell, "pendingBackgroundTasks">>,
  localLastVisitedAt: string | undefined,
): DesktopAgentBarEntry["status"] | null {
  if (thread.archivedAt !== null || thread.lineage.relationshipToParent === "subagent") return null;
  const status = resolveSidebarThreadStatus(thread);
  if (status !== "ready" && status !== "waiting") return status;
  if (backgroundWorkHoldsCompletion(thread.pendingBackgroundTasks ?? [])) return "waiting";
  if (thread.latestRun?.status === "failed") return "failed";
  if (thread.latestRun?.status !== "completed") return null;
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt);
  return hasUnseenCompletion({ ...thread, lastVisitedAt }) ? "done" : null;
}

export function AgentBarCoordinator() {
  const enabled = useClientSettings((settings) => settings.agentBarEnabled);
  const bridge = window.desktopBridge;
  if (bridge?.getClientPlatform?.() !== "win32" || !bridge.setAgentBarState) return null;
  return enabled ? <AgentBarUpdates publish={bridge.setAgentBarState} /> : null;
}

function AgentBarUpdates({
  publish,
}: {
  readonly publish: (entries: ReadonlyArray<DesktopAgentBarEntry> | null) => Promise<void>;
}) {
  const navigate = useNavigate();
  const environmentIds = useEnvironmentIds();
  const visits = useUiStateStore((state) => state.threadLastVisitedAtById);
  const rowsAtom = useMemo(
    () =>
      Atom.make((get): ReadonlyArray<DesktopAgentBarEntry> => {
        const rows: DesktopAgentBarEntry[] = [];
        for (const id of environmentIds) {
          const shell = get(environmentShell.stateValueAtom(id));
          if (Option.isNone(shell.snapshot)) continue;
          const projects = new Map(
            shell.snapshot.value.projects.map((project) => [project.id, project]),
          );
          const icons = new Map<string, NonNullable<DesktopAgentBarEntry["project"]>>();
          for (const source of shell.snapshot.value.threads) {
            const thread = presentThreadShell(id, source);
            const status = agentBarStatus(
              thread,
              visits[scopedThreadKey(scopeThreadRef(id, thread.id))],
            );
            if (!status) continue;
            const project = projects.get(thread.projectId);
            let icon = icons.get(thread.projectId);
            if (project && !icon) {
              icon = agentBarProjectIcon(get, scopeProject(id, project));
              icons.set(thread.projectId, icon);
            }
            rows.push({
              environmentId: id,
              threadId: thread.id,
              title: thread.title.slice(0, 300),
              provider: (thread.runtime?.providerName ?? thread.modelSelection.instanceId).slice(
                0,
                80,
              ),
              status: shell.status === "live" ? status : "offline",
              ...(icon ? { project: icon } : {}),
            });
            if (rows.length === 500) return rows;
          }
        }
        return rows;
      }),
    [environmentIds, visits],
  );
  const rows = useAtomValue(rowsAtom);
  const lastPayload = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.desktopBridge?.onAgentBarOpenThread?.(
      ({ environmentId, threadId }) => {
        void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
      },
    );
    return () => {
      unsubscribe?.();
      lastPayload.current = null;
      void publish(null).catch((error: unknown) =>
        console.error("Could not close the agent bar", error),
      );
    };
  }, [navigate, publish]);

  useEffect(() => {
    const encoded = JSON.stringify(rows);
    if (lastPayload.current === encoded) return;
    lastPayload.current = encoded;
    void publish(rows).catch((error: unknown) => {
      lastPayload.current = null;
      console.error("Could not update the agent bar", error);
      toastManager.add({ type: "error", title: "Could not update the Agent Bar" });
    });
  }, [publish, rows]);

  return null;
}
