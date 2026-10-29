// @effect-diagnostics globalFetchInEffect:off globalTimersInEffect:off preferSchemaOverJson:off -- This Azure REST boundary owns the PAT, timeout and untrusted JSON envelope.
import * as Effect from "effect/Effect";
import { AzureDevOpsWorkspaceError } from "@t3tools/contracts";
import { readSourceControlHostSettings } from "@t3tools/source-control-core/client/definition";
import { settings as azureSettings } from "@t3tools/source-control-azure-devops/client/definition";
import * as ServerSettings from "./serverSettings.ts";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const API_VERSION = "7.1";

type AzureFields = Record<string, unknown>;
type AzureRelation = { rel?: string; url?: string; attributes?: { name?: string } };
type AzureItem = {
  id: number;
  fields?: AzureFields;
  _links?: { html?: { href?: string } };
  relations?: AzureRelation[];
};
type AzureIterationNode = {
  name?: string;
  path?: string;
  attributes?: { startDate?: string; finishDate?: string; timeFrame?: string };
  children?: AzureIterationNode[];
};
/** One sprint of the project's iteration tree, as the work items need it. */
type AzureIteration = {
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
};

const HIDDEN_FIELDS = new Set([
  "System.Id",
  "System.Title",
  "System.Description",
  "System.State",
  "System.WorkItemType",
  "System.TeamProject",
  "System.AssignedTo",
  "System.IterationPath",
  "System.AreaPath",
  "System.Reason",
  "System.ChangedDate",
  "System.CreatedDate",
  "System.CreatedBy",
  "System.ChangedBy",
  "System.Rev",
  "System.History",
  "System.AuthorizedAs",
  "System.PersonId",
  "System.Watermark",
  "System.CommentCount",
  "System.NodeName",
  "System.AreaId",
  "System.IterationId",
  "System.RevisedDate",
  "System.AuthorizedDate",
  "System.BoardColumn",
  "System.BoardColumnDone",
  "System.BoardLane",
  "System.Parent",
  "Microsoft.VSTS.Common.Priority",
]);
const workItemIdFromUrl = (url: string): number | null => {
  const match = /\/workItems\/(\d+)\/?$/i.exec(url);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const identity = (value: unknown): string | null =>
  typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? text((value as { displayName?: unknown }).displayName) || null
      : null;
/** ADO hands back a full identity object; the avatar and the unique name hang off it. */
const identityProperty = (value: unknown, key: string): string | null =>
  value && typeof value === "object" ? text((value as Record<string, unknown>)[key]) || null : null;
const fieldText = (value: unknown): string | null => {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 400 || trimmed.includes("<")) return null;
    return trimmed;
  }
  return identity(value);
};
const field = (item: AzureItem, name: string) => item.fields?.[name];
const error = (reason: AzureDevOpsWorkspaceError["reason"], message: string) =>
  new AzureDevOpsWorkspaceError({ reason, message });
const encode = encodeURIComponent;

const responseReason = (status: number): AzureDevOpsWorkspaceError["reason"] =>
  status === 401
    ? "authentication"
    : status === 403
      ? "forbidden"
      : status === 404
        ? "not-found"
        : status === 429
          ? "rate-limited"
          : "failed";

const MAX_WORK_ITEM_QUERY_LENGTH = 200;
/** WIQL escapes an embedded single quote by doubling it; never interpolate raw input. */
const wiqlLiteral = (value: string): string => value.replace(/'/g, "''");
/**
 * A digits-only query is a jump to that work item; anything else searches the title.
 * Returns a WIQL fragment including its leading `AND`, or "" so callers can concatenate it.
 */
const workItemSearchClause = (query: string | undefined): string => {
  const trimmed = (query ?? "").trim().slice(0, MAX_WORK_ITEM_QUERY_LENGTH);
  if (!trimmed) return "";
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    if (Number.isSafeInteger(id) && id > 0) return ` AND [System.Id] = ${id}`;
  }
  return ` AND [System.Title] CONTAINS '${wiqlLiteral(trimmed)}'`;
};

/** T3's `az devops`/`az repos` calls authenticate through this environment variable. */
const applyAzCliPat = (pat: string) => {
  if (pat) process.env.AZURE_DEVOPS_EXT_PAT = pat;
  else delete process.env.AZURE_DEVOPS_EXT_PAT;
};

export const make = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;

  const credentials = serverSettings.getSettings.pipe(
    Effect.map((settings) =>
      readSourceControlHostSettings(azureSettings, settings.sourceControlHosts["azure-devops"]),
    ),
    Effect.mapError(() =>
      error("configuration", "No se puede leer la configuración de Azure DevOps."),
    ),
    Effect.flatMap((value) => {
      if (value.organization && value.personalAccessToken)
        return Effect.sync(() => applyAzCliPat(value.personalAccessToken)).pipe(Effect.as(value));
      if (!value.organization && value.personalAccessToken)
        return Effect.fail(
          error(
            "configuration",
            "El token ya está guardado. Falta la organización: el nombre de dev.azure.com/{organización}, en Ajustes → Source control.",
          ),
        );
      if (value.organization && !value.personalAccessToken)
        return Effect.fail(
          error(
            "configuration",
            "Falta el Personal Access Token. Pégalo en Ajustes → Source control. Se guarda solo.",
          ),
        );
      return Effect.fail(
        error(
          "configuration",
          "Faltan la organización y el Personal Access Token. Están en Ajustes → Source control y se guardan al pegarlos.",
        ),
      );
    }),
  );

  // Keep T3's az CLI calls (az devops / az repos) authenticated with the saved PAT.
  yield* Effect.ignore(credentials);

  const request = (input: {
    path: string;
    method?: string;
    body?: unknown;
    contentType?: string;
  }) =>
    Effect.gen(function* () {
      const credential = yield* credentials;
      const url = `https://dev.azure.com/${encode(credential.organization)}${input.path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(url, {
              method: input.method ?? "GET",
              headers: {
                Authorization: `Basic ${Buffer.from(`:${credential.personalAccessToken}`, "utf8").toString("base64")}`,
                Accept: "application/json",
                ...(input.body === undefined
                  ? {}
                  : { "Content-Type": input.contentType ?? "application/json" }),
              },
              ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
              signal: controller.signal,
            }),
          catch: () => error("failed", "No se pudo contactar con Azure DevOps."),
        });
        if (!response.ok)
          return yield* Effect.fail(
            error(
              responseReason(response.status),
              `Azure DevOps devolvió HTTP ${response.status}.`,
            ),
          );
        const raw = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => error("failed", "No se pudo leer la respuesta de Azure DevOps."),
        });
        if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES)
          return yield* Effect.fail(
            error("failed", "La respuesta de Azure DevOps supera el límite permitido."),
          );
        return yield* Effect.try({
          try: () => (raw.length ? (JSON.parse(raw) as unknown) : null),
          catch: () => error("failed", "Azure DevOps devolvió una respuesta no válida."),
        });
      } finally {
        clearTimeout(timer);
      }
    });

  const path = (project: string, suffix: string) =>
    `/${encode(project)}/_apis/${suffix}${suffix.includes("?") ? "&" : "?"}api-version=${API_VERSION}`;
  const config = credentials.pipe(
    Effect.map(({ organization }) => ({ organization, connected: true })),
  );
  const listProjects = request({
    path: `/_apis/projects?api-version=${API_VERSION}&$top=100`,
  }).pipe(
    Effect.map((result) => {
      const value =
        (result as { value?: Array<{ id?: string; name?: string; url?: string }> }).value ?? [];
      return value.map((project) => ({
        id: project.id ?? "",
        name: project.name ?? "",
        url: project.url ?? "",
      }));
    }),
  );
  /** `Microsoft.VSTS.Scheduling.*` arrives as a number of hours, or as null/absent. */
  const hoursField = (item: AzureItem, name: string): number | null => {
    const value = field(item, name);
    const hours = typeof value === "number" ? value : Number(value);
    return Number.isFinite(hours) ? hours : null;
  };
  const toWorkItem = (organization: string, item: AzureItem) => {
    const project = text(field(item, "System.TeamProject"));
    const assignedTo = field(item, "System.AssignedTo");
    const parent = Number(field(item, "System.Parent"));
    return {
      id: item.id,
      project,
      title: text(field(item, "System.Title")),
      type: text(field(item, "System.WorkItemType")),
      state: text(field(item, "System.State")),
      assignedTo: identity(assignedTo),
      assignedToAvatar: identityProperty(assignedTo, "imageUrl"),
      assignedToEmail: identityProperty(assignedTo, "uniqueName"),
      iteration: text(field(item, "System.IterationPath")) || null,
      area: text(field(item, "System.AreaPath")) || null,
      parentId: Number.isSafeInteger(parent) && parent > 0 ? parent : null,
      description: text(field(item, "System.Description")) || null,
      url:
        item._links?.html?.href ??
        `https://dev.azure.com/${encode(organization)}/${encode(project)}/_workitems/edit/${item.id}`,
      changedAt: text(field(item, "System.ChangedDate")) || null,
      parentTitle: null,
      originalEstimate: hoursField(item, "Microsoft.VSTS.Scheduling.OriginalEstimate"),
      completedWork: hoursField(item, "Microsoft.VSTS.Scheduling.CompletedWork"),
      remainingWork: hoursField(item, "Microsoft.VSTS.Scheduling.RemainingWork"),
    };
  };
  const workItemFields =
    "System.Title,System.TeamProject,System.WorkItemType,System.State,System.AssignedTo,System.IterationPath,System.AreaPath,System.Parent,System.Description,System.ChangedDate,Microsoft.VSTS.Scheduling.OriginalEstimate,Microsoft.VSTS.Scheduling.CompletedWork,Microsoft.VSTS.Scheduling.RemainingWork";
  const optional = <A>(effect: Effect.Effect<A, AzureDevOpsWorkspaceError>, fallback: A) =>
    effect.pipe(Effect.orElseSucceed(() => fallback));
  const loadComments = (project: string, id: number) =>
    optional(
      request({
        path: `/${encode(project)}/_apis/wit/workItems/${id}/comments?$top=30&order=asc&api-version=7.1-preview.4`,
      }).pipe(
        Effect.map((result) => {
          const comments =
            (
              result as {
                comments?: Array<{
                  id?: number;
                  text?: string;
                  createdBy?: { displayName?: string };
                  createdDate?: string;
                }>;
              }
            ).comments ?? [];
          return comments.flatMap((comment) => {
            if (!Number.isInteger(comment.id)) return [];
            return [
              {
                id: comment.id as number,
                author: comment.createdBy?.displayName ?? "Azure DevOps",
                text: (comment.text ?? "").slice(0, 8000),
                createdAt: comment.createdDate ?? null,
              },
            ];
          });
        }),
      ),
      [],
    );
  /**
   * The board columns come from here: ADO owns both the list and the colours, so
   * a process change reaches the UI without a code change.
   */
  const listStates = (project: string, type: string) =>
    request({ path: path(project, `wit/workitemtypes/${encode(type)}/states`) }).pipe(
      Effect.map((result) =>
        (
          (result as { value?: Array<{ name?: string; color?: string; category?: string }> })
            .value ?? []
        ).flatMap((state) =>
          state.name
            ? [
                {
                  name: state.name,
                  color: (state.color ?? "").replace("#", ""),
                  category: state.category ?? "",
                },
              ]
            : [],
        ),
      ),
    );
  /**
   * `System.IterationPath` drops the `Iteration` folder the classification tree
   * carries, so the tree node has to be rewritten to match work items by string.
   */
  const iterationPath = (nodePath: string): string => {
    const segments = nodePath.split("\\").filter((segment) => segment.length > 0);
    const [project, ...rest] = segments;
    if (rest[0] === "Iteration") rest.shift();
    return [project ?? "", ...rest].join("\\");
  };
  const flattenIterations = (nodes: readonly AzureIterationNode[]): AzureIteration[] =>
    nodes.flatMap((node) => {
      const name = text(node.name);
      const nodePath = text(node.path);
      if (!name || !nodePath) return [];
      const segments = nodePath.split("\\").filter((segment) => segment.length > 0);
      // The tree's root is the `Iteration` folder itself, not a sprint.
      const isRoot = segments.at(-1) === "Iteration";
      return [
        ...(isRoot
          ? []
          : [
              {
                name,
                path: iterationPath(nodePath),
                startDate: node.attributes?.startDate ?? null,
                finishDate: node.attributes?.finishDate ?? null,
              },
            ]),
        ...flattenIterations(node.children ?? []),
      ];
    });
  /**
   * The project tree, not the team's iterations: UPANGO assigns only a handful of
   * sprints to a team, and the items live in sprints that team does not list.
   */
  const listIterations = (project: string) =>
    request({ path: path(project, "wit/classificationnodes/iterations?$depth=5") }).pipe(
      Effect.map((result) => flattenIterations([result as AzureIterationNode])),
    );
  const loadStates = (project: string, type: string) =>
    type ? optional(listStates(project, type), []) : Effect.succeed([]);
  /**
   * The all-projects board draws one column per state name, so it needs the states
   * of every project at once: each project owns its process, and the same name can
   * carry a different colour in each. The first project that defines a state fixes
   * both its position and its colour, which keeps the columns stable across reads.
   * A project that fails contributes nothing instead of breaking the whole board.
   */
  const listWorkItemStates = (projects: readonly string[], type: string) =>
    Effect.gen(function* () {
      const typeName = type.trim();
      const names = [...new Set(projects.map((project) => project.trim()))]
        .filter((project) => project.length > 0)
        .slice(0, 40);
      if (!typeName || names.length === 0) return [];
      const perProject = yield* Effect.all(
        names.map((project) => loadStates(project, typeName)),
        { concurrency: 4 },
      );
      const merged: Array<{ name: string; color: string; category: string }> = [];
      const seen = new Set<string>();
      for (const states of perProject) {
        for (const state of states) {
          if (seen.has(state.name)) continue;
          seen.add(state.name);
          merged.push(state);
        }
      }
      return merged;
    });
  /**
   * Sprints travel with the items: the calendar and the sprint selector read the
   * dates from the work items themselves, so the board costs one extra ADO call
   * for the project's iteration tree and nothing else.
   */
  const withIterationDates = <A extends { iteration: string | null }>(
    project: string,
    items: readonly A[],
  ) =>
    Effect.gen(function* () {
      const tree = yield* optional(listIterations(project), []);
      const byPath = new Map(tree.map((iteration) => [iteration.path, iteration]));
      return items.map((item) => {
        const sprint = item.iteration ? byPath.get(item.iteration) : undefined;
        return {
          ...item,
          iterationStart: sprint?.startDate ?? null,
          iterationFinish: sprint?.finishDate ?? null,
        };
      });
    });
  const loadFieldLabels = (project: string, type: string) =>
    type
      ? optional(
          request({ path: path(project, `wit/workitemtypes/${encode(type)}/fields`) }).pipe(
            Effect.map((result) => {
              const labels = new Map<string, string>();
              for (const entry of (
                result as { value?: Array<{ referenceName?: string; name?: string }> }
              ).value ?? []) {
                if (entry.referenceName && entry.name) labels.set(entry.referenceName, entry.name);
              }
              return labels;
            }),
          ),
          new Map<string, string>(),
        )
      : Effect.succeed(new Map<string, string>());
  const loadRelationTitles = (project: string, relations: readonly AzureRelation[]) =>
    Effect.gen(function* () {
      const ids = [
        ...new Set(
          relations.flatMap((relation) => {
            const id = workItemIdFromUrl(relation.url ?? "");
            return id === null ? [] : [id];
          }),
        ),
      ].slice(0, 20);
      if (ids.length === 0) return new Map<number, string>();
      const batch = yield* optional(
        request({ path: path(project, `wit/workitems?ids=${ids.join(",")}&fields=System.Title`) }),
        null,
      );
      const titles = new Map<number, string>();
      for (const entry of (batch as { value?: AzureItem[] } | null)?.value ?? [])
        titles.set(entry.id, text(field(entry, "System.Title")));
      return titles;
    });
  const getWorkItem = (project: string, id: number) =>
    Effect.gen(function* () {
      const { organization } = yield* credentials;
      const item = (yield* request({
        path: path(project, `wit/workitems/${id}?$expand=relations`),
      })) as AzureItem;
      const base = toWorkItem(organization, item);
      const relations = item.relations ?? [];
      const [comments, states, labels, titles] = yield* Effect.all(
        [
          loadComments(project, id),
          loadStates(project, base.type),
          loadFieldLabels(project, base.type),
          loadRelationTitles(project, relations),
        ],
        { concurrency: 4 },
      );
      const fields = Object.entries(item.fields ?? {})
        .flatMap(([name, value]) => {
          if (HIDDEN_FIELDS.has(name)) return [];
          const rendered = fieldText(value);
          if (!rendered) return [];
          return [{ label: labels.get(name) ?? name, value: rendered }];
        })
        .slice(0, 24);
      return {
        ...base,
        reason: text(field(item, "System.Reason")) || null,
        priority: text(field(item, "Microsoft.VSTS.Common.Priority")) || null,
        createdBy: identity(field(item, "System.CreatedBy")),
        createdAt: text(field(item, "System.CreatedDate")) || null,
        comments,
        states,
        relations: relations.slice(0, 20).map((relation) => {
          const relatedId = workItemIdFromUrl(relation.url ?? "");
          return {
            name: relation.attributes?.name || relation.rel || "Relación",
            id: relatedId,
            title: relatedId === null ? null : titles.get(relatedId) || null,
            url: relation.url ?? "",
          };
        }),
        fields,
      };
    });
  /** Parent titles in one batch read; the view shows the task each sub-task belongs to. */
  const loadParentTitles = (parentIds: readonly number[]) =>
    Effect.gen(function* () {
      const ids = [...new Set(parentIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
      if (ids.length === 0) return new Map<number, string>();
      const batch = yield* optional(
        request({
          path: `/_apis/wit/workitemsbatch?api-version=${API_VERSION}`,
          method: "POST",
          body: { ids, fields: ["System.Title"] },
        }),
        null,
      );
      const titles = new Map<number, string>();
      for (const entry of (batch as { value?: AzureItem[] } | null)?.value ?? [])
        titles.set(entry.id, text(field(entry, "System.Title")));
      return titles;
    });
  const withParentTitles = <A extends { readonly parentId?: number | null | undefined }>(
    items: readonly A[],
  ) =>
    loadParentTitles(items.flatMap((item) => (item.parentId == null ? [] : [item.parentId]))).pipe(
      Effect.map((titles) =>
        items.map((item) => ({
          ...item,
          parentTitle: item.parentId == null ? null : (titles.get(item.parentId) ?? null),
        })),
      ),
    );
  /**
   * Every project at once, for the tasks view: one WIQL for the whole organisation and one
   * batch read, the same two calls the assigned-to-me list already uses. The sprint dates are
   * the only thing that has to be resolved per project, so the items are grouped for that step.
   */
  const listEveryProjectWorkItems = (
    assignedToMe: boolean,
    query?: string,
    type?: string,
    iteration?: string,
  ) =>
    Effect.gen(function* () {
      const { organization } = yield* credentials;
      const typeClause = type?.trim()
        ? ` AND [System.WorkItemType] = '${wiqlLiteral(type.trim())}'`
        : "";
      const iterationClause = iteration?.trim()
        ? ` AND [System.IterationPath] = '${wiqlLiteral(iteration.trim())}'`
        : "";
      const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.Id] > 0${assignedToMe ? " AND [System.AssignedTo] = @Me" : ""}${typeClause}${iterationClause}${workItemSearchClause(query)} ORDER BY [System.ChangedDate] DESC`;
      const result = (yield* request({
        path: `/_apis/wit/wiql?$top=20000&api-version=${API_VERSION}`,
        method: "POST",
        body: { query: wiql },
      })) as { workItems?: Array<{ id: number }> };
      const ids = (result.workItems ?? [])
        .map((item) => item.id)
        .filter((id) => Number.isInteger(id));
      if (ids.length === 0) return [];
      const batches = yield* Effect.forEach(
        Array.from({ length: Math.ceil(ids.length / 200) }, (_, index) =>
          ids.slice(index * 200, (index + 1) * 200),
        ),
        (batchIds) =>
          request({
            path: `/_apis/wit/workitemsbatch?api-version=${API_VERSION}`,
            method: "POST",
            body: { ids: batchIds, fields: workItemFields.split(",") },
          }),
        { concurrency: 2 },
      );
      const items = batches.flatMap((batch) =>
        ((batch as { value?: AzureItem[] }).value ?? []).map((item) =>
          toWorkItem(organization, item),
        ),
      );
      const byProject = new Map<string, Array<(typeof items)[number]>>();
      for (const item of items) {
        if (!item.project) continue;
        const bucket = byProject.get(item.project);
        if (bucket) bucket.push(item);
        else byProject.set(item.project, [item]);
      }
      const dated = yield* Effect.forEach(
        [...byProject],
        ([project, projectItems]) => withIterationDates(project, projectItems),
        { concurrency: 2 },
      );
      return yield* withParentTitles(dated.flat());
    });
  const listWorkItems = (
    project: string | undefined,
    assignedToMe: boolean,
    query?: string,
    type?: string,
    iteration?: string,
  ) =>
    project?.trim()
      ? Effect.gen(function* () {
          const { organization } = yield* credentials;
          const typeClause = type?.trim()
            ? ` AND [System.WorkItemType] = '${wiqlLiteral(type.trim())}'`
            : "";
          const iterationClause = iteration?.trim()
            ? ` AND [System.IterationPath] = '${wiqlLiteral(iteration.trim())}'`
            : "";
          const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project${assignedToMe ? " AND [System.AssignedTo] = @Me" : ""}${typeClause}${iterationClause}${workItemSearchClause(query)} ORDER BY [System.ChangedDate] DESC`;
          const result = (yield* request({
            path: path(project, "wit/wiql?$top=100"),
            method: "POST",
            body: { query: wiql },
          })) as { workItems?: Array<{ id: number }> };
          const ids = (result.workItems ?? [])
            .map((item) => item.id)
            .filter((id) => Number.isInteger(id))
            .slice(0, 100);
          if (ids.length === 0) return [];
          const batch = (yield* request({
            path: path(
              project,
              `wit/workitems?ids=${ids.join(",")}&fields=${encode(workItemFields)}`,
            ),
          })) as { value?: AzureItem[] };
          return yield* withIterationDates(
            project,
            (batch.value ?? []).map((item) => toWorkItem(organization, item)),
          );
        })
      : listEveryProjectWorkItems(assignedToMe, query, type, iteration);
  const listAssignedWorkItems = () =>
    Effect.gen(function* () {
      const { organization } = yield* credentials;
      const wiql =
        "SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC";
      const result = (yield* request({
        path: `/_apis/wit/wiql?$top=200&api-version=${API_VERSION}`,
        method: "POST",
        body: { query: wiql },
      })) as { workItems?: Array<{ id: number }> };
      const ids = (result.workItems ?? [])
        .map((entry) => entry.id)
        .filter((id) => Number.isInteger(id))
        .slice(0, 200);
      if (ids.length === 0) return [];
      const batch = (yield* request({
        path: `/_apis/wit/workitemsbatch?api-version=${API_VERSION}`,
        method: "POST",
        body: { ids, fields: workItemFields.split(",") },
      })) as { value?: AzureItem[] };
      return (batch.value ?? []).map((item) => toWorkItem(organization, item));
    });
  const listRepositories = (project: string) =>
    request({ path: path(project, "git/repositories") }).pipe(
      Effect.map((result) =>
        (
          (
            result as {
              value?: Array<{
                id?: string;
                name?: string;
                webUrl?: string;
                remoteUrl?: string;
                defaultBranch?: string | null;
              }>;
            }
          ).value ?? []
        ).map((repository) => ({
          id: repository.id ?? "",
          project,
          name: repository.name ?? "",
          webUrl: repository.webUrl ?? "",
          remoteUrl: repository.remoteUrl ?? "",
          defaultBranch: repository.defaultBranch ?? null,
        })),
      ),
    );
  const listBranches = (project: string, repositoryId: string) =>
    request({
      path: path(project, `git/repositories/${encode(repositoryId)}/refs?filter=heads/&$top=100`),
    }).pipe(
      Effect.map((result) =>
        ((result as { value?: Array<{ name?: string; objectId?: string }> }).value ?? []).map(
          (branch) => ({ name: branch.name ?? "", objectId: branch.objectId ?? "" }),
        ),
      ),
    );
  const listPullRequests = (project: string, repositoryId?: string) =>
    Effect.gen(function* () {
      const { organization } = yield* credentials;
      const resource = repositoryId
        ? `git/repositories/${encode(repositoryId)}/pullrequests`
        : "git/pullrequests";
      const result = (yield* request({
        path: path(project, `${resource}?searchCriteria.status=active&$top=100`),
      })) as { value?: Array<Record<string, unknown>> };
      return (result.value ?? []).map((pr) => {
        const repository = (pr.repository ?? {}) as Record<string, unknown>;
        const createdBy = (pr.createdBy ?? {}) as Record<string, unknown>;
        const links = (pr._links ?? {}) as { web?: { href?: string } };
        const id = Number(pr.pullRequestId ?? 0);
        const repoId = text(repository.id);
        return {
          id,
          repositoryId: repoId,
          repositoryName: text(repository.name),
          repositoryRemoteUrl: text(repository.remoteUrl),
          title: text(pr.title),
          status: text(pr.status),
          sourceBranch: text(pr.sourceRefName),
          targetBranch: text(pr.targetRefName),
          url:
            links.web?.href ??
            `https://dev.azure.com/${encode(organization)}/${encode(project)}/_git/${encode(text(repository.name))}/pullrequest/${id}`,
          createdBy: text(createdBy.displayName),
          isDraft: pr.isDraft === true,
        };
      });
    });
  const getPullRequestDetail = (project: string, repositoryId: string, id: number) =>
    Effect.gen(function* () {
      const projectInfo = (yield* request({
        path: `/_apis/projects/${encode(project)}?api-version=${API_VERSION}`,
      })) as { id?: string };
      if (!projectInfo.id)
        return yield* Effect.fail(
          error("failed", "Azure DevOps no devolvió el identificador del proyecto."),
        );
      const pr = (yield* request({
        path: path(project, `git/repositories/${encode(repositoryId)}/pullrequests/${id}`),
      })) as { status?: string };
      const refsResponse = (yield* request({
        path: path(
          project,
          `git/repositories/${encode(repositoryId)}/pullrequests/${id}/workitems`,
        ),
      })) as Array<{ id?: string }> | { value?: Array<{ id?: string }> };
      const refs = Array.isArray(refsResponse) ? refsResponse : (refsResponse.value ?? []);
      const linkedWorkItemIds = refs
        .map((ref) => Number(ref.id))
        .filter((value) => Number.isSafeInteger(value) && value > 0);
      const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectInfo.id}/${id}`;
      const evaluationsResponse = (yield* request({
        path: `/${encode(project)}/_apis/policy/evaluations?artifactId=${encode(artifactId)}&api-version=7.1-preview.1`,
      })) as
        | Array<{
            status?: string;
            configuration?: { isBlocking?: boolean; type?: { displayName?: string } };
          }>
        | {
            value?: Array<{
              status?: string;
              configuration?: { isBlocking?: boolean; type?: { displayName?: string } };
            }>;
          };
      const evaluations = Array.isArray(evaluationsResponse)
        ? evaluationsResponse
        : (evaluationsResponse.value ?? []);
      const policies = evaluations.map((entry) => ({
        name: entry.configuration?.type?.displayName ?? "Política",
        status: entry.status ?? "unknown",
        blocking: entry.configuration?.isBlocking === true,
      }));
      const blocking = policies.filter((entry) => entry.blocking);
      const policyStatus =
        blocking.length === 0
          ? null
          : blocking.some((entry) => entry.status === "rejected" || entry.status === "broken")
            ? "failed"
            : blocking.every((entry) => entry.status === "approved")
              ? "approved"
              : "pending";
      const outcome: "approved" | "failed" | "no-evidence" =
        policyStatus === "failed" || pr.status === "abandoned"
          ? "failed"
          : linkedWorkItemIds.length > 0 && policyStatus === "approved"
            ? "approved"
            : "no-evidence";
      return {
        id,
        linkedWorkItemIds,
        policies,
        qualityGate: {
          workItemLinked: linkedWorkItemIds.length > 0,
          pullRequestLinked: true,
          pullRequestStatus: pr.status ?? null,
          policyStatus,
          outcome,
        },
      };
    });
  const updateWorkItem = (input: {
    project: string;
    id: number;
    comment?: string;
    state?: string;
    title?: string;
    description?: string;
    assignedTo?: string | null;
    areaPath?: string;
    iterationPath?: string;
  }) =>
    Effect.gen(function* () {
      if (input.title !== undefined && !input.title.trim())
        return yield* Effect.fail(error("configuration", "El título no puede quedar vacío."));
      if (input.description !== undefined && input.description.length > 100_000)
        return yield* Effect.fail(
          error("configuration", "La descripción supera el tamaño permitido."),
        );
      const changes = [
        ...(input.title?.trim()
          ? [{ op: "add", path: "/fields/System.Title", value: input.title.trim() }]
          : []),
        ...(input.description !== undefined
          ? [{ op: "add", path: "/fields/System.Description", value: input.description }]
          : []),
        ...(input.state?.trim()
          ? [{ op: "add", path: "/fields/System.State", value: input.state.trim() }]
          : []),
        // An empty identity removes the field; ADO rejects an empty string here.
        ...(input.assignedTo === undefined
          ? []
          : input.assignedTo?.trim()
            ? [{ op: "add", path: "/fields/System.AssignedTo", value: input.assignedTo.trim() }]
            : [{ op: "remove", path: "/fields/System.AssignedTo" }]),
        ...(input.areaPath?.trim()
          ? [{ op: "add", path: "/fields/System.AreaPath", value: input.areaPath.trim() }]
          : []),
        ...(input.iterationPath?.trim()
          ? [{ op: "add", path: "/fields/System.IterationPath", value: input.iterationPath.trim() }]
          : []),
        ...(input.comment?.trim()
          ? [{ op: "add", path: "/fields/System.History", value: input.comment.trim() }]
          : []),
      ];
      if (changes.length === 0)
        return yield* Effect.fail(error("configuration", "No hay cambios para publicar."));
      yield* request({
        path: path(input.project, `wit/workitems/${input.id}`),
        method: "PATCH",
        contentType: "application/json-patch+json",
        body: changes,
      });
      return yield* getWorkItem(input.project, input.id);
    });

  return {
    config,
    listProjects,
    listWorkItems,
    listWorkItemStates,
    listAssignedWorkItems,
    getWorkItem,
    listRepositories,
    listBranches,
    listPullRequests,
    getPullRequestDetail,
    updateWorkItem,
  };
});
