import { useState } from "react";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";

import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { SettingsSearchTarget } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Toggle, ToggleGroup } from "../ui/toggle-group";

/**
 * Which tracker the tasks section talks to. Azure keeps the section exactly as
 * it was; Jira sends work items through its own REST client.
 */
export function TaskTrackerSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const [revealed, setRevealed] = useState(false);
  const provider = settings.trackerProvider;
  const jira = settings.jira;
  const tokenSaved = jira.apiToken.length > 0;
  const target = searchableSetting("task-tracker");

  const saveJira = (patch: Partial<typeof jira>) => {
    updateSettings({ jira: { ...jira, ...patch } });
  };

  return (
    <SettingsSearchTarget id={target.id} className="grid gap-4 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <span className="text-sm font-medium">{target.title}</span>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            De dónde salen las tareas de la sección DevOps. Azure es lo de siempre; Jira usa
            proyectos como espacios, las columnas de su board y transiciones al mover tarjetas.
          </p>
        </div>
        <ToggleGroup
          aria-label="Proveedor de tareas"
          variant="segmented"
          value={[provider]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === "azure" || next === "jira") updateSettings({ trackerProvider: next });
          }}
        >
          <Toggle value="azure">Azure DevOps</Toggle>
          <Toggle value="jira">Jira</Toggle>
        </ToggleGroup>
      </div>

      {provider === "jira" ? (
        <div className="grid gap-3 rounded-lg border border-border/60 p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="jira-site">Sitio</Label>
            <Input
              id="jira-site"
              placeholder="miempresa.atlassian.net"
              defaultValue={jira.site}
              onBlur={(event) => {
                const site = event.currentTarget.value.trim();
                if (site !== jira.site) saveJira({ site });
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="jira-email">Email de la cuenta</Label>
            <Input
              id="jira-email"
              type="email"
              placeholder="tu@empresa.com"
              defaultValue={jira.email}
              onBlur={(event) => {
                const email = event.currentTarget.value.trim();
                if (email !== jira.email) saveJira({ email });
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="jira-token">API token</Label>
            <Input
              id="jira-token"
              type={revealed ? "text" : "password"}
              placeholder={tokenSaved ? "Guardado. Escribe otro para reemplazarlo." : "ATATT..."}
              autoComplete="off"
              onFocus={() => setRevealed(true)}
              onBlur={(event) => {
                const apiToken = event.currentTarget.value.trim();
                setRevealed(false);
                if (apiToken.length > 0) {
                  saveJira({ apiToken });
                  event.currentTarget.value = "";
                }
              }}
            />
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {tokenSaved ? (
                <>
                  <CircleCheckIcon className="size-3.5 text-success" />
                  Token guardado en el almacén de secretos del servidor
                </>
              ) : (
                <>
                  <CircleXIcon className="size-3.5 text-warning" />
                  Sin token:{" "}
                  <a
                    className="underline underline-offset-2"
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    rel="noreferrer"
                    target="_blank"
                  >
                    créalo en Atlassian
                  </a>
                </>
              )}
            </span>
          </div>
        </div>
      ) : null}
    </SettingsSearchTarget>
  );
}
