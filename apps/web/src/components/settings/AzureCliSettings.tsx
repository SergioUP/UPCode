import type { EnvironmentId } from "@t3tools/contracts";
import { CircleCheckIcon, CircleXIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";

import { azureDevOps } from "../../state/azureDevOps";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

function StatusLine({
  ok,
  label,
  detail,
}: {
  readonly ok: boolean;
  readonly label: string;
  readonly detail?: string;
}) {
  const Icon = ok ? CircleCheckIcon : CircleXIcon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className={ok ? "size-3.5 text-success" : "size-3.5 text-warning"} />
      {label}
      {detail ? <span className="text-foreground/80">{detail}</span> : null}
    </span>
  );
}

export function AzureCliSettings({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const status = useEnvironmentQuery(azureDevOps.azCliStatus({ environmentId, input: {} }));
  const open = useAtomCommand(azureDevOps.azCliOpen);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const data = status.data;

  const handleOpen = async () => {
    setBusy(true);
    setNotice(null);
    const result = await open({ environmentId, input: {} });
    setBusy(false);
    if (result._tag === "Success" && result.value.opened) {
      setNotice(
        "Se ha abierto la ventana de Azure CLI. Inicia sesión en el navegador (solo elegir cuenta) y pulsa Comprobar.",
      );
      setTimeout(() => status.refresh(), 15_000);
    } else {
      setNotice(
        "No se pudo abrir Azure CLI. Instálalo en el servidor (https://aka.ms/installazurecliwindows) e inténtalo de nuevo.",
      );
    }
  };

  return (
    <div className="grid gap-3 px-3 py-4 sm:px-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <TerminalIcon className="size-4 text-primary" />
          <span className="text-sm font-medium">Azure CLI</span>
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Los repositorios y pull requests del proveedor usan Azure CLI. Este botón comprueba si
          está instalado y abre el login: solo tendrás que elegir la cuenta en el navegador.
        </p>
      </div>
      {status.error ? (
        <p className="text-xs text-destructive">{status.error}</p>
      ) : data ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <StatusLine ok={data.installed} label="az instalado" />
          <StatusLine ok={data.devopsExtension} label="extensión azure-devops" />
          <StatusLine
            ok={data.account !== null}
            label="sesión"
            {...(data.account !== null ? { detail: data.account } : {})}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Comprobando Azure CLI…</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleOpen()}>
          <TerminalIcon /> Configurar Azure CLI
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={status.isPending}
          onClick={() => status.refresh()}
        >
          Comprobar de nuevo
        </Button>
        {notice ? <p className="text-xs text-primary">{notice}</p> : null}
      </div>
    </div>
  );
}
