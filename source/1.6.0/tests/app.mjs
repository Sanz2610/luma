import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createFixtures } from "./fixtures.mjs";
import { sortedFolders } from "../src/layout.mjs";

const root = path.resolve("test-results/library-v11"),
  profile = path.resolve("test-results/profile-v11"),
  stressRoot = path.resolve("test-results/stress-v11"),
  evidence = path.resolve(
    process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
  );
await createFixtures(root);
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
const fitCases = [
  ["__fit-wide.png", 4200, 1400],
  ["__fit-tall.png", 1400, 4200],
  ["__fit-example.png", 2526, 1786],
  ["__fit-small.png", 120, 80],
];
for (const [name, width, height] of fitCases)
  await sharp({ create: { width, height, channels: 3, background: "#73859a" } })
    .png()
    .toFile(path.join(root, "Cảm hứng", name));
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root: "", thumbnailSize: 220 }),
);
let application;
const logs = [],
  checks = [];
const pass = (text) => {
  checks.push(text);
  console.log("PASS:", text);
};
async function launch() {
  const env = { ...process.env, LUMA_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ args: ["."], env });
  const page = await application.firstWindow();
  page.on("pageerror", (error) =>
    logs.push({ type: "pageerror", text: error.message }),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      logs.push({ type: "error", text: message.text() });
  });
  await page.getByRole("tab", { name: "All photos", exact: true }).waitFor();
  return page;
}
const waitPhotos = (page) =>
  page.waitForFunction(
    () =>
      document.querySelectorAll(".photo img").length > 0 &&
      [...document.querySelectorAll(".photo img")].every(
        (img) => img.complete && img.naturalWidth,
      ),
  );
async function fitInside(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector(".viewer-original"),
      stage = document.querySelector(".viewer-stage");
    if (!image?.naturalWidth || !stage) return false;
    const b = image.getBoundingClientRect(),
      f = stage.getBoundingClientRect();
    return (
      b.x >= f.x - 1 &&
      b.y >= f.y - 1 &&
      b.right <= f.right + 1 &&
      b.bottom <= f.bottom + 1 &&
      (Math.abs(b.width - f.width) < 2 || Math.abs(b.height - f.height) < 2)
    );
  });
  await page.waitForFunction(
    () => document.querySelector(".viewer-original")?.naturalWidth > 0,
  );
  const box = await page.locator(".viewer-original").boundingBox(),
    frame = await page.locator(".viewer-stage").boundingBox();
  assert.ok(
    box.x >= frame.x - 1 &&
      box.y >= frame.y - 1 &&
      box.x + box.width <= frame.x + frame.width + 1 &&
      box.y + box.height <= frame.y + frame.height + 1,
    JSON.stringify({ box, frame }),
  );
  assert.ok(
    Math.abs(box.width - frame.width) < 2 ||
      Math.abs(box.height - frame.height) < 2,
  );
  assert.ok(
    await page
      .locator(".viewer-stage")
      .evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth &&
          el.scrollHeight <= el.clientHeight,
      ),
  );
}
try {
  let page = await launch();
  await page
    .getByRole("heading", { name: /A little less interface/ })
    .waitFor();
  await application.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, root);
  await page
    .getByRole("button", { name: "Choose photo folder", exact: true })
    .last()
    .click();
  await waitPhotos(page);
  let snapshot = await page.evaluate(() => window.luma.getLibrary());
  assert.equal(snapshot.folders.length, 5);
  assert.equal(snapshot.images.length, 44);
  assert.equal(
    await page
      .locator(".library-header,.gallery-toolbar,.tab-count,.tab-link")
      .count(),
    0,
  );
  const panel = await page.locator(".photo-panel").boundingBox();
  assert.ok(panel.y < 90);
  pass("compact layout, controls in footer, no tab counts or tab links");
  for (let columns = 3; columns <= 8; columns++) {
    await page.getByLabel("Columns", { exact: true }).fill(String(columns));
    await page.waitForFunction(
      (count) =>
        getComputedStyle(
          document.querySelector(".grid-window"),
        ).gridTemplateColumns.split(" ").length === count,
      columns,
    );
    const bounds = await page.locator(".gallery-scroll").boundingBox(),
      content = await page.locator(".grid-window").boundingBox();
    const usable = await page
      .locator(".gallery-scroll")
      .evaluate((el) => el.clientWidth);
    assert.ok(
      Math.abs(usable - content.width) < 2,
      JSON.stringify({ usable, content, bounds }),
    );
  }
  await page
    .getByRole("button", { name: "Fewer columns", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Columns", { exact: true }).inputValue(),
    "7",
  );
  await page.getByRole("button", { name: "More columns", exact: true }).click();
  assert.equal(
    await page.getByLabel("Columns", { exact: true }).inputValue(),
    "8",
  );
  await page.getByLabel("Thumbnail ratio", { exact: true }).selectOption("4:5");
  const tile = await page.locator(".photo").first().boundingBox();
  assert.ok(Math.abs(tile.width / tile.height - 0.8) < 0.001);
  await page.getByLabel("Columns", { exact: true }).fill("6");
  await page.getByLabel("Thumbnail ratio", { exact: true }).selectOption("1:1");
  pass("column slider/button steps and full-width grid in both aspect ratios");

  await page.getByRole("tab", { name: /Chân dung/, exact: true }).click();
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByLabel("URL", { exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await page.locator("#url-error").waitFor();
  await page
    .getByLabel("URL", { exact: true })
    .fill("https://example.com/portrait");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await page.getByRole("button", { name: "Open link", exact: true }).waitFor();
  await application.evaluate(({ shell }) => {
    global.__opened = [];
    shell.openExternal = async (url) => global.__opened.push(url);
  });
  await page.getByRole("button", { name: "Open link", exact: true }).click();
  assert.deepEqual(await application.evaluate(() => global.__opened), [
    "https://example.com/portrait",
  ]);
  await page.getByRole("tab", { name: "All photos", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Open link", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(
    await page.getByText("Folder links", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("switch", { name: "Show filenames", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  pass(
    "links only in their own tab, URL validation, settings link list removed",
  );

  for (const [name] of fitCases) {
    await page.getByLabel("Search photos", { exact: true }).fill(name);
    const opening = application.waitForEvent("window");
    await page.locator(".photo").first().click();
    const vp = await opening;
    await fitInside(vp);
    await vp.locator(".viewer").dispatchEvent("pointermove");
    await vp
      .getByRole("button", { name: "Zoom in (+)", exact: true })
      .dispatchEvent("click");
    await vp
      .getByRole("button", { name: "Fit to screen (0)", exact: true })
      .dispatchEvent("click");
    await fitInside(vp);
    await vp.locator(".viewer").dispatchEvent("pointermove");
    const browserWindow = await application.browserWindow(vp);
    await browserWindow.evaluate((w) => w.setSize(1000, 700));
    await fitInside(vp);
    await vp.locator(".viewer").dispatchEvent("pointermove");
    await vp
      .getByRole("button", { name: "Fullscreen (F)", exact: true })
      .dispatchEvent("click");
    await vp.waitForFunction(
      async () => (await window.luma.windowState()).fullscreen,
    );
    await fitInside(vp);
    await vp.locator(".viewer").dispatchEvent("pointermove");
    await vp
      .getByRole("button", { name: "Exit fullscreen (F)", exact: true })
      .dispatchEvent("click");
    await vp.waitForFunction(
      async () => !(await window.luma.windowState()).fullscreen,
    );
    await fitInside(vp);
    await vp.locator(".viewer").dispatchEvent("pointermove");
    if (name === "__fit-example.png")
      await vp.screenshot({ path: path.join(evidence, "viewer-fit.png") });
    await vp
      .getByRole("button", { name: "Close viewer (Esc)", exact: true })
      .dispatchEvent("click")
      .catch((error) => {
        if (!vp.isClosed()) throw error;
      });
  }
  await page.getByLabel("Search photos", { exact: true }).fill("");
  const openingViewer = application.waitForEvent("window");
  await page.locator(".photo").first().click();
  const vp = await openingViewer;
  await vp.locator(".viewer").waitFor();
  await vp.waitForFunction(
    () =>
      !document.querySelector(".viewer").classList.contains("controls-visible"),
  );
  await vp.locator(".viewer").dispatchEvent("pointermove");
  await vp.keyboard.press("ArrowRight");
  await fitInside(vp);
  await vp
    .getByRole("button", { name: "Close viewer (Esc)", exact: true })
    .dispatchEvent("click")
    .catch((error) => {
      if (!vp.isClosed()) throw error;
    });
  pass(
    "detached viewer Fit: aspect ratios, resize/fullscreen, auto-hide and navigation",
  );

  await page.getByRole("button", { name: "Organize", exact: true }).click();
  await page.locator(".photo").nth(0).click();
  await page
    .locator(".photo")
    .nth(2)
    .click({ modifiers: ["Shift"] });
  assert.equal(await page.locator(".photo.selected").count(), 3);
  await page.getByRole("button", { name: "Delete 3", exact: true }).click();
  await page.getByRole("button", { name: "Keep photos", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.locator(".photo").nth(0).click();
  await page.locator(".photo").nth(1).click();
  await page.getByRole("button", { name: "Delete 2", exact: true }).click();
  await page
    .getByRole("button", { name: "Move to Recycle Bin", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Move photos to Recycle Bin?", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    (await page.evaluate(() => window.luma.getLibrary())).images.length,
    42,
  );
  await page
    .getByRole("button", { name: "Exit organize", exact: true })
    .click();
  pass("organize range selection, cancel and real Recycle Bin on test copies");

  const testSource = path.join(root, "Chân dung", "Khoảnh khắc 01-08.jpg");
  await fs.mkdir(stressRoot, { recursive: true });
  for (let folder = 1; folder <= 240; folder++) {
    const destination = path.join(
      stressRoot,
      `Folder ${String(folder).padStart(3, "0")}`,
    );
    await fs.mkdir(destination, { recursive: true });
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        try {
          const target = path.join(destination, `Photo ${i + 1}.jpg`);
          try {
            await fs.access(target);
          } catch {
            await fs.copyFile(testSource, target);
          }
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
        }
      }),
    );
  }
  await application.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, stressRoot);
  const start = performance.now();
  await page
    .getByRole("button", { name: "Choose photo folder", exact: true })
    .click();
  await page.waitForFunction(async () => {
    const d = await window.luma.getLibrary();
    return !d.scanning && d.images.length === 4800 && d.folders.length === 240;
  });
  await page
    .getByRole("button", { name: "Choose photo folder", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.querySelector(".titlebar-folder")?.textContent === "stress-v11",
  );
  await waitPhotos(page);
  const loadMs = Math.round(performance.now() - start);
  assert.ok((await page.locator(".folder-tab").count()) < 25);
  assert.ok((await page.locator(".photo").count()) < 100);
  await page.getByRole("button", { name: "Tab order", exact: true }).click();
  for (const tabSort of ["name", "created"])
    for (const tabDirection of ["asc", "desc"]) {
      await page.getByLabel("Sort by", { exact: true }).selectOption(tabSort);
      await page
        .getByLabel("Order", { exact: true })
        .selectOption(tabDirection);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      snapshot = await page.evaluate(() => window.luma.getLibrary());
      assert.equal(
        snapshot.folders.length,
        240,
        JSON.stringify({
          root: snapshot.settings.root,
          scanning: snapshot.scanning,
          error: snapshot.error,
          images: snapshot.images.length,
        }),
      );
      const expected = sortedFolders(snapshot.folders, {
        ...snapshot.settings,
        tabSort,
        tabDirection,
      })[0].id;
      await page.waitForFunction(
        (id) => document.querySelector(".folder-tab")?.dataset.folderId === id,
        expected,
      );
      await page
        .getByRole("button", { name: "Tab order", exact: true })
        .click();
    }
  await page.getByLabel("Sort by", { exact: true }).selectOption("name");
  await page.getByLabel("Order", { exact: true }).selectOption("asc");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const dragged = await page
    .locator(".folder-tab")
    .nth(2)
    .getAttribute("data-folder-id");
  await page
    .locator(".folder-tab")
    .nth(2)
    .dragTo(page.locator(".folder-tab").nth(0), {
      targetPosition: { x: 8, y: 15 },
    });
  await page.waitForFunction(
    (id) => document.querySelector(".folder-tab")?.dataset.folderId === id,
    dragged,
  );
  await page.waitForFunction(async (id) => {
    const d = await window.luma.getLibrary();
    return (
      d.settings.tabSort === "manual" &&
      d.settings.tabOrders[d.settings.root]?.[0] === id
    );
  }, dragged);
  await page.keyboard.press("Control+k");
  await page
    .getByRole("dialog", { name: "Find a folder", exact: true })
    .waitFor();
  assert.ok((await page.locator(".folder-option").count()) < 100);
  await page.getByLabel("Search folders", { exact: true }).fill("240");
  await page.getByRole("button", { name: "Folder 240", exact: true }).click();
  await page.getByRole("tab", { name: "Folder 240", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Folder 240", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.ok((await page.locator(".photo").count()) <= 20);
  await page.getByText("20 photos", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "All photos", exact: true }).click();
  await page
    .locator(".gallery-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForFunction(
    () => Number(document.querySelector(".photo")?.dataset.index) > 4700,
  );
  assert.ok((await page.locator(".photo").count()) < 100);
  pass(
    `240 folders / 4,800 photos: ${loadMs} ms including UI; bounded tabs/grid; four sort modes, drag, search, last rows`,
  );
  const watcherFile = path.join(stressRoot, "Folder 240", "watcher.jpg");
  await fs.copyFile(testSource, watcherFile);
  await page.waitForFunction(
    async () => (await window.luma.getLibrary()).images.length === 4801,
  );
  await fs.unlink(watcherFile);
  await page.waitForFunction(
    async () => (await window.luma.getLibrary()).images.length === 4800,
  );
  await page.getByLabel("Thumbnail ratio", { exact: true }).selectOption("4:5");
  await application.close();
  application = null;
  page = await launch();
  snapshot = await page.evaluate(() => window.luma.getLibrary());
  await page.waitForFunction(
    async () => (await window.luma.getLibrary()).images.length === 4800,
  );
  snapshot = await page.evaluate(() => window.luma.getLibrary());
  assert.equal(snapshot.settings.ratio, "4:5");
  assert.equal(snapshot.settings.tabOrders[snapshot.settings.root][0], dragged);
  pass(
    "ratio/manual order survive restart, native watcher updates changed folder",
  );
  const browserWindow = await application.browserWindow(page);
  await browserWindow.evaluate((w) => {
    w.setMinimumSize(0, 0);
    w.setSize(390, 844);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: path.join(evidence, "gallery-mobile.png") });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Tab order", exact: true }).click();
  await page.screenshot({ path: path.join(evidence, "order-mobile.png") });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  pass("narrow viewport and reduced motion");
  assert.deepEqual(logs, []);
  await fs.writeFile(
    path.join(evidence, "app-test.json"),
    JSON.stringify(
      { passed: true, checks, loadMs, folders: 240, images: 4800, logs },
      null,
      2,
    ),
  );
  console.log("ALL APP CHECKS PASSED");
} catch (error) {
  console.log(JSON.stringify({ logs }, null, 2));
  if (application) {
    const page = (await application.windows())[0];
    if (page)
      await page.screenshot({ path: path.join(evidence, "failure.png") });
  }
  throw error;
} finally {
  if (application) await application.close();
}
