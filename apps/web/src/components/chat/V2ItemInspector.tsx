import type {
  EnvironmentId,
  OrchestrationV2ProjectedTurnItem,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import {
  toolCallLines,
  turnItemDetailRevision,
  turnItemNeedsDetailFetch,
  turnItemOutputImages,
  turnItemOutputText,
} from "@t3tools/client-runtime/work-log/item-detail";
import { formatDiffCount } from "@t3tools/client-runtime/diff-count";
import { isJavaScriptReplTool } from "@t3tools/shared/toolActivity";
import {
  CopyIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  GitBranchIcon,
  RotateCcwIcon,
} from "lucide-react";
import { memo, Suspense, use, useMemo, useState } from "react";

import { useTheme } from "../../hooks/useTheme";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import { resolveDiffThemeName } from "../../lib/diffRendering";
import { getSyntaxHighlighterPromise } from "../../lib/syntaxHighlighting";
import { useTurnItemDetail } from "../../state/queries";
import { useV2ItemSupport } from "../../state/v2ItemSupport";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";
import { Button } from "../ui/button";
import ChatMarkdown, { ChatMarkdownAssetImage } from "../ChatMarkdown";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { resolveExternalWebLinkHref } from "./externalLinkContextMenu";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";
import { ShellCommandBlock } from "./ShellCommandBlock";

interface V2ItemInspectorProps {
  readonly projectedItem: OrchestrationV2ProjectedTurnItem;
  readonly environmentId: EnvironmentId;
  readonly cwd?: string | undefined;
  readonly workspaceRoot?: string | undefined;
  readonly onOpenThread: (threadId: ThreadId) => void;
  readonly onOpenTurnDiff: (runId: RunId, filePath?: string) => void;
  readonly onRollbackCheckpoint?: (input: {
    readonly checkpointId: string;
    readonly scopeId: string;
  }) => void;
  readonly onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}

function SyntaxTokens({
  text,
  language,
}: {
  readonly text: string;
  readonly language: "json" | "typescript";
}) {
  const { resolvedTheme } = useTheme();
  const highlighter = use(getSyntaxHighlighterPromise(language));
  const { tokens } = useMemo(
    () =>
      highlighter.codeToTokens(text, {
        lang: language,
        theme: resolveDiffThemeName(resolvedTheme),
      }),
    [highlighter, text, language, resolvedTheme],
  );
  return tokens.flatMap((line, lineIndex) => [
    lineIndex > 0 ? "\n" : "",
    ...line.map((token) => (
      <span key={token.offset} style={{ color: token.color }}>
        {token.content}
      </span>
    )),
  ]);
}

const monoClassName =
  "font-mono text-(length:--font-size-code,var(--text-2xs)) leading-relaxed whitespace-pre-wrap break-words select-text";

function StructuredValue({
  value,
  highlightJson = false,
  language,
}: {
  readonly value: unknown;
  readonly highlightJson?: boolean;
  readonly language?: "typescript";
}) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const isJson = useMemo(() => {
    if (!highlightJson || !text) return false;
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }, [highlightJson, text]);
  if (!text) return null;
  return (
    <pre className={cn("max-h-80 overflow-auto text-muted-foreground", monoClassName)}>
      {language || isJson ? (
        <RenderErrorBoundary fallback={text}>
          <Suspense fallback={text}>
            <SyntaxTokens text={text} language={language ?? "json"} />
          </Suspense>
        </RenderErrorBoundary>
      ) : (
        text
      )}
    </pre>
  );
}

/**
 * The item behind a projected row, with the output the timeline withheld
 * fetched while the row is open.
 */
function useFetchedTurnItem(
  projectedItem: OrchestrationV2ProjectedTurnItem,
  environmentId: EnvironmentId,
) {
  const wireItem = projectedItem.item;
  const fetches = turnItemNeedsDetailFetch(wireItem);
  const detail = useTurnItemDetail(
    fetches
      ? {
          environmentId,
          threadId: projectedItem.sourceThreadId,
          itemId: projectedItem.sourceItemId,
          revision: turnItemDetailRevision(wireItem),
          ...(wireItem.type === "command_execution" ? { outputOffset: 0 } : {}),
        }
      : null,
  );
  const fetchedItem = detail.data?.item;
  const item = fetchedItem?.type === wireItem.type ? fetchedItem : wireItem;
  return {
    item,
    output: {
      output: turnItemOutputText(item),
      images: turnItemOutputImages(item),
      environmentId,
      pending: item === wireItem && detail.isPending,
      error:
        item !== wireItem
          ? null
          : detail.data?.item === null
            ? "Output is no longer available."
            : detail.error,
      empty: fetches && item !== wireItem,
      nextOutputOffset: detail.data?.nextOutputOffset,
    },
  };
}

interface ToolOutputState {
  readonly output: string | null;
  readonly images: ReturnType<typeof turnItemOutputImages>;
  readonly environmentId: EnvironmentId;
  readonly pending: boolean;
  readonly error: string | null;
  readonly empty: boolean;
  readonly nextOutputOffset?: number | undefined;
  readonly onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}

function CopyTextButton({ text, label }: { readonly text: string; readonly label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="xs"
      variant="outline"
      onClick={() => {
        void writeTextToClipboard(text, label)
          .then(setCopied)
          .catch(() => setCopied(false));
      }}
    >
      <CopyIcon /> {copied ? "Copied" : `Copy ${label}`}
    </Button>
  );
}

function CommandOutputPage(props: {
  readonly projectedItem: OrchestrationV2ProjectedTurnItem;
  readonly environmentId: EnvironmentId;
  readonly offset: number;
}) {
  const [showNext, setShowNext] = useState(false);
  const detail = useTurnItemDetail({
    environmentId: props.environmentId,
    threadId: props.projectedItem.sourceThreadId,
    itemId: props.projectedItem.sourceItemId,
    revision: turnItemDetailRevision(props.projectedItem.item),
    outputOffset: props.offset,
  });
  const item = detail.data?.item;
  if (detail.isPending) return <p className="text-muted-foreground">Loading output…</p>;
  if (detail.error || item?.type !== "command_execution") {
    return <p className="text-destructive">Couldn&apos;t load the next output page.</p>;
  }
  return (
    <>
      {item.output ? (
        <pre className={cn("whitespace-pre-wrap break-words text-muted-foreground", monoClassName)}>
          {item.output}
        </pre>
      ) : null}
      {item.output ? <CopyTextButton text={item.output} label="output page" /> : null}
      {detail.data?.nextOutputOffset !== undefined ? (
        showNext ? (
          <CommandOutputPage {...props} offset={detail.data.nextOutputOffset} />
        ) : (
          <Button size="xs" variant="outline" onClick={() => setShowNext(true)}>
            Load more output
          </Button>
        )
      ) : null}
    </>
  );
}

function ToolOutput(props: ToolOutputState) {
  const images = props.images.map((resource) => (
    <ChatMarkdownAssetImage
      key={resource.index}
      environmentId={props.environmentId}
      resource={resource}
      alt="Tool output image"
      maxHeightRem={16}
      onImageExpand={props.onImageExpand}
    />
  ));
  const text = props.output ? (
    <div className="max-h-80 overflow-auto text-muted-foreground">{props.output}</div>
  ) : props.pending ? (
    <div className="text-muted-foreground italic">Loading output…</div>
  ) : props.error ? (
    <div className="text-destructive">Couldn&apos;t load output: {props.error}</div>
  ) : props.empty && images.length === 0 ? (
    <div className="text-muted-foreground italic">No output.</div>
  ) : null;
  return (
    <>
      {images}
      {text}
    </>
  );
}

/** A provider patch, or the exact replacement fragments when no patch was supplied. */
function FileChangeContent({
  item,
  workspaceRoot,
}: {
  readonly item: Extract<OrchestrationV2ProjectedTurnItem["item"], { type: "file_change" }>;
  readonly workspaceRoot?: string | undefined;
}) {
  if (item.status === "failed") {
    return item.diffStr?.trim() ? <StructuredValue value={item.diffStr} /> : null;
  }
  const changesWithDiff = item.changes?.filter((change) => change.diff?.trim()) ?? [];
  const oldSections = [...(item.diffStr ?? "").matchAll(/^--- (.+)\n(?=@@)/gm)];
  const files =
    changesWithDiff.length > 0
      ? changesWithDiff.map((change) => ({ path: change.path, diff: change.diff! }))
      : oldSections.length > 1
        ? oldSections.map((section, index) => ({
            path: section[1]!,
            diff: item.diffStr!.slice(
              section.index! + section[0].length,
              oldSections[index + 1]?.index,
            ),
          }))
        : item.diffStr?.trim()
          ? [{ path: item.fileName, diff: item.diffStr }]
          : [];
  if (files.length > 0) {
    return (
      <div className="space-y-2">
        {files.map((file, index) => (
          <details
            key={`${file.path}:${index}`}
            open
            className="overflow-hidden rounded-lg border border-border/60 bg-muted/15"
          >
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FileCodeIcon className="size-4" />
              </span>
              <span className="min-w-0 break-all font-mono">
                {formatWorkspaceRelativePath(file.path, workspaceRoot)}
              </span>
            </summary>
            <PatchContent diff={file.diff} />
          </details>
        ))}
      </div>
    );
  }
  if (item.oldStr !== undefined || item.newStr !== undefined) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground">
          Replacement fragments reported by the provider (not a full file diff).
        </p>
        {item.oldStr !== undefined ? (
          <div>
            <div className="text-destructive">Before</div>
            <StructuredValue value={item.oldStr} />
          </div>
        ) : null}
        {item.newStr !== undefined ? (
          <div>
            <div className="text-success">After</div>
            <StructuredValue value={item.newStr} />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <p className="text-muted-foreground italic">
      The provider did not report a diff for this action.
    </p>
  );
}

function PatchContent({ diff }: { readonly diff: string }) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md border border-border/50 bg-muted/15 p-2",
        monoClassName,
      )}
    >
      {diff.split("\n").map((line, index) => (
        <span
          key={index}
          className={cn(
            "block",
            line.startsWith("+") && !line.startsWith("+++")
              ? "bg-success/10 text-success"
              : line.startsWith("-") && !line.startsWith("---")
                ? "bg-destructive/10 text-destructive"
                : line.startsWith("@@")
                  ? "text-primary"
                  : "text-muted-foreground",
          )}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

/** Fetched output for rows that show their own plain text instead of the inspector. */
export function FetchedToolOutput(props: {
  readonly projectedItem: OrchestrationV2ProjectedTurnItem;
  readonly environmentId: EnvironmentId;
  readonly onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}) {
  const { output } = useFetchedTurnItem(props.projectedItem, props.environmentId);
  return (
    <div className={cn("mt-1.5 space-y-1.5", monoClassName)}>
      <ToolOutput {...output} onImageExpand={props.onImageExpand} />
    </div>
  );
}

/** A tool call's body: the call itself in the foreground, its result muted below. */
function ToolCallBody(
  props: ToolOutputState & {
    readonly command?: string;
    readonly args?: unknown;
    readonly toolName?: string | null;
    readonly exitCode?: number | undefined;
    readonly projectedItem?: OrchestrationV2ProjectedTurnItem;
  },
) {
  const call = toolCallLines({ command: props.command, args: props.args });
  return (
    <div className={cn("space-y-1.5", monoClassName)}>
      {call.command ? (
        <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans font-medium">Command</span>
            <CopyTextButton text={call.command} label="command" />
          </div>
          <ShellCommandBlock command={call.command} />
        </div>
      ) : null}
      {call.args ? (
        <div className="text-foreground/85">
          {call.args.map(([key, value]) => (
            <div key={key}>
              <span className="text-muted-foreground">{key} </span>
              {key === "code" && isJavaScriptReplTool(props.toolName) ? (
                <StructuredValue value={value} language="typescript" />
              ) : (
                value
              )}
            </div>
          ))}
        </div>
      ) : null}
      {call.argsText ? <StructuredValue value={call.argsText} highlightJson /> : null}
      {props.command !== undefined ? (
        <div className="flex items-center justify-between gap-2 font-sans">
          <span className="font-medium">Output</span>
          {props.output ? <CopyTextButton text={props.output} label="output page" /> : null}
        </div>
      ) : null}
      <ToolOutput {...props} />
      {props.nextOutputOffset !== undefined && props.projectedItem ? (
        <NextCommandOutput
          projectedItem={props.projectedItem}
          environmentId={props.environmentId}
          offset={props.nextOutputOffset}
        />
      ) : null}
      {props.exitCode !== undefined ? (
        <div className={props.exitCode === 0 ? "text-success" : "text-destructive"}>
          Exit code: {props.exitCode}
        </div>
      ) : null}
    </div>
  );
}

function NextCommandOutput(props: {
  readonly projectedItem: OrchestrationV2ProjectedTurnItem;
  readonly environmentId: EnvironmentId;
  readonly offset: number;
}) {
  const [open, setOpen] = useState(false);
  return open ? (
    <CommandOutputPage {...props} />
  ) : (
    <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
      Load more output
    </Button>
  );
}

export const V2ItemInspector = memo(function V2ItemInspector(props: V2ItemInspectorProps) {
  const fetched = useFetchedTurnItem(props.projectedItem, props.environmentId);
  const item = fetched.item;
  const outputState = fetched.output;
  const support = useV2ItemSupport({
    environmentId: props.environmentId,
    sourceThreadId: props.projectedItem.sourceThreadId,
    sourceItemId: props.projectedItem.sourceItemId,
  });
  return (
    <div className="space-y-2 text-xs" data-v2-item-inspector={item.type}>
      {item.type === "reasoning" && item.text ? (
        <div className="rounded-md border border-border/45 bg-muted/15 p-2 italic text-muted-foreground">
          <ChatMarkdown
            text={item.text}
            cwd={props.cwd}
            threadRef={{
              environmentId: props.environmentId,
              threadId: props.projectedItem.sourceThreadId,
            }}
            lineBreaks
          />
        </div>
      ) : null}

      {item.type === "command_execution" ? (
        <ToolCallBody
          command={item.input}
          exitCode={item.exitCode}
          projectedItem={props.projectedItem}
          {...outputState}
          onImageExpand={props.onImageExpand}
        />
      ) : null}

      {item.type === "file_change" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-muted-foreground">
              {formatWorkspaceRelativePath(item.fileName, props.workspaceRoot)}
            </span>
            {item.additions !== undefined || item.deletions !== undefined ? (
              <span>
                <span className="text-success">+{formatDiffCount(item.additions ?? 0)}</span>{" "}
                <span className="text-destructive">-{formatDiffCount(item.deletions ?? 0)}</span>
              </span>
            ) : null}
            {item.runId !== null ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() => props.onOpenTurnDiff(item.runId!, item.fileName)}
              >
                Open diff
              </Button>
            ) : null}
          </div>
          {outputState.pending ? (
            <p className="text-muted-foreground italic">Loading change details…</p>
          ) : outputState.error ? (
            <p className="text-destructive">
              Couldn&apos;t load change details: {outputState.error}
            </p>
          ) : (
            <FileChangeContent item={item} workspaceRoot={props.workspaceRoot} />
          )}
          {item.changes !== undefined &&
          item.changes.length > 0 &&
          !item.changes.some((change) => change.diff) ? (
            <ul className="space-y-1 font-mono text-muted-foreground">
              {item.changes.map((change, index) => (
                <li key={`${change.operation}:${change.path}:${index}`}>
                  {change.operation} {change.oldPath ? `${change.oldPath} → ` : ""}
                  {formatWorkspaceRelativePath(change.path, props.workspaceRoot)}
                  {change.fileType || change.mimeType
                    ? ` (${[change.fileType, change.mimeType].filter(Boolean).join(", ")})`
                    : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {item.type === "file_search" && item.pattern?.trim() ? (
        <div className={cn("text-foreground/85", monoClassName)}>{item.pattern}</div>
      ) : null}

      {item.type === "web_search" && item.patterns?.length ? (
        <div className={cn("text-foreground/85", monoClassName)}>{item.patterns.join("\n")}</div>
      ) : null}

      {item.type === "file_search" && item.results?.length ? (
        <ul className="space-y-1">
          {item.results.map((result) => (
            <li key={JSON.stringify(result)}>
              <span className="font-mono text-foreground/80">
                {formatWorkspaceRelativePath(result.fileName, props.workspaceRoot)}
                {result.line === undefined ? "" : `:${result.line}`}
                {result.column === undefined ? "" : `:${result.column}`}
              </span>
              {result.preview ? (
                <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{result.preview}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {item.type === "web_search" && item.results?.length ? (
        <ul className="space-y-1.5">
          {item.results.map((result) => {
            const safeHref = resolveExternalWebLinkHref(result.url);
            return (
              <li key={JSON.stringify(result)}>
                {safeHref ? (
                  <a
                    href={safeHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                  >
                    {result.title ?? result.url}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                ) : (
                  <p className="font-medium text-foreground">
                    {result.title ?? result.url ?? "Search result"}
                  </p>
                )}
                {result.snippet ? <p className="text-muted-foreground">{result.snippet}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {item.type === "dynamic_tool" ? (
        <ToolCallBody
          toolName={item.toolName}
          args={item.input}
          {...outputState}
          onImageExpand={props.onImageExpand}
        />
      ) : null}

      {item.type === "approval_request" ? <StructuredValue value={item.prompt} /> : null}
      {item.type === "user_input_request" ? (
        <StructuredValue value={item.questions.map((question) => question.question).join("\n\n")} />
      ) : null}
      {item.type === "notification" ? <StructuredValue value={item.detail} /> : null}
      {item.type === "system_notice" ? <StructuredValue value={item.message} /> : null}
      {item.type === "error" ? <StructuredValue value={item.failure.message} /> : null}
      {item.type === "proposed_plan" ? <StructuredValue value={item.markdown} /> : null}
      {item.type === "todo_list" ? (
        <StructuredValue
          value={item.steps
            .map((step) => `${step.status === "completed" ? "✓" : "○"} ${step.text}`)
            .join("\n")}
        />
      ) : null}

      {item.type === "checkpoint" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">
            {support.checkpoint?.status ?? item.status} · {item.files.length} files
          </span>
          {props.onRollbackCheckpoint && support.checkpoint?.status === "ready" ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                props.onRollbackCheckpoint?.({
                  checkpointId: item.checkpointId,
                  scopeId: item.scopeId,
                })
              }
            >
              <RotateCcwIcon className="size-3" />
              Roll back
            </Button>
          ) : null}
        </div>
      ) : null}

      {item.type === "fork" ? (
        <Button size="xs" variant="outline" onClick={() => props.onOpenThread(item.targetThreadId)}>
          <GitBranchIcon className="size-3" />
          Open fork
        </Button>
      ) : null}

      {item.type === "subagent" && item.childThreadId !== null ? (
        <Button size="xs" variant="outline" onClick={() => props.onOpenThread(item.childThreadId!)}>
          Open subagent thread
        </Button>
      ) : null}

      {item.type === "handoff" ? (
        <div className="space-y-1 text-muted-foreground">
          <p>
            {item.fromProviderInstanceIds.join(", ")} → {item.toProviderInstanceId}
          </p>
          <p>
            {item.strategy.replaceAll("_", " ")} · {support.contextHandoff?.status ?? item.status}
          </p>
          {support.contextTransfer ? (
            <p>
              Transfer {support.contextTransfer.type.replaceAll("_", " ")} ·{" "}
              {support.contextTransfer.status}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
