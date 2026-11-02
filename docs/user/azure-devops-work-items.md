# Azure DevOps work items for agents

An agent running inside a UPCode thread can read your Azure DevOps work items and link one to the
thread it is working in. It uses the same organization and PAT as **Settings → Source control**;
nothing extra to configure.

This is what turns "link task 7766 to this thread" — or just "the task I'm on" — into something the
agent can do itself instead of replying that it has no such tool.

## The tools

| Tool                         | Reads/writes | What it does                                                                                                                        |
| ---------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `azure_devops_my_work_items` | reads        | The work items assigned to you, newest first, open ones only by default. Use it to resolve "my current task" without pasting an id. |
| `azure_devops_work_item`     | reads        | One work item: title, type, state, sprint, area, assignee, url and a plain-text excerpt of the description.                         |
| `azure_devops_link_thread`   | writes       | Links the current thread to a work item, which is what the thread header shows.                                                     |
| `azure_devops_unlink_thread` | writes       | Removes that link.                                                                                                                  |

Linking changes **only UPCode**: the task is not modified in Azure DevOps — no state change, no
comment, no field. The link lives in the app's own settings, the same place the Work item row in the
thread panel writes to.

## What each tool promises

- **Open items only**, by default. `Closed`, `Done`, `Removed`, `Completed` and `Cancelled` are
  filtered out on the server, so a finished-but-assigned task does not appear as "current".
- **Newest first**, 25 items by default. `limit` and `activeOnly` are there when the agent needs more.
- **No guessing.** The tool description tells the agent that several active items must be listed and
  the user asked which one, rather than picking one silently.
- **The project is resolved, not invented.** It comes from your own assignments; for a work item
  assigned to someone else the agent has to pass `project` explicitly.
- **A failure is a sentence, not a stack trace.** No PAT, wrong permissions, rate limit: the tool
  returns an error the agent can repeat, and it never reads anything it was not asked for.

## Which tools an agent has

Tools are negotiated when a provider session starts, so **a thread opened before the tools existed
will not see them**. Open a new thread (or restart the thread's session) after updating or restarting
the server.

The agent also needs the `azure-devops` capability; the server grants it to threads it launches. A
credential without it gets `capability_denied` instead of a silent no-op.
