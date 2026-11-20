import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { scopeThreadRef, scopedThreadKey } from "@upcode/client-runtime/environment";
import {
  presentThreadShell,
  type EnvironmentThreadShell,
} from "@upcode/client-runtime/state/models";
import type { DesktopAgentBarEntry } from "@upcode/contracts";
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
  >,
  localLastVisitedAt: string | undefined,
): DesktopAgentBarEntry["status"] | null {
  if (thread.archivedAt !== null || thread.lineage.relationshipToParent === "subagent") return null;
  const status = resolveSidebarThreadStatus(thread);
  if (status !== "ready") return status;
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
  const shellsAtom = useMemo(
    () =>
      Atom.make((get) =>
        environmentIds.map((id) => ({ id, shell: get(environmentShell.stateValueAtom(id)) })),
      ),
    [environmentIds],
  );
  const shells = useAtomValue(shellsAtom);
  const visits = useUiStateStore((state) => state.threadLastVisitedAtById);
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
    const rows: DesktopAgentBarEntry[] = [];
    for (const { id, shell } of shells) {
      if (Option.isNone(shell.snapshot)) continue;
      for (const source of shell.snapshot.value.threads) {
        const thread = presentThreadShell(id, source);
        const status = agentBarStatus(
          thread,
          visits[scopedThreadKey(scopeThreadRef(id, thread.id))],
        );
        if (!status) continue;
        rows.push({
          environmentId: id,
          threadId: thread.id,
          title: thread.title.slice(0, 300),
          provider: (thread.runtime?.providerName ?? thread.modelSelection.instanceId).slice(0, 80),
          status: shell.status === "live" ? status : "offline",
        });
        if (rows.length === 500) break;
      }
      if (rows.length === 500) break;
    }
    const encoded = JSON.stringify(rows);
    if (lastPayload.current === encoded) return;
    lastPayload.current = encoded;
    void publish(rows).catch((error: unknown) => {
      lastPayload.current = null;
      console.error("Could not update the agent bar", error);
      toastManager.add({ type: "error", title: "Could not update the Agent Bar" });
    });
  }, [publish, shells, visits]);

  return null;
}
