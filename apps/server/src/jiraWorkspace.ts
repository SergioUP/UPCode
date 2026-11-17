// @effect-diagnostics globalFetchInEffect:off globalTimersInEffect:off preferSchemaOverJson:off -- This Jira REST boundary owns the token, timeout and untrusted JSON envelope.
/**
 * Jira Cloud as the tracker behind the tasks section.
 *
 * Only the pieces the existing work-item UI already consumes are implemented:
 * projects as spaces, a project's board columns as states, a JQL listing, one
 * issue with its rendered description, and writes expressed as transitions.
 * Every oddity of the Jira model (a column may group several statuses, changing
 * state needs a transition, rich text is ADF) is flattened here so the client
 * keeps seeing one work item shape.
 *
 * @module jiraWorkspace
 */
import * as Effect from "effect/Effect";
import {
  AzureDevOpsWorkspaceError,
  type AzureDevOpsProject,
  type AzureDevOpsWorkItem,
  type AzureDevOpsWorkItemStateOption,
  type JiraSettings,
} from "@upcode/contracts";
import * as ServerSettings from "./serverSettings.ts";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 500;
const REQUEST_TIMEOUT_MS = 20_000;

/** Jira status categories have a colour name, not a hex. These are the palette. */
const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  "blue-gray": "#64748b",
  yellow: "#e2b203",
  green: "#22a06b",
};
const FALLBACK_COLOR = "#8b8b8b";

type JiraStatus = {
  readonly id?: string;
  readonly name?: string;
  readonly statusCategory?: { readonly name?: string; readonly colorName?: string };
};
type JiraIssueFields = {
  readonly summary?: string;
  readonly updated?: string;
  readonly created?: string;
  readonly labels?: ReadonlyArray<string>;
  readonly project?: { readonly key?: string; readonly name?: string };
  readonly issuetype?: { readonly name?: string; readonly subtask?: boolean };
  readonly status?: JiraStatus;
  readonly assignee?: { readonly displayName?: string; readonly accountId?: string };
  readonly creator?: { readonly displayName?: string };
  readonly priority?: { readonly name?: string };
  readonly parent?: { readonly key?: string; readonly fields?: JiraIssueFields };
  readonly comment?: {
    readonly comments?: ReadonlyArray<{
      readonly id?: string;
      readonly body?: unknown;
      readonly created?: string;
      readonly author?: { readonly displayName?: string };
    }>;
  };
};
type JiraIssue = {
  readonly id?: string;
  readonly key?: string;
  readonly fields?: JiraIssueFields;
  readonly renderedFields?: { readonly description?: string | null };
};
type JiraBoardColumn = {
  readonly name?: string;
  readonly statuses?: ReadonlyArray<{ readonly id?: string }>;
};

const error = (
  reason: AzureDevOpsWorkspaceError["reason"],
  message: string,
): AzureDevOpsWorkspaceError => new AzureDevOpsWorkspaceError({ reason, message });

const text = (value: unknown): string => (typeof value === "string" ? value : "");
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

/** JQL string literals escape a quote by doubling it; never interpolate raw input. */
const jqlLiteral = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const MAX_QUERY_LENGTH = 200;

/** A digits query jumps to a key such as `TAREA-96`; anything else searches text. */
const queryClause = (query: string | undefined): string => {
  const trimmed = (query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9_]*-\d+$/i.test(trimmed))
    return ` AND key = ${jqlLiteral(trimmed.toUpperCase())}`;
  return ` AND text ~ ${jqlLiteral(trimmed)}`;
};

/** One paragraph per line: enough for the plain text the composer gives us. */
export const documentFromText = (value: string) => ({
  type: "doc",
  version: 1,
  content: value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
});

export const plainFromAdf = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content
    .map((child) => plainFromAdf(child))
    .filter((part) => part.length > 0)
    .join("\n");
};

const statusColor = (status: JiraStatus | undefined): string =>
  CATEGORY_COLORS[text(status?.statusCategory?.colorName)] ?? FALLBACK_COLOR;

/**
 * The listing query. A project is mandatory because Jira refuses an unbounded
 * search, so a missing one yields no rows instead of every issue in the site.
 */
export const buildJiraJql = (input: {
  readonly project?: string;
  readonly assignedToMe: boolean;
  readonly query?: string;
}): string => {
  const project = input.project?.trim() ?? "";
  return (
    `project = ${jqlLiteral(project.length > 0 ? project : "EMPTY")}` +
    (input.assignedToMe ? " AND assignee = currentUser()" : "") +
    queryClause(input.query) +
    " ORDER BY updated DESC"
  );
};

export const make = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;

  const connection = serverSettings.getSettings.pipe(
    Effect.map((settings) => settings.jira),
    Effect.mapError(() => error("configuration", "No se puede leer la configuración de Jira.")),
    Effect.flatMap((jira: JiraSettings) => {
      const site = jira.site.trim().replace(/\/+$/, "");
      const token = jira.apiToken.trim();
      const email = jira.email.trim();
      if (!site || !email || !token)
        return Effect.fail(
          error(
            "configuration",
            "Faltan datos de Jira: sitio, email y API token se configuran en Ajustes → Tareas.",
          ),
        );
      return Effect.succeed({
        origin: site.startsWith("http") ? site : `https://${site}`,
        email,
        token,
      });
    }),
  );

  const request = (input: { path: string; method?: string; body?: unknown }) =>
    Effect.gen(function* () {
      const { origin, email, token } = yield* connection;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${origin}${input.path}`, {
              method: input.method ?? "GET",
              headers: {
                Authorization: `Basic ${Buffer.from(`${email}:${token}`, "utf8").toString("base64")}`,
                Accept: "application/json",
                ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
              },
              ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
              signal: controller.signal,
            }),
          catch: () => error("failed", "No se pudo contactar con Jira."),
        });
        if (!response.ok) {
          const detail = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => "",
          }).pipe(Effect.orElseSucceed(() => ""));
          return yield* Effect.fail(
            error(
              responseReason(response.status),
              `Jira devolvió HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`,
            ),
          );
        }
        const raw = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => error("failed", "No se pudo leer la respuesta de Jira."),
        });
        if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES)
          return yield* Effect.fail(error("failed", "La respuesta de Jira supera el límite."));
        return yield* Effect.try({
          try: () => (raw.length ? (JSON.parse(raw) as unknown) : null),
          catch: () => error("failed", "Jira devolvió una respuesta no válida."),
        });
      } finally {
        clearTimeout(timer);
      }
    });

  const config = request({ path: "/rest/api/3/myself" }).pipe(
    Effect.map((me) => ({
      organization: text((me as { displayName?: string }).displayName) || "Jira",
      connected: true,
    })),
    Effect.catchCause(() => Effect.succeed({ organization: "Jira", connected: false })),
  );

  const projectsPath = (key: string, suffix: string) =>
    `/rest/api/3/project/${encode(key)}${suffix}`;

  /** Statuses of a project, in the order its board puts them. */
  const projectStatusOrder = (key: string) =>
    Effect.gen(function* () {
      const boards = (yield* request({
        path: `/rest/agile/1.0/board?projectKeyOrId=${encode(key)}`,
      })) as {
        values?: ReadonlyArray<{ id?: number }>;
      } | null;
      const boardId = boards?.values?.[0]?.id;
      if (boardId !== undefined) {
        const board = (yield* request({
          path: `/rest/agile/1.0/board/${String(boardId)}/configuration`,
        })) as { columnConfig?: { columns?: ReadonlyArray<JiraBoardColumn> } } | null;
        const ids = (board?.columnConfig?.columns ?? []).flatMap((column) =>
          (column.statuses ?? []).flatMap((status) => (status.id ? [status.id] : [])),
        );
        if (ids.length > 0) return ids;
      }
      return [] as ReadonlyArray<string>;
    }).pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));

  const listProjects = request({ path: "/rest/api/3/project/search?maxResults=100" }).pipe(
    Effect.map((result) => {
      const values =
        (result as { values?: ReadonlyArray<{ id?: string; key?: string; name?: string }> } | null)
          ?.values ?? [];
      return values.map((project): AzureDevOpsProject => ({
        id: text(project.key),
        name: text(project.name) || text(project.key),
        url: text(project.id),
      }));
    }),
  );

  /** JQL takes a project name; the status endpoints only take its key or id. */
  const resolveProjectKey = (value: string) =>
    request({ path: "/rest/api/3/project/search?maxResults=100" }).pipe(
      Effect.map((result) => {
        const values =
          (result as { values?: ReadonlyArray<{ key?: string; name?: string }> } | null)?.values ??
          [];
        const found = values.find(
          (project) => text(project.key) === value || text(project.name) === value,
        );
        return text(found?.key) || value;
      }),
      Effect.orElseSucceed(() => value),
    );

  /**
   * The board's columns are the real buckets, but the UI identifies a work item
   * by its status, so the states we return are statuses ordered by the board.
   */
  const listWorkItemStates = (projectKeys: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const requested = projectKeys[0]?.trim();
      if (!requested) return [] as ReadonlyArray<AzureDevOpsWorkItemStateOption>;
      const key = yield* resolveProjectKey(requested);
      const byType = (yield* request({ path: projectsPath(key, "/statuses") })) as ReadonlyArray<{
        statuses?: ReadonlyArray<JiraStatus>;
      }> | null;
      const statuses = new Map<string, JiraStatus>();
      for (const group of byType ?? [])
        for (const status of group.statuses ?? []) {
          const name = text(status.name);
          if (name) statuses.set(name, status);
        }
      const order = yield* projectStatusOrder(key);
      const ordered = [...statuses.values()].sort((left, right) => {
        const leftIndex = order.indexOf(text(left.id));
        const rightIndex = order.indexOf(text(right.id));
        if (leftIndex !== rightIndex)
          return (
            (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
            (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
          );
        return text(left.name).localeCompare(text(right.name));
      });
      return ordered.map((status): AzureDevOpsWorkItemStateOption => ({
        name: text(status.name),
        color: statusColor(status),
        category: text(status.statusCategory?.name),
      }));
    });

  const toWorkItem = (issue: JiraIssue, origin: string): AzureDevOpsWorkItem => {
    const fields = issue.fields ?? {};
    const key = text(issue.key);
    const id = Number(issue.id);
    return {
      id: Number.isSafeInteger(id) ? id : 0,
      project: text(fields.project?.key),
      title: text(fields.summary),
      type: text(fields.issuetype?.name),
      state: text(fields.status?.name),
      assignedTo: fields.assignee?.displayName ?? null,
      iteration: null,
      description: issue.renderedFields?.description ?? null,
      url: key ? `${origin}/browse/${key}` : origin,
      changedAt: fields.updated ?? null,
      area: (fields.labels ?? []).length > 0 ? (fields.labels ?? []).join(", ") : null,
      assignedToAvatar: null,
      parentTitle: fields.parent?.fields?.summary ?? null,
      reason: null,
      priority: fields.priority?.name ?? null,
      createdBy: fields.creator?.displayName ?? null,
      createdAt: fields.created ?? null,
      ...(key ? { key } : {}),
    };
  };

  const listWorkItems = (input: {
    project?: string;
    assignedToMe: boolean;
    query?: string;
    iteration?: string;
  }) =>
    Effect.gen(function* () {
      const { origin } = yield* connection;
      const jql = buildJiraJql(input);
      const result = yield* request({
        path: `/rest/api/3/search?maxResults=${String(MAX_ITEMS)}&fields=summary,status,issuetype,assignee,updated,created,labels,parent,priority,creator,project&jql=${encode(jql)}`,
      });
      const issues = (result as { issues?: ReadonlyArray<JiraIssue> } | null)?.issues ?? [];
      return issues.map((issue) => toWorkItem(issue, origin));
    });

  const listAssignedWorkItems = Effect.gen(function* () {
    const { origin } = yield* connection;
    const result = yield* request({
      path: `/rest/api/3/search?maxResults=100&fields=summary,status,issuetype,assignee,updated,created,labels,parent,priority,creator,project&jql=${encode("assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC")}`,
    });
    const issues = (result as { issues?: ReadonlyArray<JiraIssue> } | null)?.issues ?? [];
    return issues.map((issue) => toWorkItem(issue, origin));
  });

  const getWorkItem = (project: string, id: number) =>
    Effect.gen(function* () {
      const { origin } = yield* connection;
      // Jira accepts its numeric id or the human key; the UI only has the id.
      const issue = (yield* request({
        path: `/rest/api/3/issue/${String(id)}?expand=renderedFields`,
      })) as JiraIssue | null;
      if (issue === null) return yield* Effect.fail(error("not-found", "La incidencia no existe."));
      const item = toWorkItem(issue, origin);
      const comments = (issue.fields?.comment?.comments ?? []).map((comment) => ({
        id: Number(comment.id ?? 0),
        author: text(comment.author?.displayName),
        text: plainFromAdf(comment.body),
        createdAt: comment.created ?? null,
      }));
      if (issue.renderedFields?.description)
        return {
          ...item,
          description: issue.renderedFields.description,
          comments,
        };
      return { ...item, comments };
    });

  /** Jira cannot set a status: it walks the workflow, so we look the transition up. */
  const transitionTo = (issueKey: string, state: string) =>
    Effect.gen(function* () {
      const available = (yield* request({
        path: `/rest/api/3/issue/${encode(issueKey)}/transitions`,
      })) as {
        transitions?: ReadonlyArray<{
          id?: string;
          name?: string;
          to?: { name?: string };
        }>;
      } | null;
      const matches = (available?.transitions ?? []).filter(
        (transition) => text(transition.to?.name) === state,
      );
      const chosen = matches[0];
      if (!chosen?.id)
        return yield* Effect.fail(
          error("failed", `Jira no ofrece ninguna transición a "${state}" desde el estado actual.`),
        );
      yield* request({
        path: `/rest/api/3/issue/${encode(issueKey)}/transitions`,
        method: "POST",
        body: { transition: { id: chosen.id } },
      });
    });

  const updateWorkItem = (input: {
    project: string;
    id: number;
    comment?: string;
    state?: string;
    title?: string;
    description?: string;
  }) =>
    Effect.gen(function* () {
      const issueKey = String(input.id);
      const fields: Record<string, unknown> = {};
      if (input.title !== undefined && input.title.trim()) fields.summary = input.title.trim();
      if (input.description !== undefined) fields.description = documentFromText(input.description);
      if (Object.keys(fields).length > 0)
        yield* request({
          path: `/rest/api/3/issue/${encode(issueKey)}`,
          method: "PUT",
          body: { fields },
        });
      if (input.comment !== undefined && input.comment.trim())
        yield* request({
          path: `/rest/api/3/issue/${encode(issueKey)}/comment`,
          method: "POST",
          body: { body: documentFromText(input.comment) },
        });
      if (input.state !== undefined && input.state.trim())
        yield* transitionTo(issueKey, input.state.trim());
      return yield* getWorkItem(input.project, input.id);
    });

  return {
    config,
    listProjects,
    listWorkItems,
    listWorkItemStates: (projectKeys: ReadonlyArray<string>, _type: string) =>
      listWorkItemStates(projectKeys),
    listAssignedWorkItems: () => listAssignedWorkItems,
    getWorkItem,
    updateWorkItem,
  };
});

export type JiraWorkspace = Effect.Success<typeof make>;
