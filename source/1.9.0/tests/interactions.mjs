import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import assert from "node:assert/strict";

const base = path.resolve("test-results/interactions");
const root = path.join(base, "library");
const profile = path.join(base, "profile");
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence-interactions",
);
await fs.mkdir(path.join(root, "Photos"), { recursive: true });
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.rm(path.join(root, "Photos", "Narrow.png"), { force: true });
const sample = await sharp({
  create: { width: 3000, height: 2122, channels: 4, background: "#8c72a5" },
})
  .withMetadata({ density: 257 })
  .png()
  .toBuffer();
for (let n = 0; n < 60; n++)
  await fs.writeFile(
    path.join(root, "Photos", `Sample-${String(n).padStart(2, "0")}.png`),
    sample,
  );
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root, columns: 4, sort: "name" }),
);
await fs.rm(path.join(profile, "window-state.json"), { force: true });
const env = { ...process.env, LUMA_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  ...(process.env.LUMA_PACKAGED_EXE
    ? {
        executablePath: path.resolve(process.env.LUMA_PACKAGED_EXE),
        args: [`--user-data-dir=${profile}`],
      }
    : { args: ["."] }),
  env,
});
const checks = [],
  errors = [];
const pass = (value) => {
  checks.push(value);
  console.log("PASS:", value);
};
let page, viewer;
const count = () =>
  page.evaluate(async () => (await window.luma.getLibrary()).images.length);
const waitCount = (n) =>
  page.waitForFunction(async (n) => {
    const state = await window.luma.getLibrary();
    return !state.scanning && state.images.length === n;
  }, n);
async function menu(action) {
  await page.locator('.photo[data-index="0"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
async function openViewer() {
  const opening = app.waitForEvent("window");
  await menu("Open");
  viewer = await opening;
  viewer.setDefaultTimeout(15000);
  await viewer.emulateMedia({ reducedMotion: "reduce" });
  viewer.on("pageerror", (error) => errors.push(error.message));
  await viewer.waitForFunction(
    () => document.querySelector(".viewer-original")?.naturalWidth > 0,
  );
}
try {
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator(".photo.loaded").first().waitFor();
  await page.waitForFunction(
    async () => !(await window.luma.getLibrary()).scanning,
  );
  await app.evaluate(({ shell }) => {
    globalThis.testActions = [];
    shell.showItemInFolder = (file) =>
      globalThis.testActions.push({ type: "reveal", file });
    shell.openExternal = async (url) =>
      globalThis.testActions.push({ type: "browser", url });
  });
  await page.locator(".photo").first().click({ button: "right" });
  assert.equal(await page.getByRole("menuitem").count(), 5);
  await page.keyboard.press("End");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Delete",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("menu").count(), 0);
  await page.locator(".photo").first().focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menu").waitFor();
  await page.keyboard.press("Escape");
  await menu("Properties");
  await page.locator(".image-location").waitFor();
  assert.match(
    await page
      .getByRole("dialog", { name: "Properties", exact: true })
      .innerText(),
    /257 dpi/,
  );
  await page.screenshot({
    path: path.join(evidence, "properties-desktop.png"),
  });
  await page.keyboard.press("Escape");
  await menu("Show in Explorer");
  await menu("Search with Google Lens");
  await page.waitForFunction(() => !document.querySelector(".photo-menu"));
  const actions = await app.evaluate(async () => {
    const deadline = Date.now() + 10000;
    while (
      !globalThis.testActions.some((a) => a.type === "browser") &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    return globalThis.testActions;
  });
  assert.ok(
    actions.some((a) => a.type === "reveal" && a.file.startsWith(root)),
  );
  assert.ok(
    actions.some(
      (a) => a.type === "browser" && a.url.startsWith("http://127.0.0.1:"),
    ),
  );
  pass(
    "context menu keyboard, real Properties metadata, validated Explorer and Lens actions (external side effects stubbed)",
  );

  await menu("Delete");
  await page.getByRole("button", { name: "Keep photos", exact: true }).click();
  assert.equal(await count(), 60);
  await openViewer();
  const stage = viewer.locator(".viewer-stage");
  await stage.click();
  await viewer.locator(".viewer.footer-hidden").waitFor();
  await viewer.mouse.move(600, 350);
  assert.equal(
    await viewer
      .locator(".viewer-toolbar")
      .evaluate((el) => getComputedStyle(el).opacity),
    "0",
  );
  await viewer.keyboard.press("ArrowRight");
  await viewer.locator(".viewer.footer-hidden").waitFor();
  await stage.click();
  await viewer.waitForFunction(
    () =>
      !document.querySelector(".viewer").classList.contains("footer-hidden"),
  );
  await stage.dblclick();
  assert.equal(await viewer.locator(".viewer.footer-hidden").count(), 0);
  await stage.dblclick({ delay: 280 });
  assert.equal(await viewer.locator(".viewer.footer-hidden").count(), 0);
  await stage.dblclick();
  const beforePan = Number(await stage.getAttribute("data-pan-x"));
  const box = await stage.boundingBox();
  await viewer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await viewer.mouse.down();
  await viewer.mouse.move(
    box.x + box.width / 2 + 100,
    box.y + box.height / 2 + 50,
    { steps: 8 },
  );
  await viewer.mouse.up();
  assert.ok(Number(await stage.getAttribute("data-pan-x")) > beforePan + 10);
  assert.equal(await viewer.locator(".viewer.footer-hidden").count(), 0);
  assert.equal(
    await viewer.evaluate(
      () =>
        [...document.styleSheets]
          .flatMap((sheet) => [...sheet.cssRules])
          .find(
            (rule) =>
              rule.selectorText ===
              ".viewer-zoom-slider::-webkit-slider-runnable-track",
          )?.style.height,
    ),
    "2px",
  );
  await viewer.screenshot({
    path: path.join(evidence, "viewer-toolbar-desktop.png"),
  });
  pass(
    "single click toggles footer across navigation; mouse movement, double click and pan preserve its state; zoom track is 2px",
  );

  await viewer.keyboard.press("Delete");
  await viewer
    .getByRole("button", { name: "Keep photos", exact: true })
    .click();
  assert.equal(await count(), 60);
  await viewer
    .getByRole("button", { name: "Delete photo (Delete)", exact: true })
    .dispatchEvent("click");
  await viewer
    .getByRole("button", { name: "Move to Recycle Bin", exact: true })
    .click();
  await waitCount(59);
  await viewer
    .getByRole("dialog", { name: "Move photos to Recycle Bin?", exact: true })
    .waitFor({ state: "hidden" });
  await viewer.waitForFunction(
    async () => (await window.luma.viewerState()).count === 59,
  );
  assert.equal(viewer.isClosed(), false);
  assert.equal(
    await fs.stat(path.join(root, "Photos", "Sample-01.png")).then(
      () => true,
      () => false,
    ),
    false,
  );
  pass(
    "viewer icon and Delete key confirm; cancellation keeps files; recycle advances to the next image in the same window",
  );

  await page.bringToFront();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(
    await page
      .locator('button[aria-label="Settings"] svg.lucide-settings')
      .count(),
    1,
  );
  await page
    .getByRole("switch", { name: "Confirm before deleting", exact: true })
    .click();
  await page.waitForFunction(
    async () =>
      (await window.luma.getLibrary()).settings.confirmDelete === false,
  );
  await page.keyboard.press("Escape");
  await viewer.bringToFront();
  await viewer.locator(".viewer").focus();
  await viewer.keyboard.press("Delete");
  await waitCount(58);
  await viewer.locator(".deletion-status").waitFor({ state: "hidden" });
  assert.equal(
    await viewer
      .getByRole("dialog", { name: "Move photos to Recycle Bin?", exact: true })
      .count(),
    0,
  );
  await viewer.close();
  await menu("Delete");
  await waitCount(57);
  assert.equal(
    await page
      .getByRole("dialog", { name: "Move photos to Recycle Bin?", exact: true })
      .count(),
    0,
  );
  pass(
    "live Settings switch disables confirmation for the already-open viewer and context-menu deletion",
  );

  await page.getByRole("button", { name: "Organize", exact: true }).click();
  let grid = await page.locator(".gallery-scroll").boundingBox();
  const first = await page.locator('.photo[data-index="0"]').boundingBox();
  const fifth = await page.locator('.photo[data-index="5"]').boundingBox();
  await page.mouse.move(first.x + 15, first.y + 15);
  await page.mouse.down();
  await page.mouse.move(
    fifth.x + fifth.width / 2,
    Math.min(fifth.y + 15, grid.y + grid.height - 50),
    { steps: 12 },
  );
  await page.locator(".selection-marquee").waitFor();
  await page.screenshot({ path: path.join(evidence, "marquee-desktop.png") });
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document.querySelector(".selection-bar strong").textContent ===
      "4 selected",
  );
  const firstSelected = await page
    .locator(".photo.selected")
    .evaluateAll((els) => els.map((el) => Number(el.dataset.index)));
  assert.deepEqual(firstSelected, [0, 1, 4, 5]);
  // A click in the 3px gap clears the selection.
  await page.mouse.click(first.x + first.width + 1, first.y + 15);
  await page.waitForFunction(
    () =>
      document.querySelector(".selection-bar strong").textContent ===
      "0 selected",
  );
  await page.locator('.photo[data-index="2"]').click();
  await page.keyboard.down("Control");
  await page.mouse.move(first.x + 15, first.y + 15);
  await page.mouse.down();
  await page.mouse.move(first.x + 50, first.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.waitForFunction(
    () =>
      document.querySelector(".selection-bar strong").textContent ===
      "2 selected",
  );
  // Edge autoscroll selects unmounted rows while keeping the DOM bounded.
  await page.mouse.move(first.x + 15, first.y + 15);
  await page.mouse.down();
  await page.mouse.move(first.x + 60, first.y + 60, { steps: 5 });
  await page.evaluate(() => window.luma.refresh());
  await page.locator(".selection-marquee").waitFor();
  await page.mouse.move(first.x + first.width + 30, grid.y + grid.height - 4, {
    steps: 10,
  });
  await page.waitForFunction(
    () => document.querySelector(".gallery-scroll").scrollTop > 1200,
  );
  await page.mouse.up();
  assert.ok(
    Number(
      (await page.locator(".selection-bar strong").innerText()).split(" ")[0],
    ) > 8,
  );
  assert.ok((await page.locator(".photo").count()) < 30);
  await page.keyboard.press("Control+a");
  assert.equal(
    await page.locator(".selection-bar strong").innerText(),
    "57 selected",
  );
  await page.keyboard.press("Delete");
  await waitCount(0);
  await page.locator(".deletion-status").waitFor({ state: "hidden" });
  pass(
    "real marquee replaces selection, blank click clears, Ctrl adds, edge autoscroll hits virtual rows, Ctrl+A and no-confirm batch recycle work",
  );

  // Narrow menu and Properties fit a small window; recreate only disposable fixtures.
  await fs.writeFile(path.join(root, "Photos", "Narrow.png"), sample);
  await page.evaluate(() => window.luma.refresh());
  await page
    .getByRole("button", { name: "Exit organize", exact: true })
    .click();
  const native = await app.browserWindow(page);
  await native.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(320, 500);
    win.setSize(390, 844);
  });
  await page.waitForFunction(
    () =>
      innerWidth < 500 &&
      document.querySelector(".photo")?.getBoundingClientRect().width < 150,
  );
  await page.waitForTimeout(400);
  await page.locator(".photo.loaded").first().waitFor();
  await page
    .locator(".photo")
    .first()
    .dispatchEvent("contextmenu", { clientX: 385, clientY: 820 });
  const menuBox = await page.getByRole("menu").boundingBox();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  assert.ok(
    menuBox.x + menuBox.width <= viewport.width &&
      menuBox.y + menuBox.height <= viewport.height,
  );
  await page.screenshot({ path: path.join(evidence, "menu-narrow.png") });
  await page.getByRole("menuitem", { name: "Properties", exact: true }).click();
  await page.locator(".image-location").waitFor();
  await page.screenshot({ path: path.join(evidence, "properties-narrow.png") });
  await page.keyboard.press("Escape");
  pass("menu clamps to viewport and Properties fits a 390px window");
  await openViewer();
  const nativeViewer = await app.browserWindow(viewer);
  await nativeViewer.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(320, 500);
    win.setSize(390, 844);
  });
  await viewer.waitForFunction(() => innerWidth < 500);
  await viewer.locator(".viewer").dispatchEvent("pointermove");
  const footer = await viewer.locator(".viewer-toolbar").boundingBox();
  assert.ok(
    footer.x >= 0 &&
      footer.x + footer.width <= (await viewer.evaluate(() => innerWidth)),
  );
  await viewer.screenshot({
    path: path.join(evidence, "viewer-toolbar-narrow.png"),
  });
  await app.evaluate(({ shell }) => {
    globalThis.realTrashItem = shell.trashItem;
    shell.trashItem = async () => {
      throw new Error("Fixture file is locked");
    };
  });
  await viewer.locator(".viewer").focus();
  await viewer.keyboard.press("Delete");
  await viewer
    .getByRole("dialog", {
      name: "Some photos could not be deleted",
      exact: true,
    })
    .waitFor();
  assert.ok(await fs.stat(path.join(root, "Photos", "Narrow.png")));
  await viewer.getByRole("button", { name: "Done", exact: true }).click();
  await app.evaluate(({ shell }) => {
    shell.trashItem = globalThis.realTrashItem;
  });
  await viewer.locator(".viewer").focus();
  await viewer.keyboard.press("Delete");
  await viewer.waitForEvent("close");
  await waitCount(0);
  pass(
    "narrow viewer footer fits; recycle failure keeps originals and reports errors; deleting the last image closes the viewer",
  );
  assert.deepEqual(errors, []);
  const saved = JSON.parse(
    await fs.readFile(path.join(profile, "settings.json"), "utf8"),
  );
  assert.equal(saved.confirmDelete, false);
  await fs.writeFile(
    path.join(evidence, "interactions.json"),
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
} catch (error) {
  await page
    ?.screenshot({ path: path.join(evidence, "failure-library.png") })
    .catch(() => {});
  if (viewer && !viewer.isClosed())
    await viewer
      .screenshot({ path: path.join(evidence, "failure-viewer.png") })
      .catch(() => {});
  throw error;
} finally {
  await app.close();
}
