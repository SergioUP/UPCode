"use client";

import { SETTINGS_SECRET_REDACTED, SshServer, type EnvironmentId } from "@upcode/contracts";
import { squashAtomCommandFailure } from "@upcode/client-runtime/state/runtime";
import {
  ArrowLeftIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  ServerIcon,
  Trash2Icon,
  VaultIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ssh } from "../../state/ssh";
import { cn } from "../../lib/utils";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";

/**
 * The Vault: the place the user keeps credentials the app and the agent act
 * with. SSH servers are the first section; a section is a list of settings plus
 * the door the credentials reach, never the credential itself in the UI.
 *
 * The page is a utility surface, not settings: a server added here is usable
 * from a thread immediately (once `agentAccess` allows it), so it has to be
 * reachable without walking through Settings every time.
 */

const AUTH_LABELS: Readonly<Record<SshServer["auth"], string>> = {
  agent: "ssh-agent / ssh config",
  "key-file": "Clave en fichero",
  "key-contents": "Clave pegada",
  password: "Contraseña",
};

const ACCESS_LABELS: Readonly<Record<SshServer["agentAccess"], string>> = {
  off: "Solo tú",
  "read-only": "Lectura para el agente",
  commands: "Comandos para el agente",
};

const ACCESS_DESCRIPTIONS: Readonly<Record<SshServer["agentAccess"], string>> = {
  off: "El agente no puede tocarlo. Sirve para probar la conexión desde aquí.",
  "read-only": "El agente puede listar carpetas, leer ficheros y ver logs. No ejecuta comandos.",
  commands:
    "El agente puede ejecutar comandos. Cada uno se le pide a él con nombre y queda en el hilo.",
};

const isSecretSaved = (value: string | undefined): boolean =>
  value !== undefined && value === SETTINGS_SECRET_REDACTED;

/** Compiled once: the editor validates on every keystroke. */
const decodeSshServer = Schema.decodeUnknownOption(SshServer);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);
}

function newServer(): SshServer {
  const suffix = Math.random().toString(36).slice(2, 6);
  return {
    id: `ssh-${suffix}`,
    label: "",
    host: "",
    username: "",
    auth: "agent",
    identityFile: "",
    password: "",
    privateKey: "",
    defaultDirectory: "",
    agentAccess: "off",
  };
}

/** Keeps the id stable across edits: the stored credential is keyed by it. */
function withStableId(server: SshServer, label: string): SshServer {
  if (slugify(label).length === 0) return server;
  const desired = slugify(label);
  return server.id.startsWith("ssh-") ? { ...server, id: `ssh-${desired}`.slice(0, 64) } : server;
}

export function VaultPage() {
  const environmentId = usePrimaryEnvironmentId();
  const navigateToMainApp = useNavigateToMainApp();

  return (
    <SidebarInset className="min-w-0">
      <WorkspacePageHeader>
        <Button variant="ghost" size="sm" onClick={navigateToMainApp}>
          <ArrowLeftIcon className="size-3.5" />
          Volver
        </Button>
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <VaultIcon className="size-4 text-icon-muted" />
          Baúl
        </h1>
        <span className="text-xs text-muted-foreground">
          credenciales que la app y el agente usan
        </span>
      </WorkspacePageHeader>

      <div className="flex h-[calc(100vh-var(--workspace-topbar-height))] min-h-0 min-w-0">
        <nav
          aria-label="Secciones del baúl"
          className="flex w-44 shrink-0 flex-col gap-1 border-r p-3"
        >
          <span className="px-2 pb-1 text-3xs uppercase tracking-wide text-muted-foreground">
            Secciones
          </span>
          <span
            aria-current="true"
            className="flex items-center gap-2 rounded bg-accent px-2 py-1.5 text-sm"
          >
            <ServerIcon className="size-3.5" />
            SSH
          </span>
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-gutter-both p-5">
          {environmentId === null ? (
            <p className="text-sm text-muted-foreground">
              Conecta este dispositivo a un entorno para ver sus servidores.
            </p>
          ) : (
            <VaultSshSection environmentId={environmentId} />
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

function VaultSshSection({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const servers = useEnvironmentSettings(environmentId, (settings) => settings.sshServers);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    reportFailure: false,
  });
  const testServer = useAtomCommand(ssh.testServer, { reportFailure: false });
  const [editing, setEditing] = useState<{
    readonly draft: SshServer;
    readonly isNew: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const test = async (server: SshServer) => {
    setTesting(server.id);
    try {
      const result = await testServer({ environmentId, input: { server: server.id } });
      if (result._tag === "Failure") {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: `${server.label}: no se pudo conectar`,
          description: error instanceof Error ? error.message : "La conexión falló.",
        });
        return;
      }
      toastManager.add({
        type: "success",
        title: `${server.label}: conexión correcta`,
        description: `${result.value.system ?? "sistema sin identificar"} · ${result.value.elapsedMs} ms`,
      });
    } finally {
      setTesting(null);
    }
  };

  const save = async (
    server: SshServer,
    options: { readonly remove?: boolean; readonly isNew?: boolean } = {},
  ) => {
    const remove = options.remove ?? false;
    setBusy(true);
    try {
      let saved = server;
      if (!remove && options.isNew === true && servers.some((entry) => entry.id === server.id)) {
        // Two servers may share a label; the id stays unique because the stored
        // credential is keyed by it.
        let suffix = 2;
        while (servers.some((entry) => entry.id === `${server.id}-${suffix}`)) suffix += 1;
        saved = { ...server, id: `${server.id}-${suffix}`.slice(0, 64) };
      }
      const next = remove
        ? servers.filter((entry) => entry.id !== server.id)
        : servers.some((entry) => entry.id === saved.id)
          ? servers.map((entry) => (entry.id === saved.id ? saved : entry))
          : [...servers, saved];
      const result = await updateSettings({
        environmentId,
        input: { patch: { sshServers: next } },
      });
      if (result._tag === "Failure") {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: remove ? "Servidor no eliminado" : "Servidor no guardado",
          description: error instanceof Error ? error.message : "El guardado falló.",
        });
        return;
      }
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Servidores SSH</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Guarda aquí la conexión y su credencial, una vez. Después, en un hilo, pídeselo por su
            nombre: «mira los logs de lotes-prod». La contraseña o la clave se quedan en el
            servidor, fuera de este fichero.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ draft: newServer(), isNew: true })}>
          <PlusIcon className="size-3.5" />
          Añadir
        </Button>
      </header>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <KeyRoundIcon className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm">Todavía no hay servidores guardados.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Añade uno con su host y su credencial; podrás probarlo antes de dar acceso al agente.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {servers.map((server) => (
            <li
              key={server.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <ServerIcon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{server.label}</span>
                  <Badge size="sm" variant={server.agentAccess === "off" ? "secondary" : "info"}>
                    {ACCESS_LABELS[server.agentAccess]}
                  </Badge>
                </div>
                <p className="truncate font-mono text-2xs text-muted-foreground">
                  {server.username.length > 0 ? `${server.username}@` : ""}
                  {server.host}
                  {server.port === undefined ? "" : `:${server.port}`} · {AUTH_LABELS[server.auth]}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing !== null}
                  onClick={() => void test(server)}
                >
                  {testing === server.id ? <Spinner size="xs" /> : null} Probar
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Editar ${server.label}`}
                  onClick={() => setEditing({ draft: server, isNew: false })}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Eliminar ${server.label}`}
                  onClick={() => void save(server, { remove: true })}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing === null ? null : (
        <SshServerEditor
          draft={editing.draft}
          isNew={editing.isNew}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(server) => void save(server, { isNew: editing.isNew })}
        />
      )}
    </div>
  );
}

function SshServerEditor({
  draft,
  isNew,
  busy,
  onClose,
  onSave,
}: {
  readonly draft: SshServer;
  readonly isNew: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSave: (server: SshServer) => void;
}) {
  const [server, setServer] = useState<SshServer>(draft);
  /** New secrets only: an untouched field keeps whatever the server stored. */
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [port, setPort] = useState(draft.port === undefined ? "" : String(draft.port));

  const decoded = useMemo(() => {
    const candidate: SshServer = {
      ...server,
      id: isNew ? withStableId(server, server.label).id : server.id,
      port: port.trim().length === 0 ? undefined : Number(port),
      password: password.length > 0 ? password : server.password,
      privateKey: privateKey.length > 0 ? privateKey : server.privateKey,
    };
    return decodeSshServer(candidate);
  }, [server, port, password, privateKey, isNew]);

  const valid = Option.isSome(decoded);
  const canSubmit =
    valid && !busy && server.label.trim().length > 0 && server.host.trim().length > 0;

  const passwordSaved = isSecretSaved(server.password);
  const keySaved = isSecretSaved(server.privateKey);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup
        showCloseButton={!busy}
        render={
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (Option.isSome(decoded)) onSave(decoded.value);
            }}
          />
        }
      >
        <DialogHeader>
          <DialogTitle>{isNew ? "Añadir servidor" : "Editar servidor"}</DialogTitle>
          <DialogDescription>
            El nombre es lo que dirás en el hilo. La credencial se guarda en el servidor y no vuelve
            a mostrarse.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <label className="block space-y-1.5 text-sm">
            <span>Nombre</span>
            <Input
              autoFocus
              required
              value={server.label}
              disabled={busy}
              onChange={(event) => setServer({ ...server, label: event.target.value })}
              placeholder="lotes-prod"
            />
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <label className="block space-y-1.5 text-sm">
              <span>Host</span>
              <Input
                required
                value={server.host}
                disabled={busy}
                onChange={(event) => setServer({ ...server, host: event.target.value })}
                placeholder="10.0.0.12 o un alias de ~/.ssh/config"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span>Puerto</span>
              <Input
                type="number"
                min={1}
                max={65535}
                value={port}
                disabled={busy}
                onChange={(event) => setPort(event.target.value)}
                placeholder="22"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-sm">
              <span>Usuario</span>
              <Input
                value={server.username}
                disabled={busy}
                onChange={(event) => setServer({ ...server, username: event.target.value })}
                placeholder="deploy"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span>Directorio de trabajo</span>
              <Input
                value={server.defaultDirectory}
                disabled={busy}
                onChange={(event) => setServer({ ...server, defaultDirectory: event.target.value })}
                placeholder="/var/www/app"
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span>Autenticación</span>
            <Select
              value={server.auth}
              items={AUTH_LABELS}
              onValueChange={(value) => {
                if (
                  value === "agent" ||
                  value === "key-file" ||
                  value === "key-contents" ||
                  value === "password"
                ) {
                  setServer({ ...server, auth: value });
                }
              }}
            >
              <SelectTrigger aria-label="Autenticación">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="agent">ssh-agent / ssh config</SelectItem>
                <SelectItem value="key-file">Clave en fichero</SelectItem>
                <SelectItem value="key-contents">Clave pegada</SelectItem>
                <SelectItem value="password">Contraseña</SelectItem>
              </SelectPopup>
            </Select>
          </label>

          {server.auth === "key-file" ? (
            <label className="block space-y-1.5 text-sm">
              <span>Fichero de clave</span>
              <Input
                value={server.identityFile}
                disabled={busy}
                onChange={(event) => setServer({ ...server, identityFile: event.target.value })}
                placeholder="~/.ssh/id_ed25519"
              />
            </label>
          ) : null}

          {server.auth === "password" ? (
            <label className="block space-y-1.5 text-sm">
              <span>Contraseña</span>
              <Input
                type="password"
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  passwordSaved ? "Guardada. Escribe para reemplazarla." : "Contraseña SSH"
                }
              />
            </label>
          ) : null}

          {server.auth === "key-contents" ? (
            <label className="block space-y-1.5 text-sm">
              <span>Clave privada</span>
              <Textarea
                value={privateKey}
                disabled={busy}
                rows={4}
                onChange={(event) => setPrivateKey(event.target.value)}
                placeholder={
                  keySaved
                    ? "Guardada. Pega otra para reemplazarla."
                    : "-----BEGIN OPENSSH PRIVATE KEY-----"
                }
              />
            </label>
          ) : null}

          <label className="block space-y-1.5 text-sm">
            <span>Acceso del agente</span>
            <Select
              value={server.agentAccess}
              items={ACCESS_LABELS}
              onValueChange={(value) => {
                if (value === "off" || value === "read-only" || value === "commands") {
                  setServer({ ...server, agentAccess: value });
                }
              }}
            >
              <SelectTrigger aria-label="Acceso del agente">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="off">Solo tú</SelectItem>
                <SelectItem value="read-only">Lectura para el agente</SelectItem>
                <SelectItem value="commands">Comandos para el agente</SelectItem>
              </SelectPopup>
            </Select>
            <span className={cn("block text-xs text-muted-foreground")}>
              {ACCESS_DESCRIPTIONS[server.agentAccess]}
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? <Spinner size="xs" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
