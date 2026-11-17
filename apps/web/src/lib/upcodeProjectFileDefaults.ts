import { UPCODE_PROJECT_FILE_NAME, type EnvironmentId, type UPCodeProjectFile } from "@upcode/contracts";
import { parseUPCodeProjectFile } from "@upcode/shared/upcodeProjectFile";
import { executeAtomQuery } from "@upcode/client-runtime/state/runtime";

import {
  getProjectFileQueryAtom,
  resolveProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

/**
 * Read and decode the project's checked-in `upcode.json`.
 *
 * Imperative counterpart to `useUPCodeProjectFileState` for the new-thread path,
 * which resolves defaults at call time rather than render time. The file
 * query atom caches per (environment, cwd), so repeat calls don't re-fetch.
 * Optimistic in-app writes overlay the query result, matching what
 * `useProjectFileQuery` renders. Missing, truncated, or invalid files
 * resolve to null.
 */
export async function readUPCodeProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): Promise<UPCodeProjectFile | null> {
  const result = await executeAtomQuery(
    appAtomRegistry,
    getProjectFileQueryAtom(environmentId, workspaceRoot, UPCODE_PROJECT_FILE_NAME),
    { reportDefect: false, reportFailure: false },
  );
  const data = resolveProjectFileQueryData(
    environmentId,
    workspaceRoot,
    UPCODE_PROJECT_FILE_NAME,
    result._tag === "Success" ? result.value : null,
  );
  if (data === null || data.truncated) return null;
  return parseUPCodeProjectFile(data.contents);
}
