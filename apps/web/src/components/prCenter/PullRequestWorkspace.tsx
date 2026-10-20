import type { EnvironmentId, PullRequestListEntry, PullRequestRef } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { pullRequestEnvironment } from "../../state/pullRequests";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { parsePatch, patchLineText, type PatchFile } from "./pullRequestPatch";
import {
  initials,
  PR_CHECK_COLOR,
  PR_STATE_COLOR,
  PR_STATE_LABEL,
  relativeAge,
  shortRepository,
} from "./pullRequestVisuals";

type Tab = "overview" | "files" | "commits" | "discussions" | "policies";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "files", label: "Files" },
  { key: "commits", label: "Commits" },
  { key: "discussions", label: "Discussions" },
  { key: "policies", label: "Policies" },
];

const FILE_STATUS: Record<PatchFile["status"], { label: string; color: string }> = {
  new: { label: "nuevo", color: "#22c55e" },
  deleted: { label: "borrado", color: "#ef4444" },
  renamed: { label: "renombrado", color: "#a78bfa" },
  modified: { label: "cambiado", color: "#4c9aff" },
};

function Panel({
  title,
  children,
  aside,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {aside ? <span className="ml-auto text-2xs text-muted-foreground">{aside}</span> : null}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

const emptyNote = (text: string) => <p className="text-xs text-muted-foreground">{text}</p>;

function FileBlock({ file }: { readonly file: PatchFile }) {
  const fate = FILE_STATUS[file.status];
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-1.5 text-2xs">
        <span
          className="rounded px-1 py-px text-3xs font-semibold uppercase"
          style={{ backgroundColor: `${fate.color}26`, color: fate.color }}
        >
          {fate.label}
        </span>
        <span className="min-w-0 truncate font-mono">{file.path}</span>
        {file.previousPath ? (
          <span className="truncate font-mono text-muted-foreground">
            antes {file.previousPath}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 font-mono tabular-nums">
          <span className="text-success">+{file.additions}</span>{" "}
          <span className="text-destructive">−{file.deletions}</span>
        </span>
      </div>
      <pre className="max-h-[28rem] overflow-auto px-0 py-1 font-mono text-2xs leading-relaxed">
        {file.lines.map((line, index) => (
          <div
            // The patch has no ids and never reorders, so the line's own position is the only
            // stable identity it has; a content hash would collide on repeated blank lines.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={
              line.kind === "add"
                ? "bg-success/10 text-success"
                : line.kind === "delete"
                  ? "bg-destructive/10 text-destructive"
                  : line.kind === "hunk"
                    ? "bg-primary/10 text-primary/80"
                    : line.kind === "meta"
                      ? "text-muted-foreground"
                      : "text-foreground/80"
            }
          >
            <span className="inline-block w-8 shrink-0 select-none pl-2 opacity-60">
              {line.kind === "add" ? "+" : line.kind === "delete" ? "−" : ""}
            </span>
            {patchLineText(line) || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

/**
 * One pull request, read-first: five tabs over the same data the rest of the app already reads,
 * in the PR Center's own visual language. Nothing here writes to the host; the full workspace
 * that can (comments, votes, merge) is one click away and stays untouched.
 */
export function PullRequestWorkspace({
  entry,
  environmentId,
  onBack,
}: {
  readonly entry: PullRequestListEntry;
  readonly environmentId: EnvironmentId;
  readonly onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const reference: PullRequestRef = {
    projectId: entry.projectId,
    host: entry.host,
    repository: entry.repository,
    number: entry.number,
  };
  const detail = useEnvironmentQuery(
    tab === "overview" ? pullRequestEnvironment.detail({ environmentId, input: reference }) : null,
  );
  const diff = useEnvironmentQuery(
    tab === "files" ? pullRequestEnvironment.diff({ environmentId, input: reference }) : null,
  );
  const activity = useEnvironmentQuery(
    tab === "commits" || tab === "discussions"
      ? pullRequestEnvironment.activity({ environmentId, input: reference })
      : null,
  );
  const checks = useEnvironmentQuery(
    tab === "policies" ? pullRequestEnvironment.checks({ environmentId, input: reference }) : null,
  );
  const files = useMemo(() => parsePatch(diff.data?.patch ?? ""), [diff.data?.patch]);
  const color = PR_STATE_COLOR[entry.state];
  const comments = activity.data?.comments ?? [];

  return (
    <SidebarInset className="min-w-0">
      <WorkspacePageHeader>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          PR Center
        </button>
        <h1 className="min-w-0 truncate text-base font-semibold">{entry.title}</h1>
        <span
          className="shrink-0 rounded px-1.5 py-px text-3xs font-semibold uppercase"
          style={{ backgroundColor: `${color}26`, color }}
        >
          {entry.isDraft ? "Borrador" : PR_STATE_LABEL[entry.state]}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {shortRepository(entry.repository)} #{entry.number}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => detail.refresh()}>
            Actualizar
          </Button>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs text-primary underline"
          >
            Abrir en Azure <ExternalLinkIcon className="size-3" />
          </a>
          <Link
            to="/pull-requests"
            search={{
              projectId: reference.projectId,
              host: entry.host,
              repository: reference.repository,
              number: reference.number,
              selectedProjectId: reference.projectId,
              selectedHost: entry.host,
              involvement: "all",
              state: "all",
            }}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Vista completa
          </Link>
        </span>
      </WorkspacePageHeader>

      <div className="flex h-[calc(100vh-var(--workspace-topbar-height))] min-h-0 flex-col">
        <div className="flex items-center gap-1 border-b px-4">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {key === "files" && files.length > 0 ? (
                <span className="ml-1.5 font-mono text-3xs text-muted-foreground">
                  {files.length}
                </span>
              ) : null}
              {key === "discussions" && comments.length > 0 ? (
                <span className="ml-1.5 font-mono text-3xs text-muted-foreground">
                  {comments.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-gutter-both">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-2xs text-muted-foreground">
              <span className="font-mono">
                {entry.headBranch} → {entry.baseBranch}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                {entry.author ? (
                  <>
                    <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary">
                      {initials(entry.author.name ?? entry.author.login ?? "")}
                    </span>
                    {entry.author.name ?? entry.author.login}
                  </>
                ) : (
                  "sin autor"
                )}
              </span>
              <span aria-hidden>·</span>
              <span>{entry.projectTitle}</span>
              <span aria-hidden>·</span>
              <span>actualizada {relativeAge(entry.updatedAt)}</span>
              {entry.checksState ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: PR_CHECK_COLOR[entry.checksState] }}
                    />
                    {entry.checksState === "passing"
                      ? "checks en verde"
                      : entry.checksState === "failing"
                        ? "checks en rojo"
                        : "checks pendientes"}
                  </span>
                </>
              ) : null}
            </div>

            {tab === "overview" ? (
              <>
                <Panel
                  title="Descripción"
                  aside={detail.isPending ? "leyendo…" : (entry.author?.name ?? undefined)}
                >
                  {detail.error ? (
                    <p className="text-xs text-destructive">{detail.error}</p>
                  ) : detail.data?.body?.trim() ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {detail.data.body}
                    </p>
                  ) : (
                    emptyNote("Sin descripción.")
                  )}
                </Panel>
                <Panel title="Revisores" aside={`${detail.data?.reviewers.length ?? 0}`}>
                  {detail.data && detail.data.reviewers.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {detail.data.reviewers.map((reviewer) => (
                        <li
                          key={reviewer.login ?? reviewer.name ?? "revisor"}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs"
                        >
                          <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary">
                            {initials(reviewer.name ?? reviewer.login ?? "")}
                          </span>
                          {reviewer.name ?? reviewer.login ?? "sin nombre"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    emptyNote(
                      detail.isPending
                        ? "Leyendo revisores…"
                        : "Azure no lista revisores en esta lectura.",
                    )
                  )}
                </Panel>
              </>
            ) : null}

            {tab === "files" ? (
              diff.error ? (
                <p className="text-xs text-destructive">{diff.error}</p>
              ) : diff.isPending && files.length === 0 ? (
                emptyNote("Leyendo el diff de la pull request…")
              ) : files.length === 0 ? (
                emptyNote("Esta pull request no trae cambios que mostrar.")
              ) : (
                <>
                  <p className="text-2xs text-muted-foreground">
                    {files.length} ficheros ·{" "}
                    <span className="font-mono">
                      <span className="text-success">
                        +{files.reduce((total, file) => total + file.additions, 0)}
                      </span>{" "}
                      <span className="text-destructive">
                        −{files.reduce((total, file) => total + file.deletions, 0)}
                      </span>
                    </span>
                  </p>
                  {files.map((file) => (
                    <FileBlock key={`${file.previousPath ?? ""}${file.path}`} file={file} />
                  ))}
                  {diff.data?.nextCursor ? (
                    <p className="text-2xs text-muted-foreground">
                      El diff llega por trozos y este es el primero. La vista completa carga el
                      resto.
                    </p>
                  ) : null}
                </>
              )
            ) : null}

            {tab === "commits" ? (
              <Panel title="Commits" aside={`${activity.data?.commits.length ?? 0}`}>
                {activity.data && activity.data.commits.length > 0 ? (
                  <ul className="divide-y">
                    {activity.data.commits.map((commit) => (
                      <li
                        key={commit.oid}
                        className="flex flex-wrap items-center gap-2 py-1.5 text-2xs"
                      >
                        <span className="rounded bg-muted px-1 font-mono text-3xs">
                          {commit.oid.slice(0, 7)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{commit.messageHeadline}</span>
                        <span className="text-muted-foreground">
                          {relativeAge(commit.committedDate)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  emptyNote("Azure no devuelve la lista de commits de la PR por esta vía todavía.")
                )}
              </Panel>
            ) : null}

            {tab === "discussions" ? (
              <Panel title="Discussions" aside={`${comments.length}`}>
                {activity.data && comments.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {comments.map((comment) => (
                      <li key={comment.id} className="rounded-md border p-2">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary">
                              {initials(comment.author?.name ?? comment.author?.login ?? "")}
                            </span>
                            {comment.author?.name ?? comment.author?.login ?? "anónimo"}
                          </span>
                          <span aria-hidden>·</span>
                          <span>{relativeAge(comment.createdAt)}</span>
                          {comment.path ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-mono">{comment.path}</span>
                            </>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed">
                          {comment.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  emptyNote("Sin comentarios que enseñar.")
                )}
              </Panel>
            ) : null}

            {tab === "policies" ? (
              <Panel title="Policies" aside={`${checks.data?.checks.length ?? 0}`}>
                {checks.error ? (
                  <p className="text-xs text-destructive">{checks.error}</p>
                ) : checks.data && checks.data.checks.length > 0 ? (
                  <ul className="divide-y">
                    {checks.data.checks.map((check) => (
                      <li
                        key={check.name}
                        className="flex flex-wrap items-center gap-2 py-1.5 text-2xs"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              check.status === "success"
                                ? "#22c55e"
                                : check.status === "failure"
                                  ? "#ef4444"
                                  : check.status === "pending"
                                    ? "#f59e0b"
                                    : "#a1a1aa",
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{check.name}</span>
                        <span className="text-muted-foreground">{check.status}</span>
                        {check.required ? (
                          <span className="rounded bg-muted px-1 text-3xs">obligatoria</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  emptyNote(
                    "Azure no devuelve políticas ni validaciones de build por esta vía todavía.",
                  )
                )}
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
