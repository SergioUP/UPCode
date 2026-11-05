import {
  UPCODE_PROJECT_FILE_NAME,
  type EnvironmentId,
  type UPCodeProjectFile,
  type UPCodeProjectFileScript,
} from "@upcode/contracts";
import { parseUPCodeProjectFile } from "@upcode/shared/upcodeProjectFile";
import { useMemo } from "react";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<UPCodeProjectFileScript> = [];

export interface UPCodeProjectFileState {
  /**
   * - `valid`: upcode.json exists and decoded.
   * - `invalid`: upcode.json exists but fails to decode (the server then ignores
   *   the whole file, including `iconPath` and every script).
   * - `missing`: no readable upcode.json at the workspace root.
   * - `loading`: the file query has not settled yet.
   */
  status: "loading" | "missing" | "invalid" | "valid";
  /** The decoded file when status is `valid`, null otherwise. */
  file: UPCodeProjectFile | null;
  scripts: ReadonlyArray<UPCodeProjectFileScript>;
}

/**
 * Decoded state of the project's checked-in `upcode.json`, including whether the
 * file exists but is broken — which the runtime otherwise swallows silently.
 */
export function useUPCodeProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): UPCodeProjectFileState {
  const query = useProjectFileQuery(environmentId, cwd ?? "", UPCODE_PROJECT_FILE_NAME, cwd !== null);
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  return useMemo(() => {
    if (contents === null) {
      return {
        status: isPending ? "loading" : "missing",
        file: null,
        scripts: NO_SCRIPTS,
      } as const;
    }
    const file = parseUPCodeProjectFile(contents);
    if (file === null) {
      return { status: "invalid", file: null, scripts: NO_SCRIPTS } as const;
    }
    return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS } as const;
  }, [contents, isPending]);
}

/**
 * Scripts declared in the project's checked-in `upcode.json`, offered in the
 * scripts menu for import. Missing, truncated, or invalid files resolve to
 * an empty list.
 */
export function useUPCodeProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<UPCodeProjectFileScript> {
  return useUPCodeProjectFileState(environmentId, cwd).scripts;
}
