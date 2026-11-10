import { createFileRoute } from "@tanstack/react-router";
import { AzureReposPage } from "../components/azureRepos/AzureReposPage";

export const Route = createFileRoute("/_chat/azure-repos")({
  component: AzureReposPage,
});
