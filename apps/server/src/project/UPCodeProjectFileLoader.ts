/**
 * UPCodeProjectFileLoader - Effect service that loads the checked-in `upcode.json`
 * project file from a workspace root.
 *
 * Loading is best-effort: a missing file resolves to `Option.none`, and
 * unreadable or invalid files are logged and treated as absent so callers
 * can fall back to their defaults.
 *
 * @module UPCodeProjectFileLoader
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { UPCODE_PROJECT_FILE_NAME, type UPCodeProjectFile } from "@upcode/contracts";
import { UPCodeProjectFileFromJson } from "@upcode/shared/t3ProjectFile";

const decodeT3ProjectFileJson = Schema.decodeEffect(UPCodeProjectFileFromJson);

export class UPCodeProjectFileLoadError extends Schema.TaggedError<UPCodeProjectFileLoadError>()(
  "UPCodeProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${UPCODE_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

/** Service tag for upcode.json project file loading. */
export class UPCodeProjectFileLoader extends Context.Service<
  UPCodeProjectFileLoader,
  {
    /**
     * Load and decode `upcode.json` at the workspace root.
     *
     * Never fails: missing, unreadable, or invalid files resolve to
     * `Option.none` (invalid files are logged as warnings).
     */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<UPCodeProjectFile>>;
  }
>()("upcode/project/UPCodeProjectFileLoader") {}

const logT3ProjectFileLoadError = (error: UPCodeProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: UPCodeProjectFileLoader["Service"]["load"] = Effect.fn("UPCodeProjectFileLoader.load")(
    function* (workspaceRoot) {
      const filePath = path.join(workspaceRoot, UPCODE_PROJECT_FILE_NAME);
      const raw = yield* fileSystem.readFileString(filePath).pipe(
        Effect.asSome,
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(Option.none<string>())
              : logT3ProjectFileLoadError(
                  new UPCodeProjectFileLoadError({
                    operation: "read",
                    workspaceRoot,
                    filePath,
                    cause: error,
                  }),
                ).pipe(Effect.as(Option.none<string>())),
        }),
      );
      if (Option.isNone(raw)) {
        return Option.none<UPCodeProjectFile>();
      }
      return yield* decodeT3ProjectFileJson(raw.value).pipe(
        Effect.asSome,
        Effect.catchTags({
          SchemaError: (error) =>
            logT3ProjectFileLoadError(
              new UPCodeProjectFileLoadError({
                operation: "decode",
                workspaceRoot,
                filePath,
                cause: error,
              }),
            ).pipe(Effect.as(Option.none<UPCodeProjectFile>())),
        }),
      );
    },
  );

  return UPCodeProjectFileLoader.of({ load });
});

export const layer = Layer.effect(UPCodeProjectFileLoader, make);
