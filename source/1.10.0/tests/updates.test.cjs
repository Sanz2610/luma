const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Updates, RELEASE_URL } = require("../electron/updates.cjs");
class FakeUpdater extends EventEmitter {
  checks = 0;
  downloads = 0;
  installs = 0;
  async checkForUpdates() {
    this.checks++;
    this.emit("checking-for-update");
    await new Promise((resolve) => setImmediate(resolve));
    this.emit("update-available", { version: "9.0.0" });
  }
  async downloadUpdate() {
    this.downloads++;
    this.emit("download-progress", { percent: 45 });
    this.emit("update-downloaded", { version: "9.0.0" });
  }
  quitAndInstall() {
    this.installs++;
  }
}
const make = (dir, extra = {}) =>
  new Updates({
    updater: new FakeUpdater(),
    version: "1.6.0",
    mode: "installed",
    dataDir: dir,
    ...extra,
  });
test("installed updates deduplicate checks/downloads, persist preferences, and gate restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "luma-update-"));
  let busy = true;
  try {
    const service = make(dir, {
      beforeInstall: async () => {
        if (busy) throw new Error("deleting");
      },
    });
    assert.equal(service.updater.autoInstallOnAppQuit, false);
    assert.equal(service.updater.allowDowngrade, false);
    await Promise.all([service.check(), service.check()]);
    assert.equal(service.updater.checks, 1);
    assert.equal(service.updater.downloads, 1);
    assert.equal(service.state.status, "ready");
    await assert.rejects(service.install(), /deleting/);
    assert.equal(service.updater.installs, 0);
    assert.equal(service.state.status, "ready");
    busy = false;
    await Promise.all([service.install(), service.install()]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.updater.installs, 1);
    service.setAutomatic(false);
    assert.equal(make(dir).state.automatic, false);
    assert.throws(() => service.setAutomatic("yes"), /Invalid/);
    service.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("portable never downloads/installs NSIS; manual mode and network errors remain usable", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "luma-update-"));
  try {
    let opened;
    const portable = make(dir, {
      mode: "portable",
      openExternal: async (url) => {
        opened = url;
      },
    });
    await portable.check();
    assert.equal(portable.state.status, "available");
    assert.equal(portable.updater.downloads, 0);
    await assert.rejects(portable.install(), /No update/);
    await assert.rejects(portable.download(), /portable/);
    await portable.openRelease();
    assert.equal(opened, RELEASE_URL);
    const manual = make(dir);
    manual.setAutomatic(false);
    await manual.check();
    assert.equal(manual.updater.downloads, 0);
    manual.updater.downloadUpdate = async () => {
      throw new Error("checksum mismatch");
    };
    await manual.download();
    assert.equal(manual.state.status, "error");
    manual.updater.downloadUpdate = FakeUpdater.prototype.downloadUpdate;
    await manual.download();
    assert.equal(manual.state.status, "ready");
    portable.dispose();
    manual.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
