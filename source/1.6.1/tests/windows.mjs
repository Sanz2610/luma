import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createFixtures } from "./fixtures.mjs";

const profile = path.resolve("test-results/windows/profile");
const root = path.resolve("test-results/windows/library");
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await createFixtures(root);
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root }),
);
await fs.rm(path.join(profile, "window-state.json"), { force: true });
const env = { ...process.env, LUMA_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.LUMA_TEST_HEADLESS;
let app, page;
const errors = [],
  checks = [];
const pass = (text) => {
  checks.push(text);
  console.log("PASS:", text);
};
async function launch() {
  app = await _electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator(".photo.loaded").first().waitFor();
}
async function state(target, maximized, fullscreen) {
  await target.waitForFunction(
    async ({ maximized, fullscreen }) => {
      const state = await window.luma.windowState();
      return state.maximized === maximized && state.fullscreen === fullscreen;
    },
    { maximized, fullscreen },
  );
}
async function openViewer() {
  const opening = app.waitForEvent("window");
  await page.locator(".photo.loaded").first().dblclick();
  const viewer = await opening;
  viewer.on("pageerror", (e) => errors.push(e.message));
  await viewer.locator(".viewer-original").waitFor();
  return viewer;
}
async function closeViewer(viewer) {
  const closing = viewer.waitForEvent("close");
  await viewer
    .evaluate(() => window.luma.windowAction("close"))
    .catch((error) => {
      if (!viewer.isClosed()) throw error;
    });
  await closing;
}
async function quit() {
  const closing = app.waitForEvent("close");
  await page.evaluate(() => window.luma.windowAction("close")).catch(() => {});
  await closing;
  app = null;
}
async function normalBounds(target, bounds) {
  await (
    await app.browserWindow(target)
  ).evaluate((win, bounds) => {
    win.setFullScreen(false);
    win.unmaximize();
    win.setBounds(bounds);
  }, bounds);
  await state(target, false, false);
  await target.waitForTimeout(300);
}
try {
  await launch();
  await state(page, true, false);
  await page
    .getByRole("button", { name: "Restore window", exact: true })
    .waitFor();
  assert.equal(await page.locator('[data-window-icon="restore"]').count(), 1);
  await page.screenshot({ path: path.join(evidence, "library-maximized.png") });
  pass("fresh profile starts maximized with Windows-style Restore icon");
  await normalBounds(page, { x: 80, y: 70, width: 1050, height: 720 });
  const libraryBounds = await (
    await app.browserWindow(page)
  ).evaluate((win) => win.getNormalBounds());
  await page
    .getByRole("button", { name: "Maximize window", exact: true })
    .waitFor();
  assert.equal(await page.locator('[data-window-icon="maximize"]').count(), 1);
  await page.screenshot({ path: path.join(evidence, "library-windowed.png") });
  let viewer = await openViewer();
  await state(viewer, true, false);
  await normalBounds(viewer, { x: 130, y: 110, width: 900, height: 650 });
  const viewerBounds = await (
    await app.browserWindow(viewer)
  ).evaluate((win) => win.getNormalBounds());
  await closeViewer(viewer);
  viewer = await openViewer();
  await state(viewer, false, false);
  const reopenedBounds = await (
    await app.browserWindow(viewer)
  ).evaluate((win) => win.getNormalBounds());
  assert.ok(
    Math.abs(reopenedBounds.width - viewerBounds.width) <= 2,
    "saved width survives Windows DPI rounding",
  );
  await viewer.screenshot({ path: path.join(evidence, "viewer-windowed.png") });
  await viewer.evaluate(() => window.luma.windowAction("set-fullscreen", true));
  await state(viewer, false, true);
  await viewer.waitForFunction(() =>
    document.querySelector(".viewer").classList.contains("is-fullscreen"),
  );
  assert.equal(await viewer.locator(".viewer-window-bar").isVisible(), false);
  await viewer.screenshot({
    path: path.join(evidence, "viewer-fullscreen.png"),
  });
  await closeViewer(viewer);
  pass(
    "viewer restores windowed bounds and fullscreen after closing and reopening",
  );
  await quit();
  await launch();
  await state(page, false, false);
  assert.ok(
    Math.abs(
      (
        await (
          await app.browserWindow(page)
        ).evaluate((win) => win.getNormalBounds())
      ).width - libraryBounds.width,
    ) <= 2,
  );
  viewer = await openViewer();
  await state(viewer, false, true);
  await viewer.waitForFunction(() =>
    document.querySelector(".viewer").classList.contains("is-fullscreen"),
  );
  await viewer.evaluate(() =>
    window.luma.windowAction("set-fullscreen", false),
  );
  await state(viewer, false, false);
  await viewer
    .getByRole("button", { name: "Maximize viewer", exact: true })
    .click();
  await state(viewer, true, false);
  await closeViewer(viewer);
  await page
    .getByRole("button", { name: "Maximize window", exact: true })
    .click();
  await state(page, true, false);
  await quit();
  await launch();
  await state(page, true, false);
  viewer = await openViewer();
  await state(viewer, true, false);
  await viewer
    .getByRole("button", { name: "Restore viewer", exact: true })
    .click();
  await state(viewer, false, false);
  await closeViewer(viewer);
  pass(
    "both windows restore independent modes across whole-app restarts; titlebar controls stay synchronized",
  );
  await page.evaluate(() => window.luma.windowAction("set-fullscreen", true));
  await state(page, false, true);
  await quit();
  await launch();
  await page.waitForFunction(
    async () => (await window.luma.windowState()).fullscreen,
  );
  await page.evaluate(() => window.luma.windowAction("set-fullscreen", false));
  await page.waitForFunction(
    async () => !(await window.luma.windowState()).fullscreen,
  );
  await (
    await app.browserWindow(page)
  ).evaluate((win) => {
    win.unmaximize();
    win.minimize();
  });
  await quit();
  await launch();
  assert.equal(
    await (await app.browserWindow(page)).evaluate((win) => win.isMinimized()),
    false,
  );
  pass(
    "library remembers true fullscreen; minimizing before exit does not reopen minimized",
  );
  await normalBounds(page, { x: 40, y: 30, width: 800, height: 700 });
  await page.screenshot({ path: path.join(evidence, "library-narrow.png") });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(evidence, "windows.json"),
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
} finally {
  if (app) await app.close();
}
