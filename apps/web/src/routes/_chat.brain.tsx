import { createFileRoute } from "@tanstack/react-router";

import { BrainPage } from "../components/brain/BrainPage";

export const Route = createFileRoute("/_chat/brain")({
  component: BrainPage,
});
