const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  Menu,
  utilityProcess,
  screen,
  clipboard,
} = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { ThumbnailService } = require("./thumbnail-service.cjs");
const { LensSearch } = require("./lens.cjs");
const { WindowStates } = require("./window-state.cjs");
const { Updates } = require("./updates.cjs");
const { sendToWindow } = require("./window-message.cjs");
const { projectLink, donationAccount } = require("./project-links.cjs");
const crypto = require("node:crypto");
const { Library, cleanUrl } = require("./library.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "luma-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
app.setName("Luma");
const customProfile = app.commandLine.getSwitchValue("user-data-dir");
if (customProfile) {
  const profilePath = path.resolve(customProfile);
  fsSync.mkdirSync(profilePath, { recursive: true });
  app.setPath("userData", profilePath);
}
// Integration tests use a disposable profile; normal runs always use the Windows user profile.
if (!app.isPackaged && process.env.LUMA_TEST_PROFILE)
  app.setPath("userData", process.env.LUMA_TEST_PROFILE);
let window,
  viewerWindow,
  viewerIds = [],
  viewerIndex = 0,
  library,
  watcher,
  watchTimer,
  cacheDir,
  deleting = false;
let thumbnailService,
  lensSearch,
  windowStates,
  updates,
  shuttingDown = false;
function logDiagnostic(event, details = {}) {
  const record =
    JSON.stringify({ time: new Date().toISOString(), event, ...details }) +
    "\n";
  const file = path.join(app.getPath("userData"), "diagnostics.log");
  try {
    if (fsSync.existsSync(file) && fsSync.statSync(file).size > 256 * 1024)
      fsSync.renameSync(file, file + ".previous");
    fsSync.appendFileSync(file, record);
  } catch {}
}
const notify = (value) => {
  sendToWindow(window, "library:changed", value);
};
async function refresh(changes) {
  const snapshot = await library.refresh(changes);
  synchronizeViewer();
  notify(snapshot);
  return snapshot;
}
function startWatcher() {
  watcher?.close();
  watcher = null;
  clearTimeout(watchTimer);
  if (!library.settings.root) return;
  const changes = new Set();
  try {
    watcher = fsSync.watch(
      library.settings.root,
      { recursive: true },
      (_type, file) => {
        if (deleting || !file) return;
        changes.add(String(file));
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
          const paths = [...changes];
          changes.clear();
          refresh(paths).catch(() => {});
        }, 350);
      },
    );
    watcher.on("error", () => {
      watcher?.close();
      watcher = null;
    });
  } catch {}
}
async function cacheEntries() {
  const result = [];
  for (const entry of await fs.readdir(cacheDir, { withFileTypes: true })) {
    if (
      !entry.isFile() ||
      !/^[a-f0-9]{64}(?:-(?:192|320|512|1024|1536|4096|info))?\.(webp|png|json)$/.test(
        entry.name,
      )
    )
      continue;
    const file = path.join(cacheDir, entry.name);
    try {
      const stat = await fs.stat(file);
      result.push({ file, bytes: stat.size, modified: stat.mtimeMs });
    } catch {}
  }
  return result;
}
async function trimCache() {
  const entries = (await cacheEntries()).sort(
    (a, b) => a.modified - b.modified,
  );
  let total = entries.reduce((sum, e) => sum + e.bytes, 0);
  for (const entry of entries) {
    if (total <= 1024 * 1024 * 1024) break;
    await fs.unlink(entry.file).catch(() => {});
    total -= entry.bytes;
  }
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (
      ![window, viewerWindow].some(
        (target) =>
          target &&
          !target.isDestroyed() &&
          event.sender === target.webContents &&
          event.senderFrame === target.webContents.mainFrame,
      )
    )
      throw new Error("Invalid request.");
    try {
      const previous = ipcCaller;
      ipcCaller = BrowserWindow.fromWebContents(event.sender);
      let result;
      try {
        result = fn(...args);
      } finally {
        ipcCaller = previous;
      }
      return await result;
    } catch (error) {
      throw new Error(
        error.message ||
          "The operation could not be completed. Please try again.",
      );
    }
  });
}
let ipcCaller;
function viewerSnapshot() {
  const item = library.files.get(viewerIds[viewerIndex]);
  if (!item) return null;
  const { filePath, version, ...image } = item;
  return {
    image,
    position: viewerIndex + 1,
    count: viewerIds.length,
    confirmDelete: library.settings.confirmDelete,
  };
}
function synchronizeViewer() {
  if (!viewerWindow || viewerWindow.isDestroyed()) return;
  const current = viewerIds[viewerIndex];
  const following = viewerIds.slice(viewerIndex + 1);
  viewerIds = viewerIds.filter((id) => library.files.has(id));
  if (!viewerIds.length) {
    viewerWindow.close();
    return;
  }
  const next = viewerIds.includes(current)
    ? current
    : following.find((id) => library.files.has(id)) || viewerIds.at(-1);
  viewerIndex = viewerIds.indexOf(next);
  sendToWindow(viewerWindow, "viewer:changed", viewerSnapshot());
}
function configureWindow(target) {
  target.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  target.webContents.on("will-navigate", (event) => event.preventDefault());
  target.webContents.on("render-process-gone", (_event, details) =>
    logDiagnostic("renderer-gone", {
      window: target === window ? "library" : "viewer",
      reason: details.reason,
      exitCode: details.exitCode,
    }),
  );
  target.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  target.webContents.session.setPermissionCheckHandler(() => false);
}
async function openViewer(id, ids) {
  if (!Array.isArray(ids) || ids.length > 100000 || !ids.includes(id))
    throw new Error("Invalid image list.");
  await library.resolveFile(id);
  viewerIds = [
    ...new Set(
      ids.filter((item) => typeof item === "string" && library.files.has(item)),
    ),
  ];
  viewerIndex = viewerIds.indexOf(id);
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    sendToWindow(viewerWindow, "viewer:changed", viewerSnapshot());
    if (viewerWindow.isMinimized()) viewerWindow.restore();
    viewerWindow.show();
    viewerWindow.focus();
    return;
  }
  const target = new BrowserWindow({
    ...windowStates.options("viewer"),
    frame: false,
    show: false,
    backgroundColor: "#08090b",
    title: "Luma — Viewer",
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: process.env.LUMA_TEST_HEADLESS !== "1",
    },
  });
  viewerWindow = target;
  configureWindow(target);
  windowStates.attach(target, "viewer", process.env.LUMA_TEST_HEADLESS === "1");
  target.on("closed", () => {
    if (viewerWindow === target) {
      viewerWindow = null;
      viewerIds = [];
      viewerIndex = 0;
    }
  });
  try {
    await target.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { viewer: "1" },
    });
  } catch (error) {
    if (!target.isDestroyed() && !shuttingDown) throw error;
  }
}
function installHandlers() {
  handle("image:info", async (id) => {
    const item = await library.resolveFile(id);
    let metadata = {};
    try {
      const result = await thumbnailService.request(
        item,
        crypto.randomUUID(),
        "info",
      );
      metadata = JSON.parse(Buffer.from(result.data).toString("utf8"));
    } catch {}
    const stat = await fs.stat(item.filePath);
    return {
      ...metadata,
      name: item.name,
      format: item.format || path.extname(item.filePath).slice(1).toUpperCase(),
      filePath: item.filePath,
      size: stat.size,
      created: stat.birthtimeMs,
      modified: stat.mtimeMs,
    };
  });
  handle("project:copy-donation", (key) =>
    clipboard.writeText(donationAccount(key)),
  );
  handle("project:open", (key) => shell.openExternal(projectLink(key)));
  handle("updates:get", () => updates.snapshot());
  handle("updates:check", () => updates.check());
  handle("updates:download", () => updates.download());
  handle("updates:automatic", (value) => updates.setAutomatic(value));
  handle("updates:open", () => updates.openRelease());
  handle("updates:install", () => updates.install());
  handle("library:close", async () => {
    if (deleting)
      throw new Error("Please wait for the delete operation to finish.");
    watcher?.close();
    watcher = null;
    clearTimeout(watchTimer);
    viewerWindow?.close();
    lensSearch?.close();
    await thumbnailService.clear();
    const value = await library.closeLibrary();
    notify(value);
    return value;
  });
  handle("folder:rename", async (id, name) => {
    const value = await library.setTabName(id, name);
    notify(value);
    return value;
  });
  handle("viewer:lens", async (id) => {
    const item = await library.resolveFile(id);
    const preview = await thumbnailService.request(
      item,
      crypto.randomUUID(),
      1536,
    );
    await lensSearch.open(preview.data);
  });
  handle("viewer:open", (id, ids) => openViewer(id, ids));
  handle("viewer:get", () => viewerSnapshot());
  handle("viewer:navigate", (delta) => {
    if (![-1, 1].includes(delta) || !viewerIds.length) return;
    viewerIds = viewerIds.filter((id) => library.files.has(id));
    if (!viewerIds.length) {
      viewerWindow?.close();
      return;
    }
    viewerIndex = (viewerIndex + delta + viewerIds.length) % viewerIds.length;
    sendToWindow(viewerWindow, "viewer:changed", viewerSnapshot());
  });
  handle("thumbnail:load", async (id, token, edge) => {
    if (
      typeof token !== "string" ||
      !/^[a-f0-9-]{36}$/.test(token) ||
      ![192, 320, 512, 1024, 1536].includes(edge)
    )
      throw new Error("Invalid thumbnail request.");
    const item = await library.resolveFile(id);
    try {
      return await thumbnailService.request(item, token, edge);
    } catch (error) {
      return {
        cancelled: error.code === "CANCELLED",
        error: error.code === "CANCELLED" ? "" : error.message,
      };
    }
  });
  ipcMain.on("thumbnail:cancel", (event, token) => {
    if (
      [window, viewerWindow].some(
        (target) =>
          target &&
          !target.isDestroyed() &&
          event.sender === target.webContents,
      ) &&
      typeof token === "string" &&
      /^[a-f0-9-]{36}$/.test(token)
    )
      thumbnailService.cancel(token);
  });

  handle("library:get", () => library.snapshot());
  handle("library:refresh", async () => {
    const result = await refresh();
    startWatcher();
    return result;
  });
  handle("library:choose", async () => {
    if (deleting)
      throw new Error("Please wait for the delete operation to finish.");
    const result = await dialog.showOpenDialog(window, {
      title: "Choose your photo folder",
      properties: ["openDirectory"],
      defaultPath: library.settings.root || app.getPath("pictures"),
    });
    if (result.canceled || !result.filePaths[0]) return null;
    watcher?.close();
    watcher = null;
    clearTimeout(watchTimer);
    let snapshot;
    try {
      snapshot = await library.setRoot(result.filePaths[0]);
    } finally {
      startWatcher();
    }
    synchronizeViewer();
    notify(snapshot);
    return snapshot;
  });
  handle("settings:save", async (value) => {
    const result = await library.setPreferences(value);
    sendToWindow(viewerWindow, "preferences:changed", {
      confirmDelete: result.confirmDelete,
    });
    return result;
  });
  handle("folder:hidden", async (id, hidden) => {
    if (deleting)
      throw new Error("Please wait for the delete operation to finish.");
    const result = await library.setFolderHidden(id, hidden);
    synchronizeViewer();
    notify(result);
    return result;
  });
  handle("tabs:order", (ids) => library.setTabOrder(ids));
  handle("folder:link", async (id, url) => {
    return library.setLink(id, url);
  });
  handle("folder:open", async (id) => {
    const folder = library.folders.find((item) => item.id === id);
    const url = folder && library.settings.links[folder.path];
    if (!url) throw new Error("This folder does not have a link yet.");
    await shell.openExternal(cleanUrl(url));
  });
  handle("image:reveal", async (id) => {
    const item = await library.resolveFile(id);
    shell.showItemInFolder(item.filePath);
  });
  handle("images:trash", async (ids) => {
    if (updates.installing)
      throw new Error(
        "An update is starting. Reopen Luma before organizing photos.",
      );
    if (deleting) throw new Error("Another delete operation is in progress.");
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100000 ||
      ids.some((id) => typeof id !== "string")
    )
      throw new Error("Invalid image selection.");
    const unique = [...new Set(ids)];
    const deleted = [];
    const failed = [];
    deleting = true;
    clearTimeout(watchTimer);
    try {
      for (let index = 0; index < unique.length; index++) {
        const id = unique[index];
        try {
          const item = await library.resolveFile(id, true);
          // Let any in-flight decoder release its input handle before asking Windows to recycle.
          await thumbnailService.waitForImage(id);
          await shell.trashItem(item.filePath);
          deleted.push(id);
        } catch (error) {
          failed.push({
            id,
            name: library.files.get(id)?.name || "Image",
            reason: error.message,
          });
        }
        if (!window.isDestroyed())
          sendToWindow(window, "delete:progress", {
            done: index + 1,
            total: unique.length,
          });
      }
      return { deleted, failed, library: await refresh() };
    } finally {
      deleting = false;
    }
  });
  handle("cache:info", async () =>
    (await cacheEntries()).reduce((sum, e) => sum + e.bytes, 0),
  );
  handle("cache:clear", async () => {
    await thumbnailService.clear();
    for (const entry of await cacheEntries())
      await fs.unlink(entry.file).catch(() => {});
    return 0;
  });
  handle("window:state", () => ({
    fullscreen: ipcCaller.isFullScreen(),
    maximized: ipcCaller.isMaximized(),
  }));
  handle("window:action", (action, value) => {
    const window = ipcCaller;
    if (action === "minimize") window.minimize();
    else if (action === "maximize")
      window.isMaximized() ? window.unmaximize() : window.maximize();
    else if (action === "fullscreen")
      window.setFullScreen(!window.isFullScreen());
    else if (action === "set-fullscreen" && typeof value === "boolean")
      window.setFullScreen(value);
    else if (action === "close") {
      if (window !== global.__lumaDiagnostics.libraryWindow || !deleting)
        window.close();
    }
    return {
      fullscreen: !window.isDestroyed() && window.isFullScreen(),
      maximized: !window.isDestroyed() && window.isMaximized(),
    };
  });
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      library = new Library(app.getPath("userData"));
      cacheDir = path.join(app.getPath("userData"), "thumbnails");
      await fs.mkdir(cacheDir, { recursive: true });
      await library.loadSettings();
      windowStates = new WindowStates(
        app.getPath("userData"),
        screen,
        logDiagnostic,
      );
      updates = new Updates({
        updater: app.isPackaged
          ? require("electron-updater").autoUpdater
          : null,
        version: app.getVersion(),
        mode: !app.isPackaged
          ? "development"
          : process.env.PORTABLE_EXECUTABLE_FILE
            ? "portable"
            : "installed",
        dataDir: app.getPath("userData"),
        openExternal: (url) => shell.openExternal(url),
        log: logDiagnostic,
        notify: (value) => {
          sendToWindow(window, "updates:changed", value);
        },
        beforeInstall: async () => {
          if (deleting)
            throw new Error(
              "Wait for the delete operation to finish before updating.",
            );
          await library.writeQueue;
          if (deleting || shuttingDown)
            throw new Error(
              "Luma is busy. Try again after the current operation.",
            );
          windowStates.flush();
        },
      });
      lensSearch = new LensSearch((url) => shell.openExternal(url));
      thumbnailService = new ThumbnailService({
        cacheDir,
        resolveFile: (id) => library.resolveFile(id),
        log: logDiagnostic,
        spawnWorker: () =>
          utilityProcess.fork(
            path.join(__dirname, "thumbnail-worker.cjs"),
            [],
            {
              serviceName: "Luma Thumbnail Decoder",
              stdio: "ignore",
              env: {
                ...process.env,
                UV_THREADPOOL_SIZE: "1",
                VIPS_CONCURRENCY: "1",
                MALLOC_ARENA_MAX: "2",
              },
            },
          ),
      });
      global.__lumaDiagnostics = {
        thumbnailService,
        lensSearch,
        nativeImageLoadedInMain: () =>
          Object.keys(require.cache).some((key) =>
            /[\\/]sharp[\\/]|sharp-win32-x64.*\.node/.test(key),
          ),
      };
      for (const entry of await fs.readdir(cacheDir))
        if (/^[a-f0-9]{64}.*\.tmp/.test(entry))
          await fs.unlink(path.join(cacheDir, entry)).catch(() => {});

      library.onPartial = notify;
      protocol.handle("luma-media", async (request) => {
        try {
          const url = new URL(request.url);
          if (!["thumb", "full", "preview"].includes(url.hostname))
            return new Response("Not found", { status: 404 });
          const item = await library.resolveFile(url.pathname.slice(1));
          if (url.hostname === "preview") {
            const result = await thumbnailService.request(
              item,
              crypto.randomUUID(),
              4096,
            );
            return new Response(result.data, {
              headers: {
                "Content-Type": "image/webp",
                "Cache-Control": "no-store",
              },
            });
          }
          if (url.hostname === "thumb") {
            // Legacy thumbnail URLs no longer decode originals on the main process.
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#202126"/></svg>',
              { headers: { "Content-Type": "image/svg+xml" } },
            );
          }
          // Stream with bounded buffers; do not duplicate a large original in main-process RAM.
          const types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".avif": "image/avif",
            ".bmp": "image/bmp",
          };
          const stream = fsSync.createReadStream(item.filePath, {
            highWaterMark: 256 * 1024,
          });
          return new Response(Readable.toWeb(stream), {
            headers: {
              "Content-Type":
                types[path.extname(item.filePath).toLowerCase()] ||
                "application/octet-stream",
              "Cache-Control": "no-store",
            },
          });
        } catch {
          return new Response("Image unavailable", { status: 404 });
        }
      });
      installHandlers();
      window = new BrowserWindow({
        ...windowStates.options("library"),
        backgroundColor: "#111214",
        title: "Luma",
        frame: false,
        show: false,
        icon: path.join(__dirname, "../build/icon.ico"),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          backgroundThrottling: process.env.LUMA_TEST_HEADLESS !== "1",
        },
      });
      global.__lumaDiagnostics.libraryWindow = window;
      configureWindow(window);
      windowStates.attach(
        window,
        "library",
        process.env.LUMA_TEST_HEADLESS === "1",
      );
      let closing = false;
      window.on("close", (event) => {
        if (deleting) {
          event.preventDefault();
          return;
        }
        if (!closing) {
          shuttingDown = true;
          event.preventDefault();
          library.writeQueue.finally(() => {
            closing = true;
            viewerWindow?.close();
            if (!window.isDestroyed()) window.close();
          });
        }
      });
      const indexing = refresh();
      await window.loadFile(path.join(__dirname, "../dist/index.html"));
      await indexing;
      updates.start();
      startWatcher();
      trimCache().catch(() => {});
      const trimInterval = setInterval(
        () => trimCache().catch(() => {}),
        10 * 60 * 1000,
      );
      trimInterval.unref();
    })
    .catch((error) => {
      if (shuttingDown || window?.isDestroyed()) return;
      logDiagnostic("startup-failed", { message: error.message });
      if (!process.env.LUMA_TEST_PROFILE)
        dialog.showErrorBox("Luma could not start", error.message);
      app.quit();
    });
  app.on("before-quit", () => {
    updates?.dispose();
    windowStates?.flush();
    lensSearch?.close();
    shuttingDown = true;
    thumbnailService?.dispose();
  });
  app.on("window-all-closed", () => {
    shuttingDown = true;
    thumbnailService?.dispose();
    clearTimeout(watchTimer);
    watcher?.close();
    app.quit();
  });
}
