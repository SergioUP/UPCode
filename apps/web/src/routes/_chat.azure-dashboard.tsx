import { createFileRoute } from "@tanstack/react-router";

import { AzureDashboardPage } from "../components/azureDashboard/AzureDashboardPage";

export const Route = createFileRoute("/_chat/azure-dashboard")({
  component: AzureDashboardPage,
});
