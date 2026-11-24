const fs = require("node:fs");
const path = require("node:path");

const RELEASE_URL = "https://github.com/Sanz2610/luma/releases/latest";
class Updates {
  constructor({
    updater,
    version,
    mode,
    dataDir,
    notify = () => {},
    log = () => {},
    openExternal,
    beforeInstall = async () => {},
  }) {
    this.updater = updater;
    this.notify = notify;
    this.log = log;
    this.openExternal = openExternal;
    this.beforeInstall = beforeInstall;
    this.file = path.join(dataDir, "updates.json");
    let automatic = true;
    try {
      automatic =
        JSON.parse(fs.readFileSync(this.file, "utf8")).automatic !== false;
    } catch {}
    this.state = {
      version,
      mode,
      automatic,
      status: mode === "development" ? "disabled" : "idle",
      nextVersion: "",
      percent: 0,
      checkedAt: "",
      message: "",
    };
    if (!updater) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: (value) =>
        log("updater-error", { message: String(value).slice(0, 1000) }),
    };
    updater.on("checking-for-update", () =>
      this.set({ status: "checking", message: "" }),
    );
    updater.on("update-available", (info) =>
      this.set({ status: "available", nextVersion: info.version, percent: 0 }),
    );
    updater.on("update-not-available", () =>
      this.set({
        status: "current",
        nextVersion: "",
        message: "",
        checkedAt: new Date().toISOString(),
      }),
    );
    updater.on("download-progress", (progress) =>
      this.set({
        status: "downloading",
        percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
      }),
    );
    updater.on("update-downloaded", (info) =>
      this.set({
        status: "ready",
        nextVersion: info.version,
        percent: 100,
        message: "",
      }),
    );
    updater.on("error", (error) => this.fail(error));
  }
  snapshot() {
    return { ...this.state };
  }
  set(value) {
    Object.assign(this.state, value);
    this.notify(this.snapshot());
  }
  fail(error) {
    this.log("update-failed", {
      message: String(error?.message || error).slice(0, 1000),
    });
    this.set({
      status: "error",
      message:
        "Could not complete the update. Check your connection and try again.",
    });
  }
  setAutomatic(value) {
    if (typeof value !== "boolean")
      throw new Error("Invalid update preference.");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify({ automatic: value }));
    fs.renameSync(this.file + ".tmp", this.file);
    this.set({ automatic: value });
    return this.snapshot();
  }
  start() {
    if (!this.updater) return;
    const check = () => {
      if (this.state.automatic) this.check().catch(() => {});
    };
    this.initialTimer = setTimeout(check, 15000);
    this.initialTimer.unref();
    this.interval = setInterval(check, 6 * 60 * 60 * 1000);
    this.interval.unref();
  }
  async check() {
    if (
      !this.updater ||
      ["ready", "downloading", "installing"].includes(this.state.status)
    )
      return this.snapshot();
    if (this.checking) return this.checking;
    this.checking = (async () => {
      try {
        await this.updater.checkForUpdates();
        this.set({ checkedAt: new Date().toISOString() });
        if (
          this.state.status === "available" &&
          this.state.mode === "installed" &&
          this.state.automatic
        )
          await this.download();
      } catch (error) {
        this.fail(error);
      }
      return this.snapshot();
    })();
    try {
      return await this.checking;
    } finally {
      this.checking = null;
    }
  }
  async download() {
    if (this.state.mode !== "installed" || !this.updater)
      throw new Error("Use the portable download on the Releases page.");
    if (this.downloading) return this.downloading;
    if (
      !["available", "error"].includes(this.state.status) ||
      !this.state.nextVersion
    )
      return this.snapshot();
    this.set({ status: "downloading", percent: 0, message: "" });
    this.downloading = (async () => {
      try {
        await this.updater.downloadUpdate();
      } catch (error) {
        this.fail(error);
      }
      return this.snapshot();
    })();
    try {
      return await this.downloading;
    } finally {
      this.downloading = null;
    }
  }
  async install() {
    if (this.installing) return this.snapshot();
    if (this.state.mode !== "installed" || this.state.status !== "ready")
      throw new Error("No update is ready to install.");
    this.installing = true;
    try {
      await this.beforeInstall();
    } catch (error) {
      this.installing = false;
      throw error;
    }
    this.set({ status: "installing", message: "" });
    setImmediate(() => {
      try {
        this.updater.quitAndInstall(false, true);
      } catch (error) {
        this.installing = false;
        this.fail(error);
      }
    });
    return this.snapshot();
  }
  async openRelease() {
    await this.openExternal(RELEASE_URL);
  }
  dispose() {
    clearTimeout(this.initialTimer);
    clearInterval(this.interval);
  }
}
module.exports = { Updates, RELEASE_URL };
