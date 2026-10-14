import { DEFAULT_INCIDENT_PROMPT } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import { SettingsSection } from "./settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

/**
 * The system prompt handed to the agent inside an Incident Center conversation.
 * Editable here; the default lives in the contracts so the server and the UI
 * agree on what "restore default" means.
 */
export function IncidentSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? settings.incidentPrompt;
  const dirty = draft !== null && draft !== settings.incidentPrompt;

  return (
    <SettingsSection id="incidents" title="Incidents">
      <div className="grid gap-3 px-3 pt-2 pb-4 sm:px-4">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Prompt de sistema que recibe el agente dentro de una conversación de Incident Center. Le
          indica que guarde como evidencia todo lo que investigue (peticiones, credenciales usadas y
          datos recopilados). Se aplica a la siguiente interacción en esa conversación.
        </p>
        <textarea
          aria-label="Incident Center system prompt"
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          className="min-h-64 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              updateSettings({ incidentPrompt: value });
              setDraft(null);
            }}
          >
            Guardar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={value === DEFAULT_INCIDENT_PROMPT}
            onClick={() => {
              updateSettings({ incidentPrompt: DEFAULT_INCIDENT_PROMPT });
              setDraft(null);
            }}
          >
            Restaurar por defecto
          </Button>
          {dirty ? <span className="text-xs text-muted-foreground">Sin guardar</span> : null}
        </div>
      </div>
    </SettingsSection>
  );
}
