import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createFixtures } from "./fixtures.mjs";

const base = path.resolve("test-results/viewer-options"),
  root = path.join(base, "library"),
  profile = path.join(base, "profile"),
  evidence = path.resolve(
    process.env.LUMA_TEST_EVIDENCE || "test-results/evidence-options",
  );
await createFixtures(root);
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root, sort: "name", columns: 5 }),
);
await fs.writeFile(path.join(profile, "window-state.json"), "{}");
const errors = [],
  checks = [];
let app, page, viewer;
const pass = (value) => {
  checks.push(value);
  console.log("PASS:", value);
};
async function launch() {
  const env = { ...process.env, LUMA_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    ...(process.env.LUMA_PACKAGED_EXE
      ? {
          executablePath: path.resolve(process.env.LUMA_PACKAGED_EXE),
          args: [`--user-data-dir=${profile}`],
        }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator(".photo.loaded").first().waitFor();
  await page.waitForFunction(
    async () => !(await window.luma.getLibrary()).scanning,
  );
}
async function openViewer() {
  const opening = app.waitForEvent("window");
  await page.locator(".photo").first().click();
  viewer = await opening;
  viewer.setDefaultTimeout(15000);
  viewer.on("pageerror", (error) => errors.push(error.message));
  await viewer.emulateMedia({ reducedMotion: "reduce" });
  await loaded();
}
async function loaded() {
  await viewer.waitForFunction(
    () => document.querySelector(".viewer-original")?.naturalWidth > 0,
  );
}
async function wheel(delta, ctrl = false) {
  const box = await viewer.locator(".viewer-stage").boundingBox();
  await viewer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (ctrl) await viewer.keyboard.down("Control");
  await viewer.mouse.wheel(0, delta);
  if (ctrl) await viewer.keyboard.up("Control");
}
async function tabAppearance() {
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll(".photo img")];
    return (
      images.length > 0 &&
      images.every((img) => img.complete && img.naturalWidth)
    );
  });
  const selected = page.locator(".folder-tab-item.active");
  const colors = await page.locator(".folder-tab-item").evaluateAll((els) =>
    els.slice(0, 2).map((el) => {
      const style = getComputedStyle(el);
      return {
        selected: el.classList.contains("active"),
        background: style.backgroundColor,
        tl: style.borderTopLeftRadius,
        tr: style.borderTopRightRadius,
        bottom: style.borderBottomLeftRadius,
      };
    }),
  );
  assert.equal(await selected.count(), 1);
  assert.notEqual(colors[0].background, colors[1].background);
  const active = colors.find((item) => item.selected);
  assert.equal(active.tl, "8px");
  assert.equal(active.tr, "8px");
  assert.equal(active.bottom, "0px");
  assert.equal(
    await selected.getByRole("tab").getAttribute("aria-selected"),
    "true",
  );
}
try {
  await launch();
  await page.locator(".folder-tab").first().click();
  await tabAppearance();
  await page.screenshot({ path: path.join(evidence, "tabs-desktop.png") });
  await page.locator(".folder-tab.active").focus();
  await page.keyboard.press("ArrowRight");
  await tabAppearance();
  await page.getByRole("tab", { name: "All photos", exact: true }).click();
  assert.equal(await page.locator(".all-tab-item.active").count(), 1);
  pass(
    "selected tabs have a distinct background across the close button and rounded top corners; keyboard selection and All photos agree",
  );

  await openViewer();
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).viewerWheel,
    "zoom",
  );
  const firstId = (await viewer.evaluate(() => window.luma.viewerState())).image
    .id;
  await wheel(-120);
  await viewer.waitForFunction(
    () => Number(document.querySelector(".viewer-stage").dataset.zoom) > 1,
  );
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).image.id,
    firstId,
  );
  await viewer
    .getByRole("button", { name: "Viewer options", exact: true })
    .dispatchEvent("click");
  const dialog = viewer.getByRole("dialog", {
    name: "Viewer options",
    exact: true,
  });
  await dialog
    .getByLabel("Mouse wheel", { exact: true })
    .selectOption("navigate");
  await viewer.waitForFunction(
    async () => (await window.luma.viewerState()).viewerWheel === "navigate",
  );
  await dialog
    .getByRole("button", { name: "Done", exact: true })
    .waitFor({ state: "visible" });
  assert.match(await dialog.innerText(), /Ctrl \+ mouse wheel always zooms/);
  await viewer.screenshot({
    path: path.join(evidence, "wheel-options-desktop.png"),
  });
  const beforeBlocked = (await viewer.evaluate(() => window.luma.viewerState()))
    .image.id;
  await viewer.locator(".viewer-stage").dispatchEvent("wheel", { deltaY: 120 });
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).image.id,
    beforeBlocked,
  );
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await wheel(120);
  await viewer.waitForFunction(
    async (id) => (await window.luma.viewerState()).image.id !== id,
    firstId,
  );
  const secondId = (await viewer.evaluate(() => window.luma.viewerState()))
    .image.id;
  await loaded();
  assert.equal(
    Number(await viewer.locator(".viewer-stage").getAttribute("data-zoom")),
    1,
  );
  await wheel(-120);
  await viewer.waitForFunction(
    async (id) => (await window.luma.viewerState()).image.id === id,
    firstId,
  );
  await loaded();
  await wheel(-120, true);
  await viewer.waitForFunction(
    () => Number(document.querySelector(".viewer-stage").dataset.zoom) > 1,
  );
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).image.id,
    firstId,
  );
  for (let i = 0; i < 25; i++)
    await viewer
      .locator(".viewer-stage")
      .dispatchEvent("wheel", { deltaY: 120, ctrlKey: true });
  assert.equal(
    Number(await viewer.locator(".viewer-stage").getAttribute("data-zoom")),
    1,
  );
  pass(
    "default wheel zooms; saved navigation mode moves down/next and up/previous; Ctrl+wheel zooms and stops at Fit; modal blocks wheel actions",
  );

  await page.bringToFront();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(
    await page.getByLabel("Mouse wheel", { exact: true }).inputValue(),
    "navigate",
  );
  await page.getByLabel("Mouse wheel", { exact: true }).selectOption("zoom");
  await viewer.waitForFunction(
    async () => (await window.luma.viewerState()).viewerWheel === "zoom",
  );
  await page.keyboard.press("Escape");
  await viewer.bringToFront();
  await wheel(-120);
  await viewer.waitForFunction(
    () => Number(document.querySelector(".viewer-stage").dataset.zoom) > 1,
  );
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).image.id,
    firstId,
  );
  await viewer
    .getByRole("button", { name: "Viewer options", exact: true })
    .dispatchEvent("click");
  await viewer
    .getByLabel("Mouse wheel", { exact: true })
    .selectOption("navigate");
  await viewer.getByRole("button", { name: "Done", exact: true }).click();
  await viewer.keyboard.press("f");
  await viewer.locator(".viewer.is-fullscreen").waitFor();
  await viewer
    .getByRole("button", { name: "Viewer options", exact: true })
    .dispatchEvent("click");
  await dialog.waitFor();
  await viewer.screenshot({
    path: path.join(evidence, "wheel-options-fullscreen.png"),
  });
  await viewer.keyboard.press("Escape");
  assert.equal(await viewer.locator(".viewer.is-fullscreen").count(), 1);
  await viewer.keyboard.press("f");
  const native = await app.browserWindow(viewer);
  await native.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(320, 500);
    win.setSize(390, 844);
  });
  await viewer.waitForFunction(() => innerWidth < 500);
  await viewer
    .getByRole("button", { name: "Viewer options", exact: true })
    .dispatchEvent("click");
  await dialog.waitFor();
  const optionBounds = await dialog.boundingBox();
  assert.ok(
    optionBounds.x >= 0 &&
      optionBounds.x + optionBounds.width <=
        (await viewer.evaluate(() => innerWidth)),
  );
  await viewer.screenshot({
    path: path.join(evidence, "wheel-options-narrow.png"),
  });
  await viewer.keyboard.press("Escape");
  await viewer.locator(".viewer").dispatchEvent("pointermove");
  const footer = await viewer.locator(".viewer-toolbar").boundingBox();
  assert.ok(
    footer.x >= 0 &&
      footer.x + footer.width <= (await viewer.evaluate(() => innerWidth)),
  );
  await viewer.screenshot({ path: path.join(evidence, "viewer-narrow.png") });
  pass(
    "viewer and library preferences sync live without resetting the image; options work in fullscreen and a 390px window",
  );

  await viewer.close();
  await openViewer();
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).viewerWheel,
    "navigate",
  );
  // Two full detents inside a short interval stay one step, even after the image remounts.
  await viewer.locator(".viewer-stage").dispatchEvent("wheel", { deltaY: 120 });
  await viewer.waitForFunction(
    async (id) => (await window.luma.viewerState()).image.id === id,
    secondId,
  );
  await viewer.locator(".viewer-stage").dispatchEvent("wheel", { deltaY: 120 });
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).image.id,
    secondId,
  );
  await app.close();
  await launch();
  await openViewer();
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).viewerWheel,
    "navigate",
  );
  const reopenedId = (await viewer.evaluate(() => window.luma.viewerState()))
    .image.id;
  await wheel(120);
  await viewer.waitForFunction(
    async (id) => (await window.luma.viewerState()).image.id !== id,
    reopenedId,
  );
  pass(
    "wheel mode survives viewer reopen and whole-app restart; navigation bursts remain bounded across image remounts",
  );
  const only = (await page.evaluate(() => window.luma.getLibrary())).images[0];
  await page.evaluate(
    (image) => window.luma.openViewer(image.id, [image.id]),
    only,
  );
  await viewer.waitForFunction(
    async () => (await window.luma.viewerState()).count === 1,
  );
  await loaded();
  await wheel(120);
  assert.equal(
    (await viewer.evaluate(() => window.luma.viewerState())).image.id,
    only.id,
  );
  assert.equal(
    Number(await viewer.locator(".viewer-stage").getAttribute("data-zoom")),
    1,
  );
  await wheel(-120, true);
  await viewer.waitForFunction(
    () => Number(document.querySelector(".viewer-stage").dataset.zoom) > 1,
  );
  pass("single-photo navigation is a no-op while Ctrl+wheel still zooms");
  await viewer.close();
  await page.bringToFront();
  const nativeLibrary = await app.browserWindow(page);
  await nativeLibrary.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(320, 500);
    win.setSize(390, 844);
  });
  await page.waitForFunction(() => innerWidth < 500);
  await page.locator(".folder-tab").first().click();
  await tabAppearance();
  await page.screenshot({ path: path.join(evidence, "tabs-narrow.png") });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(evidence, "viewer-options.json"),
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({ path: path.join(evidence, "failure-library.png") })
      .catch(() => {});
  if (viewer && !viewer.isClosed())
    await viewer
      .screenshot({ path: path.join(evidence, "failure-viewer.png") })
      .catch(() => {});
  throw error;
} finally {
  await app?.close().catch(() => {});
}
