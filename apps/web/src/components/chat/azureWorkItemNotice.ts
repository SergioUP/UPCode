const reasonOf = (error: unknown): string | undefined =>
  error && typeof error === "object" && "reason" in error
    ? String((error as { reason?: unknown }).reason)
    : undefined;

const messageOf = (error: unknown): string | undefined => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return undefined;
};

/**
 * Turns a work-item write failure into something the user can act on. Azure DevOps
 * answers 401 (not 403) when a PAT is valid but lacks the write scope, so that case
 * gets a concrete fix instead of a generic "no aceptó el cambio".
 */
export function azureWorkItemFailureNotice(error: unknown): string {
  const reason = reasonOf(error);
  if (reason === "authentication" || reason === "forbidden") {
    return "Azure DevOps rechazó la escritura: al token le falta permiso. Créalo con el scope «Work Items (read, write & manage)» y pégalo en Ajustes → Source control.";
  }
  return messageOf(error) ?? "Azure DevOps no aceptó el cambio.";
}
