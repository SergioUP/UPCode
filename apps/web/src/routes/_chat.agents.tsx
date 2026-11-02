import { createFileRoute } from "@tanstack/react-router";

import { SubagentsRoute } from "../components/subagents/SubagentsRoute";

export const Route = createFileRoute("/_chat/agents")({
  component: SubagentsRoute,
});
