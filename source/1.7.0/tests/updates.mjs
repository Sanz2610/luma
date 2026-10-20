import { _electron } from "playwright";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const profile = path.resolve("test-results/update-feed/profile");
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root: "" }),
);
const bytes = Buffer.alloc(128 * 1024, 42);
const hash = crypto.createHash("sha512").update(bytes).digest("base64");
const requests = [];
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const bad = request.url.includes("/bad/");
  requests.push(request.url);
  if (pathname.endsWith("latest.yml")) {
    response.writeHead(200, { "Content-Type": "text/yaml" });
    response.end(
      `version: 99.0.0\nfiles:\n  - url: Luma-99.0.0-Setup.exe\n    sha512: ${bad ? Buffer.alloc(64).toString("base64") : hash}\n    size: ${bytes.length}\npath: Luma-99.0.0-Setup.exe\nsha512: ${hash}\nreleaseDate: 2026-10-20T00:00:00.000Z\n`,
    );
  } else if (pathname.endsWith(".exe")) {
    response.writeHead(200, { "Content-Length": bytes.length });
    response.end(bytes);
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, LUMA_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ args: ["."], env });
const checks = [];
try {
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Updates", exact: true }).waitFor();
  await page.locator(".update-section").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(evidence, "updates-development.png"),
  });
  const result = await app.evaluate(
    async ({ app }, { url, profile }) => {
      const requireModule = process.mainModule
        .require("node:module")
        .createRequire(app.getAppPath() + "/package.json");
      const fs = requireModule("node:fs/promises"),
        path = requireModule("node:path");
      const { NsisUpdater } = requireModule("electron-updater");
      const { Updates } = requireModule(
        path.join(app.getAppPath(), "electron/updates.cjs"),
      );
      const main = global.__lumaDiagnostics.libraryWindow;
      const make = async (key, mode) => {
        const dataDir = path.join(profile, key);
        await fs.mkdir(dataDir, { recursive: true });
        const config = path.join(dataDir, "app-update.yml");
        await fs.writeFile(config, "updaterCacheDirName: fixture-cache\n");
        const adapter = {
          version: "1.6.0",
          name: "Luma test",
          isPackaged: true,
          appUpdateConfigPath: config,
          userDataPath: dataDir,
          baseCachePath: path.join(dataDir, "cache"),
          whenReady: () => Promise.resolve(),
          onQuit: () => {},
          quit: () => {
            throw new Error("Tests must not quit for installation");
          },
          relaunch: () => {},
        };
        const updater = new NsisUpdater(
          { provider: "generic", url: url + "/" + key + "/" },
          adapter,
        );
        const { ElectronHttpExecutor } = requireModule(
          "electron-updater/out/electronHttpExecutor.js",
        );
        updater.httpExecutor = new ElectronHttpExecutor();
        updater.setFeedURL({ provider: "generic", url: url + "/" + key + "/" });
        updater.disableDifferentialDownload = true;
        const service = new Updates({
          updater,
          mode,
          version: "1.6.0",
          dataDir,
          openExternal: async () => {},
          notify: (value) => main.webContents.send("updates:changed", value),
        });
        let installs = 0;
        updater.quitAndInstall = () => {
          installs++;
        };
        return {
          service,
          updater,
          get installs() {
            return installs;
          },
        };
      };
      const good = await make("good", "installed");
      const updaterErrors = [];
      good.updater.on("error", (error) => updaterErrors.push(error.message));
      await good.service.check();
      const ready = good.service.snapshot();
      if (ready.status !== "ready")
        throw new Error(JSON.stringify({ ready, updaterErrors }));
      const downloadPath = good.updater.installerPath;
      await good.service.install();
      await new Promise((resolve) => setImmediate(resolve));
      const bad = await make("bad", "installed");
      await bad.service.check();
      const rejected = bad.service.snapshot();
      const portable = await make("portable", "portable");
      await portable.service.check();
      const portableState = portable.service.snapshot();
      const portableFile = portable.updater.installerPath;
      // Leave the UI in its downloaded state for screenshot verification only.
      good.service.set({ status: "ready" });
      good.service.dispose();
      bad.service.dispose();
      portable.service.dispose();
      return {
        ready,
        rejected,
        portableState,
        portableFile,
        downloadPath,
        installs: good.installs,
      };
    },
    { url, profile },
  );
  assert.equal(result.ready.status, "ready");
  assert.equal(result.installs, 1);
  assert.equal(
    crypto
      .createHash("sha512")
      .update(await fs.readFile(result.downloadPath))
      .digest("base64"),
    hash,
  );
  assert.equal(result.rejected.status, "error");
  assert.equal(result.portableState.status, "available");
  assert.equal(result.portableFile, null);
  assert.equal(
    requests.some(
      (request) => request.includes("/portable/") && request.endsWith(".exe"),
    ),
    false,
  );
  await page
    .getByRole("button", { name: "Restart to update", exact: true })
    .waitFor();
  await page.locator(".update-section").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, "updates-ready.png") });
  checks.push(
    "real electron-updater downloads a newer local-feed artifact and validates SHA-512",
  );
  checks.push("mismatched SHA-512 fails without making an update installable");
  checks.push(
    "portable checks the same feed without downloading an NSIS installer",
  );
  checks.push(
    "restart hands off once; installer execution stubbed to preserve the installed app",
  );
  await fs.writeFile(
    path.join(evidence, "updates.json"),
    JSON.stringify({ passed: true, checks, requests }, null, 2),
  );
  console.log({ passed: true, checks });
} finally {
  await app.close();
  await new Promise((resolve) => server.close(resolve));
}
