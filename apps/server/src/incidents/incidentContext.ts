/**
 * Which conversations belong to an incident, kept in memory so the run path can
 * decide synchronously whether to inject the researcher prompt. The incident
 * store refreshes this on every read; the server warms it once at startup.
 *
 * This is deliberately a module value rather than a service: the run execution
 * path already depends on ServerSettings, and adding another required service
 * there ripples through every layer that composes it.
 */
let incidentThreadIds: ReadonlySet<string> = new Set();

export const setIncidentThreadIds = (threadIds: Iterable<string | null | undefined>): void => {
  const next = new Set<string>();
  for (const threadId of threadIds) if (threadId) next.add(threadId);
  incidentThreadIds = next;
};

export const isIncidentConversation = (threadId: string): boolean =>
  incidentThreadIds.has(threadId);
