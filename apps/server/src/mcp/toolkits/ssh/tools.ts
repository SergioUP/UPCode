import {
  OrchestratorMcpFailure,
  SshCommandOutput,
  SshServerSummary,
  TrimmedNonEmptyString,
} from "@upcode/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";

import { SshServerService } from "../../../ssh/SshServerService.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  SshServerService,
];

const ServerName = TrimmedNonEmptyString.annotate({
  description:
    "The saved server's id or label, exactly as the user calls it (for example 'lotes-prod'). Call ssh_list_servers first when you do not know it.",
});

const Path = TrimmedNonEmptyString.annotate({
  description: "Absolute path on the remote server, for example /var/log/app/errores.log.",
});

const ListResult = Schema.Struct({
  servers: Schema.Array(SshServerSummary).annotate({
    description: "Every server saved in the Vault, with how much the user allowed for agents.",
  }),
});

const UPCODE = "UPCode (this desktop app)";

export const SshListServersTool = Tool.make("ssh_list_servers", {
  description: `Which SSH servers the user saved in the ${UPCODE} Vault.

Call it before any other ssh_* tool, and whenever the user names a server loosely ("el de lotes", "el de producción"). Matching is on the label and id only; never invent a hostname or guess which server is meant when two are plausible — list them and ask.

Each entry carries \`agentAccess\`: "off" means the user did not let agents touch it, "read-only" means logs and files but no commands, "commands" means ssh_run_command works too. A summary never contains a password or a key.`,
  parameters: Schema.Struct({
    onlyWithAgentAccess: Schema.optional(
      Schema.Boolean.annotate({
        description:
          "Default false. Set true to list only the servers an agent may actually use, which is the useful question when the user asks what it can reach.",
      }),
    ),
  }),
  success: ListResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode — saved SSH servers")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const SshTailTool = Tool.make("ssh_tail_file", {
  description: `Read the last lines of a log file on a saved server. This is what the user means by "mírame los logs": pass the server and the file, and answer with what the file says.

Needs \`agentAccess\` of at least "read-only". The output is capped and a \`truncated\` flag says when it was cut, so prefer a small \`lines\` and ask again with a bigger one only if the answer is not there.

It runs \`tail\` over SSH: it changes nothing on the server.`,
  parameters: Schema.Struct({
    server: ServerName,
    path: Path,
    lines: Schema.optional(
      Schema.Int.annotate({
        description: "How many trailing lines to read. Defaults to 200, maximum 2000.",
      }),
    ),
  }),
  success: SshCommandOutput,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode — tail a log on a server")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const SshReadFileTool = Tool.make("ssh_read_file", {
  description: `Read a file on a saved server over SSH.

Use it for configuration, a stack trace, a CSV, anything the user points at. Needs \`agentAccess\` of at least "read-only" and never writes: the file is read with \`cat\`.

The answer is capped at about 20000 characters and says \`truncated\` when it was; for a large or growing file prefer ssh_tail_file.`,
  parameters: Schema.Struct({
    server: ServerName,
    path: Path,
    lines: Schema.optional(
      Schema.Int.annotate({
        description:
          "Read only the last N lines instead of the whole file. Omit for the whole file.",
      }),
    ),
  }),
  success: SshCommandOutput,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode — read a file on a server")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const SshListDirectoryTool = Tool.make("ssh_list_directory", {
  description: `List a directory on a saved server over SSH (\`ls -la\`).

Use it to find where the logs or the deployment live before reading a file. Needs \`agentAccess\` of at least "read-only".`,
  parameters: Schema.Struct({
    server: ServerName,
    path: Path,
  }),
  success: SshCommandOutput,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode — list a directory on a server")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const SshRunTool = Tool.make("ssh_run_command", {
  description: `Run one non-interactive shell command on a saved server and return its output.

Needs \`agentAccess\` of "commands" on that server; with "read-only" or "off" the call is refused and says so. The command runs through \`sh -c\` with no terminal attached, so anything that waits for input (sudo asking for a password, an editor, a pager) will hang until the timeout: add flags that avoid it (\`-y\`, \`--no-pager\`) or do not run it.

Before running something that changes state — restarting a service, deleting a file, writing to a database — say what you are about to run and on which server, and prefer the read-only tools when they answer the question. Report the real exit result; never claim a command worked when the output says otherwise.

The output is capped at about 20000 characters and says \`truncated\` when it was.`,
  parameters: Schema.Struct({
    server: ServerName,
    command: TrimmedNonEmptyString.annotate({
      description: "The command line to run on the remote server.",
    }),
    timeoutMs: Schema.optional(
      Schema.Int.annotate({
        description: "How long to wait before giving up. Defaults to 30000.",
      }),
    ),
  }),
  success: SshCommandOutput,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode — run a command on a server")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

export const SshToolkit = Toolkit.make(
  SshListServersTool,
  SshTailTool,
  SshReadFileTool,
  SshListDirectoryTool,
  SshRunTool,
);
