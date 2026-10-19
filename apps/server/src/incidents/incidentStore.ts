// @effect-diagnostics nodeBuiltinImport:off globalDate:off cryptoRandomUUID:off preferSchemaOverJson:off -- Incident Center keeps one small JSON snapshot on the server's state dir.
import { IncidentStoreError, type Incident, type IncidentEvidence } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as ServerConfig from "../config.ts";
import { setIncidentThreadIds } from "./incidentContext.ts";

type Snapshot = { readonly incidents: ReadonlyArray<Incident> };
type EvidenceDraft = Omit<IncidentEvidence, "id" | "incidentId" | "capturedAt">;

const MAX_CONTENT = 200_000;
const now = () => new Date().toISOString();
const newId = () => globalThis.crypto.randomUUID();

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const path = `${config.stateDir}/incidents.json`;

  const read = (): Effect.Effect<Snapshot, IncidentStoreError> =>
    Effect.tryPromise({
      try: async (): Promise<Snapshot> => {
        try {
          const parsed = JSON.parse(await NodeFSP.readFile(path, "utf8")) as Partial<Snapshot>;
          const incidents = Array.isArray(parsed.incidents) ? parsed.incidents : [];
          setIncidentThreadIds(incidents.map((incident) => incident.threadId));
          return { incidents };
        } catch (cause) {
          if ((cause as { code?: string }).code === "ENOENT") {
            setIncidentThreadIds([]);
            return { incidents: [] };
          }
          throw cause;
        }
      },
      catch: () =>
        new IncidentStoreError({
          reason: "failed",
          message: "No se pudieron leer las incidencias.",
        }),
    });

  const write = (snapshot: Snapshot): Effect.Effect<void, IncidentStoreError> =>
    Effect.tryPromise({
      try: async () => {
        await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true });
        await NodeFSP.writeFile(path, JSON.stringify(snapshot, null, 2), "utf8");
      },
      catch: () =>
        new IncidentStoreError({
          reason: "failed",
          message: "No se pudieron guardar las incidencias.",
        }),
    });

  /** Read-modify-write one incident; every mutation funnels through here. */
  const mutate = (
    id: string,
    change: (incident: Incident) => Incident,
  ): Effect.Effect<Incident, IncidentStoreError> =>
    Effect.gen(function* () {
      const snapshot = yield* read();
      const current = snapshot.incidents.find((incident) => incident.id === id);
      if (!current)
        return yield* new IncidentStoreError({
          reason: "not-found",
          message: "La incidencia no existe.",
        });
      const updated: Incident = { ...change(current), updatedAt: now() };
      yield* write({
        incidents: snapshot.incidents.map((incident) => (incident.id === id ? updated : incident)),
      });
      return updated;
    });

  const list = () =>
    read().pipe(
      Effect.map((snapshot) =>
        [...snapshot.incidents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),
    );

  /** The incident a conversation belongs to, so the agent tool can resolve it from its thread. */
  const findByThread = (threadId: string) =>
    read().pipe(
      Effect.map(
        (snapshot) => snapshot.incidents.find((incident) => incident.threadId === threadId) ?? null,
      ),
    );

  const create = (input: {
    title: string;
    description: string;
    projectId?: string;
    environmentId?: string;
    workspaceRoot?: string;
    branch?: string;
    threadId?: string;
  }) =>
    Effect.gen(function* () {
      const snapshot = yield* read();
      const timestamp = now();
      const incident: Incident = {
        id: newId(),
        title: input.title.trim() || "Incidencia sin título",
        description: input.description,
        status: "open",
        projectId: input.projectId ?? null,
        environmentId: input.environmentId ?? null,
        workspaceRoot: input.workspaceRoot ?? null,
        branch: input.branch ?? null,
        threadId: input.threadId ?? null,
        summary: null,
        evidence: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: null,
      };
      yield* write({ incidents: [incident, ...snapshot.incidents] });
      return incident;
    });

  const update = (input: {
    id: string;
    title?: string;
    status?: Incident["status"];
    summary?: string;
    threadId?: string | null;
  }) =>
    mutate(input.id, (incident) => ({
      ...incident,
      ...(input.title !== undefined ? { title: input.title.trim() || incident.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      ...(input.status !== undefined
        ? { resolvedAt: input.status === "resolved" ? now() : null }
        : {}),
    }));

  const remove = (id: string) =>
    Effect.gen(function* () {
      const snapshot = yield* read();
      if (!snapshot.incidents.some((incident) => incident.id === id))
        return yield* new IncidentStoreError({
          reason: "not-found",
          message: "La incidencia no existe.",
        });
      yield* write({ incidents: snapshot.incidents.filter((incident) => incident.id !== id) });
    });

  const addEvidence = (input: {
    incidentId: string;
    title: string;
    source: string;
    contentType: IncidentEvidence["contentType"];
    content: string;
    summary?: string;
    metadata?: Record<string, string>;
  }) =>
    mutate(input.incidentId, (incident) => {
      const draft: EvidenceDraft = {
        title: input.title.trim() || input.source,
        source: input.source.trim() || "General",
        contentType: input.contentType,
        content: input.content.slice(0, MAX_CONTENT),
        summary: input.summary ?? null,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };
      return {
        ...incident,
        evidence: [
          ...incident.evidence,
          { ...draft, id: newId(), incidentId: incident.id, capturedAt: now() },
        ],
      };
    });

  const removeEvidence = (input: { incidentId: string; evidenceId: string }) =>
    mutate(input.incidentId, (incident) => ({
      ...incident,
      evidence: incident.evidence.filter((entry) => entry.id !== input.evidenceId),
    }));

  /** Single write surface: dispatch the action and always return the fresh list. */
  const mutateAll = (input: {
    action: "create" | "update" | "delete" | "evidenceAdd" | "evidenceRemove";
    id?: string;
    title?: string;
    description?: string;
    status?: Incident["status"];
    summary?: string;
    threadId?: string | null;
    projectId?: string;
    environmentId?: string;
    workspaceRoot?: string;
    branch?: string;
    evidence?: EvidenceDraft;
    evidenceId?: string;
  }): Effect.Effect<Incident[], IncidentStoreError> =>
    Effect.gen(function* () {
      switch (input.action) {
        case "create":
          yield* create({
            title: input.title ?? "",
            description: input.description ?? "",
            ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
            ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
            ...(input.workspaceRoot !== undefined ? { workspaceRoot: input.workspaceRoot } : {}),
            ...(input.branch !== undefined ? { branch: input.branch } : {}),
            ...(input.threadId ? { threadId: input.threadId } : {}),
          });
          break;
        case "update":
          if (input.id)
            yield* update({
              id: input.id,
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.status !== undefined ? { status: input.status } : {}),
              ...(input.summary !== undefined ? { summary: input.summary } : {}),
              ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
            });
          break;
        case "delete":
          if (input.id) yield* remove(input.id);
          break;
        case "evidenceAdd":
          if (input.id && input.evidence)
            yield* addEvidence({
              incidentId: input.id,
              title: input.evidence.title,
              source: input.evidence.source,
              contentType: input.evidence.contentType,
              content: input.evidence.content,
              ...(input.evidence.summary != null ? { summary: input.evidence.summary } : {}),
              ...(input.evidence.metadata ? { metadata: { ...input.evidence.metadata } } : {}),
            });
          break;
        case "evidenceRemove":
          if (input.id && input.evidenceId)
            yield* removeEvidence({ incidentId: input.id, evidenceId: input.evidenceId });
          break;
      }
      return yield* list();
    });

  return { list, create, update, remove, addEvidence, removeEvidence, mutateAll, findByThread };
});
