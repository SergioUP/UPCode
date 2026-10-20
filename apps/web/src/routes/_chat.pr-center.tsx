import { createFileRoute } from "@tanstack/react-router";

import { PullRequestDashboard } from "../components/prCenter/PullRequestDashboard";

export const Route = createFileRoute("/_chat/pr-center")({
  component: PullRequestDashboard,
});
