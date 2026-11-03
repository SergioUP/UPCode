import { isElectron } from "../../env";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { SubagentsPage } from "./SubagentsPage";

/** Keeps the page itself environment-agnostic; the route resolves the server. */
export function SubagentsRoute() {
  const environmentId = usePrimaryEnvironmentId();

  if (environmentId === null) {
    return (
      <SidebarInset className="min-w-0">
        <WorkspacePageHeader electron={isElectron}>
          <h1 className="text-base font-semibold">Subagentes</h1>
        </WorkspacePageHeader>
        <main className="p-5">
          <p className="text-sm">Conecta un entorno para gestionar subagentes.</p>
        </main>
      </SidebarInset>
    );
  }

  return <SubagentsPage environmentId={environmentId} />;
}
