import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HostProcess from "@upcode/shared/HostProcess";
import { DesktopAgentBarState, type DesktopAgentBarEntry } from "@upcode/contracts";

import * as DesktopAssets from "../../app/DesktopAssets.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import { AGENT_BAR_OPEN_THREAD_CHANNEL, SET_AGENT_BAR_STATE_CHANNEL } from "../channels.ts";
import { AGENT_BAR_HEADER, AGENT_BAR_ROW, AGENT_BAR_WIDTH, agentBarPage } from "./agentBarPage.ts";

const openThreadPrefix = "https://agent-bar.invalid/";
const pageUrl = "data:text/html;charset=utf-8," + encodeURIComponent(agentBarPage);

function parsePosition(document: string): Electron.Point | null {
  const [x, y] = document.trim().split(",").map(Number);
  if (x !== undefined && y !== undefined && Number.isSafeInteger(x) && Number.isSafeInteger(y)) {
    return { x, y };
  }
  return null;
}

function logWarning(error: unknown) {
  Effect.runSync(Effect.logWarning("Could not update the agent bar", error));
}

export const installAgentBar = Effect.fn("desktop.ipc.installAgentBar")(function* () {
  if ((yield* HostProcess.Platform) !== "win32") return;
  const ipc = yield* DesktopIpc.DesktopIpc;
  const main = yield* ElectronWindow.ElectronWindow;
  const assets = yield* DesktopAssets.DesktopAssets;
  const files = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const icons = yield* assets.iconPaths;
  const trayIcon = Option.getOrElse(
    Option.orElse(icons.ico, () => icons.png),
    () => "",
  );
  const positionFile = path.join(Electron.app.getPath("userData"), "agent-bar-position");
  let position = parsePosition(
    yield* files.readFileString(positionFile).pipe(Effect.orElseSucceed(() => "")),
  );
  let pendingPositionWrite = Promise.resolve();
  let window: Electron.BaseWindow | null = null;
  let view: Electron.WebContentsView | null = null;
  let tray: Electron.Tray | null = null;
  let owner: Electron.BrowserWindow | null = null;
  let rows: ReadonlyArray<DesktopAgentBarEntry> = [];
  let ready = false;
  let alwaysOnTop = true;

  function layout() {
    if (!window || !view) return;
    const workArea = position
      ? Electron.screen.getDisplayNearestPoint(position).workArea
      : owner
        ? Electron.screen.getDisplayMatching(owner.getBounds()).workArea
        : Electron.screen.getPrimaryDisplay().workArea;
    const height = Math.min(
      workArea.height,
      AGENT_BAR_HEADER + AGENT_BAR_ROW * Math.max(1, Math.min(6, rows.length)),
    );
    const x = Math.min(
      Math.max(workArea.x, position?.x ?? workArea.x + workArea.width - AGENT_BAR_WIDTH - 12),
      workArea.x + workArea.width - AGENT_BAR_WIDTH,
    );
    const y = Math.min(
      Math.max(workArea.y, position?.y ?? workArea.y + 64),
      workArea.y + workArea.height - height,
    );
    const bounds = window.getBounds();
    if (
      bounds.x !== x ||
      bounds.y !== y ||
      bounds.width !== AGENT_BAR_WIDTH ||
      bounds.height !== height
    ) {
      window.setBounds({ x, y, width: AGENT_BAR_WIDTH, height });
    }
    if (view.getBounds().height !== height) {
      view.setBounds({ x: 0, y: 0, width: AGENT_BAR_WIDTH, height });
    }
  }

  function publish() {
    if (!ready || !view) return;
    void view.webContents
      .executeJavaScript("window.updateAgentBar(" + JSON.stringify(rows) + ")")
      .catch(logWarning);
  }

  function dispose() {
    window?.destroy();
    tray?.destroy();
    tray = null;
    owner?.removeListener("closed", dispose);
    owner = null;
    rows = [];
  }

  function updateTray() {
    tray?.setContextMenu(
      Electron.Menu.buildFromTemplate([
        {
          label: window?.isVisible() ? "Hide Agent Bar" : "Show Agent Bar",
          click: () => {
            if (!window) {
              void createWindow().catch(logWarning);
              return;
            }
            if (!ready) return;
            if (window.isVisible()) window.hide();
            else {
              layout();
              window.showInactive();
            }
            updateTray();
          },
        },
        {
          label: "Always on top",
          type: "checkbox",
          checked: alwaysOnTop,
          click: ({ checked }) => {
            alwaysOnTop = checked;
            window?.setAlwaysOnTop(checked);
          },
        },
      ]),
    );
  }

  async function createWindow() {
    const panel = new Electron.BaseWindow({
      width: AGENT_BAR_WIDTH,
      height: AGENT_BAR_HEADER + AGENT_BAR_ROW,
      title: "UPCode Agent Bar",
      frame: false,
      alwaysOnTop,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      show: false,
      backgroundColor: "#171b25",
    });
    const content = new Electron.WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    window = panel;
    view = content;
    panel.contentView.addChildView(content);
    panel.on("moved", () => {
      const [x, y] = panel.getPosition();
      if (x === undefined || y === undefined || (position?.x === x && position.y === y)) return;
      position = { x, y };
      pendingPositionWrite = pendingPositionWrite
        .then(() => Effect.runPromise(files.writeFileString(positionFile, `${x},${y}`)))
        .catch(logWarning);
    });
    panel.on("closed", () => {
      content.webContents.close();
      ready = false;
      window = null;
      view = null;
      updateTray();
    });
    content.webContents.on("will-navigate", (event) => event.preventDefault());
    content.webContents.setWindowOpenHandler(({ url }) => {
      if (owner && !owner.isDestroyed() && url.startsWith(openThreadPrefix)) {
        const row = rows.find(
          ({ environmentId, threadId }) =>
            url ===
            openThreadPrefix + encodeURIComponent(JSON.stringify([environmentId, threadId])),
        );
        if (row) {
          if (owner.isMinimized()) owner.restore();
          owner.show();
          owner.focus();
          owner.webContents.send(AGENT_BAR_OPEN_THREAD_CHANNEL, {
            environmentId: row.environmentId,
            threadId: row.threadId,
          });
        }
      }
      return { action: "deny" };
    });
    if (trayIcon && !tray) {
      try {
        tray = new Electron.Tray(trayIcon);
        tray.setToolTip("UPCode Agent Bar");
      } catch (error) {
        logWarning(error);
      }
    }
    layout();
    try {
      await content.webContents.loadURL(pageUrl);
    } catch (error) {
      if (window !== panel) return;
      dispose();
      throw error;
    }
    if (window !== panel) return;
    ready = true;
    publish();
    panel.showInactive();
    updateTray();
  }

  yield* ipc.handle(
    DesktopIpc.makeIpcMethod({
      channel: SET_AGENT_BAR_STATE_CHANNEL,
      payload: DesktopAgentBarState,
      result: Schema.Void,
      handler: (state, event) =>
        Effect.gen(function* () {
          const candidate = Option.getOrNull(yield* main.main);
          if (!candidate || candidate.webContents.id !== event?.sender.id) return;
          if (state === null) {
            dispose();
            return;
          }
          if (owner !== candidate) {
            dispose();
            owner = candidate;
            owner.once("closed", dispose);
          }
          rows = state;
          if (window) {
            layout();
            publish();
          } else {
            yield* Effect.tryPromise({
              try: createWindow,
              catch: (cause) => new Error("Could not open the agent bar", { cause }),
            });
          }
        }),
    }),
  );

  Electron.screen.on("display-removed", layout);
  Electron.screen.on("display-metrics-changed", layout);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      Electron.screen.removeListener("display-removed", layout);
      Electron.screen.removeListener("display-metrics-changed", layout);
      dispose();
    }),
  );
});
