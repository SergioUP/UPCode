import { createFileRoute } from "@tanstack/react-router";

import { VaultPage } from "../components/vault/VaultPage";

export const Route = createFileRoute("/_chat/vault")({
  component: VaultPage,
});
