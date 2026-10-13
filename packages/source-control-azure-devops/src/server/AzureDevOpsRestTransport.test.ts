import { describe, expect, it } from "@effect/vitest";
import { parseAzureRemote } from "./AzureDevOpsRestTransport.ts";

describe("Azure DevOps remote resolution for PAT REST calls", () => {
  it("reads an HTTPS remote with encoded project and repository names", () => {
    expect(
      parseAzureRemote(
        "https://dev.azure.com/upango/UPG%20-%20Portal%20Empleado/_git/Portal%20Web",
      ),
    ).toEqual({
      organization: "upango",
      project: "UPG - Portal Empleado",
      repository: "Portal Web",
    });
  });

  it("reads an SSH remote without requiring Azure CLI", () => {
    expect(parseAzureRemote("git@ssh.dev.azure.com:v3/upango/Shopify/Integrator.git")).toEqual({
      organization: "upango",
      project: "Shopify",
      repository: "Integrator",
    });
  });

  it("rejects non Azure remotes", () => {
    expect(parseAzureRemote("https://github.com/SergioUP/UPCode.git")).toBeNull();
  });
});
