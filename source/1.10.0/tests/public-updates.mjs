import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
const profile = path.resolve("test-results/public-updates");
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root: "" }),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath: path.resolve("../work/release/win-unpacked/Luma.exe"),
  args: [`--user-data-dir=${profile}`],
  env,
});
try {
  const page = await app.firstWindow();
  await page.getByRole("tab", { name: "All photos", exact: true }).waitFor();
  const state = await page.evaluate(() => window.luma.checkUpdates());
  assert.equal(state.status, "current");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".update-section").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(evidence, "updates-public-current.png"),
  });
  const result = await app.evaluate(async ({ app }, profile) => {
    const requireModule = process.mainModule
      .require("node:module")
      .createRequire(app.getAppPath() + "/package.json");
    const { NsisUpdater } = requireModule("electron-updater");
    const { ElectronHttpExecutor } = requireModule(
      "electron-updater/out/electronHttpExecutor.js",
    );
    const path = requireModule("node:path"),
      fs = requireModule("node:fs/promises");
    const { Updates } = requireModule(
      path.join(app.getAppPath(), "electron/updates.cjs"),
    );
    const config = path.join(profile, "fixture-update.yml");
    await fs.writeFile(config, "updaterCacheDirName: public-feed-fixture\n");
    const adapter = {
      version: "1.9.0",
      name: "Luma feed fixture",
      isPackaged: true,
      appUpdateConfigPath: config,
      userDataPath: profile,
      baseCachePath: path.join(profile, "cache"),
      whenReady: () => Promise.resolve(),
      onQuit: () => {},
      quit: () => {},
      relaunch: () => {},
    };
    const updater = new NsisUpdater(null, adapter);
    updater.httpExecutor = new ElectronHttpExecutor();
    updater.disableDifferentialDownload = true;
    updater.setFeedURL({
      provider: "github",
      owner: "Sanz2610",
      repo: "luma",
      private: false,
    });
    const service = new Updates({
      updater,
      mode: "installed",
      version: "1.9.0",
      dataDir: path.join(profile, "old-version"),
      openExternal: async () => {},
    });
    const errors = [];
    updater.on("error", (error) => errors.push(error.message));
    const state = await service.check();
    service.dispose();
    return { state, errors, file: updater.installerPath };
  }, profile);
  assert.equal(result.state.status, "ready", JSON.stringify(result));
  assert.equal(result.state.nextVersion, pkg.version);
  const downloadedHash = crypto
    .createHash("sha256")
    .update(await fs.readFile(result.file))
    .digest("hex");
  const expectedHash = crypto
    .createHash("sha256")
    .update(await fs.readFile(`../work/release/Luma-${pkg.version}-Setup.exe`))
    .digest("hex");
  assert.equal(downloadedHash, expectedHash);
  await fs.writeFile(
    path.join(evidence, "public-updates.json"),
    JSON.stringify(
      {
        passed: true,
        currentVersion: state.version,
        latestVersion: result.state.nextVersion,
        sha256: downloadedHash,
        installed: false,
        errors: result.errors,
      },
      null,
      2,
    ),
  );
  console.log({
    passed: true,
    currentVersion: state.version,
    downloadedVersion: result.state.nextVersion,
    installed: false,
  });
} finally {
  await app.close();
}
