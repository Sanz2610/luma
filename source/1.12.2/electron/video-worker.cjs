const { EventEmitter } = require("node:events");
const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

// Reuse the bounded thumbnail queue with a sandboxed Chromium video decoder.
class VideoWorker extends EventEmitter {
  constructor(resolveFile) {
    super();
    this.pid = null;
    this.job = null;
    this.secret = crypto.randomUUID();
    const isolated = session.fromPartition("luma-video-previews");
    isolated.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    isolated.setPermissionCheckHandler(() => false);
    const allowedFiles = new Set(
      ["video-worker.html", "video-renderer.js"].map(
        (name) => pathToFileURL(path.join(__dirname, name)).href,
      ),
    );
    isolated.webRequest.onBeforeRequest((details, cb) =>
      cb({
        cancel:
          !allowedFiles.has(details.url) &&
          !/^luma-media:\/\/full\/[a-f0-9]{64}(?:\?|$)/.test(details.url),
      }),
    );
    this.window = new BrowserWindow({
      show: false,
      width: 32,
      height: 32,
      webPreferences: {
        session: isolated,
        preload: path.join(__dirname, "video-preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        webSecurity: true,
      },
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", (event) =>
      event.preventDefault(),
    );
    this.reply = async (event, result) => {
      if (
        !this.job ||
        !Number.isSafeInteger(result?.id) ||
        this.window.isDestroyed() ||
        event.sender !== this.window.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        result?.secret !== this.secret ||
        result.id !== this.job?.id
      )
        return;
      const job = this.job;
      this.job = null;
      try {
        if (result.error)
          throw new Error(
            `Video preview unavailable: ${String(result.error).slice(0, 160)}`,
          );
        if (
          !(result.width > 0 && result.height > 0) ||
          result.width * result.height > 64 * 1024 * 1024
        )
          throw new Error("Video dimensions exceed the preview limit.");
        if (["info", "dimensions"].includes(job.edge)) {
          await fs.writeFile(
            job.temp,
            JSON.stringify({
              width: result.width,
              height: result.height,
              duration: Number.isFinite(result.duration)
                ? result.duration
                : null,
            }),
          );
        } else {
          if (
            !(result.data instanceof Uint8Array) ||
            result.data.byteLength > 16 * 1024 * 1024
          )
            throw new Error("Invalid video preview buffer.");
          const bytes = Buffer.from(result.data || []);
          if (
            !bytes.length ||
            bytes.length > 16 * 1024 * 1024 ||
            bytes.toString("ascii", 0, 4) !== "RIFF"
          )
            throw new Error("Invalid video preview.");
          await fs.writeFile(job.temp, bytes);
        }
        await fs.rename(job.temp, job.destination);
        this.emit("message", { kind: "result", id: job.id, ok: true, rss: 0 });
      } catch (error) {
        await fs.rm(job.temp, { force: true }).catch(() => {});
        this.emit("message", {
          kind: "result",
          id: job.id,
          ok: false,
          error: error.message,
          rss: 0,
        });
      }
    };
    ipcMain.on("video:result", this.reply);
    this.window.webContents.on("render-process-gone", () => this.kill());
    this.window.on("closed", () => {
      clearInterval(this.monitor);
      ipcMain.removeListener("video:result", this.reply);
      this.emit("exit", 0);
    });
    (async () => {
      if (!(await isolated.protocol.isProtocolHandled("luma-media")))
        isolated.protocol.handle("luma-media", async (request) => {
          const url = new URL(request.url);
          if (url.hostname !== "full" || !/^\/[a-f0-9]{64}$/.test(url.pathname))
            return new Response(null, { status: 404 });
          try {
            return require("./media-stream.cjs").mediaStream(
              request,
              await resolveFile(url.pathname.slice(1)),
            );
          } catch {
            return new Response(null, { status: 404 });
          }
        });
      await this.window.loadFile(path.join(__dirname, "video-worker.html"));
      this.pid = this.window.webContents.getOSProcessId();
      this.monitor = setInterval(() => {
        const metrics = app
          .getAppMetrics()
          .find((item) => item.pid === this.pid);
        if ((metrics?.memory?.workingSetSize || 0) > 448 * 1024) this.kill();
      }, 500);
      this.monitor.unref();
      this.emit("message", { kind: "ready" });
    })().catch(() => this.kill());
  }
  postMessage(job) {
    this.job = job;
    this.window.webContents.send("video:decode", {
      id: job.id,
      secret: this.secret,
      source: `luma-media://full/${job.mediaId}`,
      edge: job.edge,
    });
  }
  kill() {
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
module.exports = { VideoWorker };
