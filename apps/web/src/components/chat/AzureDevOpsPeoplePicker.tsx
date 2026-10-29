import type { AzureDevOpsIdentity, EnvironmentId } from "@t3tools/contracts";
import { CheckIcon, SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { azureDevOps } from "../../state/azureDevOps";
import { useEnvironmentQuery } from "../../state/query";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";

/**
 * The Identity API refuses to look at one character, which is also the point where
 * the answer would be everybody in the organization, so the box waits for two.
 */
const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

/** The people already picked, each removable. */
export function AzureDevOpsPeopleChips({
  people,
  onRemove,
  disabled = false,
}: {
  people: ReadonlyArray<AzureDevOpsIdentity>;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <>
      {people.map((person) => (
        <span
          key={person.id}
          className="inline-flex max-w-40 items-center gap-1 rounded-full bg-muted py-0.5 ps-2 pe-0.5 text-2xs font-medium"
        >
          <span className="min-w-0 truncate">{person.displayName}</span>
          <Button
            type="button"
            size="icon-tiny"
            variant="ghost-muted"
            aria-label={`Quitar a ${person.displayName}`}
            disabled={disabled}
            onClick={() => onRemove(person.id)}
          >
            <XIcon aria-hidden />
          </Button>
        </span>
      ))}
    </>
  );
}

/**
 * Search-and-pick over the organization's identities. The caller owns the
 * selection: the create dialog collects it before the pull request exists, and the
 * thread panel applies each pick to the pull request as it happens.
 */
export function AzureDevOpsPeoplePicker({
  environmentId,
  label,
  selectedIds,
  disabled = false,
  onPick,
}: {
  environmentId: EnvironmentId;
  /** Accessible name of the trigger, which carries an icon and a short word. */
  label: string;
  selectedIds: ReadonlyArray<string>;
  disabled?: boolean;
  onPick: (person: AzureDevOpsIdentity) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Mounted closed: the list is read when somebody asks for it, not with the row.
  const candidates = useEnvironmentQuery(
    open && search.length >= MIN_SEARCH_LENGTH
      ? azureDevOps.reviewerCandidates({ environmentId, input: { query: search } })
      : null,
  );
  const results = candidates.data ?? [];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setSearch("");
        }
      }}
    >
      <PopoverTrigger
        render={<Button type="button" size="compact" variant="ghost-muted" />}
        aria-label={label}
        disabled={disabled}
      >
        <UserPlusIcon aria-hidden />
        {label}
      </PopoverTrigger>
      <PopoverPopup align="start" side="bottom" width="md">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            size="sm"
            aria-label="Buscar personas"
            placeholder="Nombre o correo"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </InputGroup>
        {search.length < MIN_SEARCH_LENGTH ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Escribe al menos dos letras para buscar en la organización.
          </p>
        ) : candidates.error !== null ? (
          <p className="mt-2 text-xs text-muted-foreground">{candidates.error}</p>
        ) : candidates.isPending && candidates.data === null ? (
          <p className="mt-2 text-xs text-muted-foreground">Buscando en Azure DevOps…</p>
        ) : results.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nadie coincide con «{search}» en la organización.
          </p>
        ) : (
          <ScrollArea className="mt-2 max-h-64">
            <ul className="flex flex-col gap-0.5">
              {results.map((person) => {
                const already = selectedIds.includes(person.id);
                return (
                  <li key={person.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="compact"
                      className="w-full justify-start"
                      disabled={already}
                      onClick={() => onPick(person)}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">
                        {person.displayName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {already ? "Elegida" : person.email}
                      </span>
                      {already ? <CheckIcon aria-hidden className="shrink-0" /> : null}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverPopup>
    </Popover>
  );
}
