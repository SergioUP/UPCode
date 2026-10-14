import { createFileRoute } from "@tanstack/react-router";

import { IncidentCenterPage } from "../components/incidents/IncidentCenterPage";

export const Route = createFileRoute("/_chat/incidents")({
  component: IncidentCenterPage,
});
