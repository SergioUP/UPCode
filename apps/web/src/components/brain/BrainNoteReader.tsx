import type { EnvironmentId } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import { useMemo } from "react";

import ChatMarkdown from "~/components/ChatMarkdown";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { Spinner } from "../ui/spinner";
import { parseVaultNote } from "./brainVault";

/**
 * One note, read-only, the way Obsidian shows it: properties on top and the
 * markdown below. Nothing here writes: the vault belongs to the person.
 */
export function BrainNoteReader(props: {
  readonly environmentId: EnvironmentId | null;
  readonly vaultPath: string;
  readonly relativePath: string;
  readonly onClose: () => void;
}) {
  const file = useProjectFileQuery(
    props.environmentId ?? ("" as EnvironmentId),
    props.vaultPath,
    props.relativePath,
    props.environmentId !== null,
  );
  const note = useMemo(
    () => (file.data === null ? null : parseVaultNote(file.data.contents)),
    [file.data],
  );

  return (
    <section className="flex h-full w-[46%] min-w-80 max-w-3xl shrink-0 flex-col border-l border-white/10 bg-black/70 backdrop-blur">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-white/60">{props.relativePath}</span>
        <button
          type="button"
          aria-label="Cerrar la nota"
          className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
          onClick={props.onClose}
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      </header>
      <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto">
        {file.isPending ? (
          <div className="flex items-center gap-2 p-4 text-xs text-white/60">
            <Spinner aria-hidden size="sm" /> Leyendo la nota
          </div>
        ) : file.error !== null ? (
          <p className="p-4 text-xs text-error">{file.error}</p>
        ) : note === null ? null : (
          <div className="mx-auto max-w-3xl px-5 py-4">
            {note.properties.length > 0 ? (
              <dl className="mb-5 grid gap-1.5 border-b border-white/10 pb-4">
                <div className="mb-1 text-xs font-semibold text-white/80">Propiedades</div>
                {note.properties.map((property) => (
                  <div key={property.key} className="flex items-start gap-3 text-xs">
                    <dt className="w-28 shrink-0 text-white/45">{property.key}</dt>
                    <dd className="flex min-w-0 flex-wrap gap-1">
                      {property.values.map((value) => (
                        <span
                          key={value}
                          className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/80"
                        >
                          {value}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <ChatMarkdown
              text={note.body}
              cwd={props.vaultPath}
              imageBaseDir={props.vaultPath}
              className="text-sm"
            />
          </div>
        )}
      </div>
    </section>
  );
}
