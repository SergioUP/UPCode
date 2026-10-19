// @effect-diagnostics nodeBuiltinImport:off globalTimers:off -- A local CLI probe owns its own child process and hard timeout.
import * as Effect from "effect/Effect";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NodeChildProcess from "node:child_process";

type RunResult = { readonly code: number | null; readonly stdout: string; readonly stderr: string };

/** Runs `az` with fixed arguments and a hard timeout; never throws. */
const runAz = (args: string[], timeoutMs = 8_000): Effect.Effect<RunResult> =>
  Effect.promise(
    () =>
      new Promise<RunResult>((resolve) => {
        let settled = false;
        const done = (result: RunResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        let child: ReturnType<typeof NodeChildProcess.spawn>;
        try {
          child = NodeChildProcess.spawn("az", args, { shell: true, windowsHide: true });
        } catch {
          done({ code: -1, stdout: "", stderr: "spawn failed" });
          return;
        }
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          try {
            child.kill();
          } catch {
            // ignore
          }
          done({ code: null, stdout, stderr });
        }, timeoutMs);
        child.stdout?.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr?.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("error", () => {
          clearTimeout(timer);
          done({ code: -1, stdout, stderr });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          done({ code, stdout, stderr });
        });
      }),
  );

const LOGIN_SCRIPT = "az extension add --name azure-devops && az login --allow-no-subscriptions";

export const make = Effect.gen(function* () {
  const hostPlatform = yield* HostProcess.Platform;
  const status = () =>
    Effect.gen(function* () {
      const version = yield* runAz(["--version"]);
      if (version.code !== 0) {
        return { installed: false, devopsExtension: false, account: null };
      }
      const extension = yield* runAz(["extension", "show", "--name", "azure-devops", "-o", "none"]);
      const account = yield* runAz(["account", "show", "--query", "user.name", "-o", "tsv"]);
      return {
        installed: true,
        devopsExtension: extension.code === 0,
        account: account.code === 0 ? account.stdout.trim() || null : null,
      };
    });

  /**
   * Opens a visible terminal window that ensures the Azure DevOps extension and
   * runs `az login`; az opens the browser and the user only picks an account.
   */
  const open = () =>
    Effect.sync(() => {
      try {
        if (hostPlatform === "win32") {
          const child = NodeChildProcess.spawn(
            `start "UPCode - Azure CLI" cmd /k "${LOGIN_SCRIPT}"`,
            {
              shell: true,
              detached: true,
              stdio: "ignore",
              windowsHide: false,
            },
          );
          child.unref();
          return { opened: true };
        }
        const terminal =
          hostPlatform === "darwin"
            ? ["open", ["-a", "Terminal", "az", "login"]]
            : ["x-terminal-emulator", ["-e", "bash", "-lc", `${LOGIN_SCRIPT}; exec bash`]];
        const child = NodeChildProcess.spawn(terminal[0] as string, terminal[1] as string[], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        return { opened: true };
      } catch {
        return { opened: false };
      }
    });

  return { status, open };
});
