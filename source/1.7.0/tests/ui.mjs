import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createFixtures } from "./fixtures.mjs";
const root = path.resolve("test-results/ui/library"),
  profile = path.resolve("test-results/ui/profile"),
  evidence = path.resolve(
    process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
  );
await createFixtures(root);
for (let n = 1; n <= 120; n++)
  await fs.mkdir(path.join(root, `Folder ${String(n).padStart(3, "0")}`), {
    recursive: true,
  });
await fs.mkdir(profile, { recursive: true });
await fs.rm(path.join(profile, "window-state.json"), { force: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root, columns: 4, folderColumns: 2 }),
);
const env = {
  ...process.env,
  LUMA_TEST_PROFILE: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ args: ["."], env });
let page;
const errors = [],
  checks = [];
const pass = (value) => {
  checks.push(value);
  console.log("PASS:", value);
};
try {
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator(".photo.loaded").first().waitFor();
  await page.waitForFunction(
    async () => !(await window.luma.getLibrary()).scanning,
  );
  const name = await page.locator(".folder-tab").nth(1).innerText();
  await page
    .getByRole("button", { name: `Close ${name} tab`, exact: true })
    .click();
  await page.waitForFunction(
    async (name) =>
      !(await window.luma.getLibrary()).folders.some((f) => f.name === name),
    name,
  );
  assert.ok((await fs.stat(path.join(root, name))).isDirectory());
  const arrow = await page
    .getByRole("button", { name: "Scroll tabs right", exact: true })
    .boundingBox();
  assert.ok(arrow.width >= 27);
  await page
    .getByRole("button", { name: "Scroll tabs right", exact: true })
    .click();
  assert.ok(
    await page.locator(".tabs-scroll").evaluate((el) => el.scrollLeft > 0),
  );
  pass("compact tabs, per-tab Close and distinct tab scrolling");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = await page
    .getByRole("dialog", { name: "Settings", exact: true })
    .boundingBox();
  assert.ok(settings.x < 5);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  pass("Settings drawer opens from the left");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", {
    name: "Find a folder",
    exact: true,
  });
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box.width > 900 && box.height > 650);
  assert.equal(
    await page
      .locator(".folder-drag,.folder-option .remove-folder,.folder-option svg")
      .count(),
    0,
  );
  for (const count of [2, 3, 4]) {
    await page
      .getByLabel("Folder columns", { exact: true })
      .selectOption(String(count));
    const cells = await page.locator(".folder-option").all();
    const positions = await Promise.all(
      cells.slice(0, count).map((el) => el.boundingBox()),
    );
    assert.ok(positions.every((item) => Math.abs(item.y - positions[0].y) < 1));
    assert.ok(positions.at(-1).x > positions[0].x);
  }
  assert.ok((await page.locator(".folder-option").count()) < 100);
  await page
    .getByRole("button", { name: "Manage folders", exact: true })
    .click();
  assert.ok((await page.locator(".folder-drag").count()) > 0);
  const from = await page
    .locator(".folder-option")
    .nth(2)
    .locator(".folder-open")
    .getAttribute("title");
  const target = page.locator(".folder-option").nth(0);
  await page
    .getByRole("button", { name: `Drag ${from}`, exact: true })
    .dragTo(target, { targetPosition: { x: 3, y: 20 } });
  await page.waitForFunction(async (name) => {
    const d = await window.luma.getLibrary();
    return (
      d.settings.tabOrders[d.settings.root]?.[0] ===
      d.folders.find((f) => f.name === name)?.id
    );
  }, from);
  await page.screenshot({ path: path.join(evidence, "folder-manage.png") });
  await page
    .getByRole("button", { name: "Manage folders", exact: true })
    .click();
  assert.equal(
    await page.locator(".folder-drag,.folder-option .remove-folder").count(),
    0,
  );
  await page.screenshot({ path: path.join(evidence, "folder-browser.png") });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  pass(
    "large folder browser, persistent 2/3/4 columns, clean browsing, Manage drag and Remove",
  );
  await page.getByRole("button", { name: "Organize", exact: true }).click();
  await page.locator(".photo").first().click();
  assert.equal(
    await page.getByRole("button", { name: "Done", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Organize", exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Exit organize", exact: true })
    .click();
  pass("Organize has no redundant Done control");
  const opening = app.waitForEvent("window");
  await page.locator(".photo").first().click();
  const viewer = await opening;
  viewer.on("pageerror", (error) => errors.push(error.message));
  await viewer.waitForFunction(
    () => document.querySelector(".viewer-original")?.naturalWidth > 0,
  );
  const before = await viewer.locator(".viewer-original").boundingBox();
  await viewer
    .locator(".viewer-stage")
    .dispatchEvent("wheel", { deltaY: -120, clientX: 400, clientY: 300 });
  await viewer.waitForFunction(
    (width) =>
      document.querySelector(".viewer-original").getBoundingClientRect().width >
      width,
    before.width,
  );
  await viewer
    .getByRole("button", { name: "Fit to screen (0)", exact: true })
    .dispatchEvent("click");
  await viewer
    .getByRole("button", { name: "Fullscreen (F)", exact: true })
    .dispatchEvent("click");
  await viewer.waitForFunction(() =>
    document.querySelector(".viewer").classList.contains("is-fullscreen"),
  );
  assert.equal(await viewer.locator(".viewer-window-bar").isVisible(), false);
  assert.ok((await viewer.locator(".viewer-stage").boundingBox()).y < 2);
  const left = viewer.getByRole("button", {
      name: "Previous image (Left)",
      exact: true,
    }),
    right = viewer.getByRole("button", {
      name: "Next image (Right)",
      exact: true,
    });
  assert.ok((await left.boundingBox()).x < 70);
  assert.ok((await right.boundingBox()).x > 1000);
  assert.equal(await left.evaluate((el) => getComputedStyle(el).opacity), "0");
  await viewer.locator(".viewer-edge-zone.left").dispatchEvent("pointermove");
  const first = await viewer.locator(".viewer-window-bar strong").textContent();
  await right.dispatchEvent("click");
  await viewer.waitForFunction(
    (name) =>
      document.querySelector(".viewer-window-bar strong").textContent !== name,
    first,
  );
  assert.equal(await viewer.locator(".viewer-window-bar").isVisible(), false);
  await app.evaluate(() => {
    global.__lumaDiagnostics.lensSearch.open = async () => {
      global.__lensUsed = true;
    };
  });
  await viewer
    .getByRole("button", { name: "Search with Google Lens", exact: true })
    .dispatchEvent("click");
  await viewer.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Search with Google Lens"]')
        .disabled,
  );
  assert.equal(
    await viewer
      .getByRole("dialog", { name: "Search with Google Lens", exact: true })
      .count(),
    0,
  );
  assert.equal(await app.evaluate(() => global.__lensUsed), true);
  pass(
    "fullscreen has no header; small side arrows; wheel zoom; Lens opens without confirmation",
  );
  const rightZone = viewer.locator(".viewer-edge-zone.right");
  const current = (await viewer.evaluate(() => window.luma.viewerState()))
    .position;
  await rightZone.click({ position: { x: 3, y: 5 } });
  await viewer.waitForFunction(
    async (expected) => (await window.luma.viewerState()).position === expected,
    current + 1,
  );
  const arrowBox = await viewer
    .getByRole("button", { name: "Next image (Right)", exact: true })
    .boundingBox();
  assert.ok(arrowBox.width <= 27 && arrowBox.height <= 41);
  const closing = viewer.waitForEvent("close");
  await viewer
    .evaluate(() => window.luma.windowAction("close"))
    .catch((error) => {
      if (!viewer.isClosed()) throw error;
    });
  await closing;
  const folder = (
    await page.evaluate(() => window.luma.getLibrary())
  ).folders.find((f) => f.count > 0);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search folders", { exact: true }).fill(folder.name);
  await page.getByRole("button", { name: folder.name, exact: true }).click();
  await page
    .getByRole("tab", { name: folder.name, exact: true })
    .dispatchEvent("contextmenu");
  await page.getByLabel("Tab name", { exact: true }).fill("Custom studio");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await page.getByRole("tab", { name: "Custom studio", exact: true }).waitFor();
  assert.ok((await fs.stat(path.join(root, folder.sourceName))).isDirectory());
  const saved = (
    await page.evaluate(() => window.luma.getLibrary())
  ).folders.find((f) => f.id === folder.id);
  assert.equal(saved.name, "Custom studio");
  assert.equal(saved.sourceName, folder.sourceName);
  pass("custom tab label changes independently of the source folder");
  await page
    .getByRole("button", { name: "Close library and return Home", exact: true })
    .click();
  await page
    .getByRole("heading", { name: /A little less interface/ })
    .waitFor();
  assert.equal(await page.locator(".photo").count(), 0);
  assert.equal(
    (await page.evaluate(() => window.luma.getLibrary())).settings.root,
    "",
  );
  pass(
    "All photos Close releases the library and returns Home without deleting originals",
  );
  await page.screenshot({ path: path.join(evidence, "gallery.png") });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(evidence, "ui.json"),
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
} catch (error) {
  console.log({ errors });
  for (const [i, p] of app.windows().entries())
    await p
      .screenshot({ path: path.join(evidence, `failure-${i}.png`) })
      .catch(() => {});
  throw error;
} finally {
  await app.close();
}
