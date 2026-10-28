import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
const base = path.resolve("test-results/nested"),
  root = path.join(base, "A"),
  profile = path.join(base, "profile"),
  evidence = path.resolve(
    process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
  );
for (const name of ["B/E/Deep", "B/F", "B/G", "C", "D"])
  await fs.mkdir(path.join(root, name), { recursive: true });
for (const [folder, name] of [
  ["B/E/Deep", "deep.jpg"],
  ["B/E", "e.jpg"],
  ["B/F", "f.jpg"],
  ["C", "c.jpg"],
])
  await sharp({
    create: { width: 400, height: 500, channels: 3, background: "#9a8bb7" },
  })
    .jpeg()
    .toFile(path.join(root, folder, name));
for (let n = 0; n < 400; n++)
  await fs.mkdir(path.join(root, "B", `Extra ${String(n).padStart(3, "0")}`), {
    recursive: true,
  });
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root, columns: 6 }),
);
await fs.rm(path.join(profile, "window-state.json"), { force: true });
const env = { ...process.env, LUMA_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ args: ["."], env });
const checks = [],
  errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(async () => {
    const data = await window.luma.getLibrary();
    return !data.scanning && data.images.length === 4;
  });
  await page.getByRole("tab", { name: "B", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".photo-count").textContent.includes("3 photos"),
  );
  assert.equal(
    await page.getByRole("tab").count(),
    4,
    "nested folders do not become tabs",
  );
  await page
    .getByRole("button", { name: "Browse subfolders", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Subfolders", exact: true });
  await dialog.waitFor();
  assert.ok(
    (await dialog.locator(".subfolder-row").count()) < 30,
    "400 children are virtualized",
  );
  await page.screenshot({ path: path.join(evidence, "subfolders-menu.png") });
  await dialog.getByLabel("Search subfolders", { exact: true }).fill("Deep");
  await dialog.locator(".subfolder-open").click();
  await page.waitForFunction(() =>
    document.querySelector(".photo-count").textContent.includes("1 photos"),
  );
  assert.equal(await page.locator(".directory-button").innerText(), "B/E/Deep");
  assert.equal(
    await page
      .getByRole("tab", { name: "B", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page
    .getByRole("button", { name: "Browse subfolders", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Parent folder", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Show all photos in E", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".photo-count").textContent.includes("2 photos"),
  );
  await page.screenshot({ path: path.join(evidence, "subfolders-filter.png") });
  await page.getByRole("tab", { name: "B", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".photo-count").textContent.includes("3 photos"),
  );
  checks.push(
    "nested-only root displays descendants; top tab aggregates branches; footer popup searches/drills and filters recursively; same tab clears nested scope",
  );
  await page
    .getByRole("button", { name: "Larger thumbnails", exact: true })
    .click();
  await page.waitForFunction(
    async () => (await window.luma.getLibrary()).settings.columns === 5,
  );
  await page
    .getByRole("button", { name: "Smaller thumbnails", exact: true })
    .click();
  await page.waitForFunction(
    async () => (await window.luma.getLibrary()).settings.columns === 6,
  );
  assert.equal(await page.locator(".size-control output").count(), 0);
  await page.getByLabel("Thumbnail size", { exact: true }).fill("12");
  await page.waitForFunction(
    async () => (await window.luma.getLibrary()).settings.columns === 1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Larger thumbnails", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Thumbnail size", { exact: true }).fill("1");
  await page.waitForFunction(
    async () => (await window.luma.getLibrary()).settings.columns === 12,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Smaller thumbnails", exact: true })
      .isDisabled(),
    true,
  );
  checks.push(
    "plus grows tiles by removing a column; minus shrinks tiles; slider grows to the right and bounds disable correctly; no visible column counter",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.match(await page.locator(".cache-section").innerText(), /1 GB/);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const rootOnly = path.join(base, "Only A");
  await fs.mkdir(rootOnly, { recursive: true });
  await fs.cp(path.join(root, "B"), path.join(rootOnly, "B"), {
    recursive: true,
  });
  await app.evaluate(({ dialog }, root) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [root],
    });
  }, rootOnly);
  await page
    .getByRole("button", { name: "Choose photo folder", exact: true })
    .click();
  await page.waitForFunction(async (root) => {
    const data = await window.luma.getLibrary();
    return (
      data.settings.root === root &&
      !data.scanning &&
      data.images.length === 3 &&
      document.querySelector(".titlebar-folder")?.title === root &&
      document.querySelector(".folder-tab")?.dataset.folderId ===
        data.folders[0].id
    );
  }, rootOnly);
  await page.getByRole("button", { name: "Close B tab", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your folders are hidden", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(evidence, "hidden-library.png") });
  await page
    .getByRole("button", { name: "Hidden folders (1)", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore B", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".photo-count").textContent.includes("3 photos"),
  );
  checks.push(
    "all-hidden library explains empty state and opens Hidden directly; restore reveals descendants without changing originals",
  );
  const native = await app.browserWindow(page);
  await native.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(320, 500);
    win.setSize(390, 844);
  });
  await page
    .getByRole("button", { name: "Browse subfolders", exact: true })
    .click();
  await dialog.waitFor();
  await page.screenshot({ path: path.join(evidence, "subfolders-narrow.png") });
  assert.ok(
    (await dialog.boundingBox()).width <=
      (await page.evaluate(() => innerWidth)),
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(evidence, "folders.json"),
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log({ passed: true, checks });
} catch (error) {
  const page = app.windows()[0];
  if (page) {
    console.log(
      await page.evaluate(async () => ({
        data: await window.luma.getLibrary(),
        toast: document.querySelector(".toast")?.textContent,
      })),
    );
    await page
      .screenshot({ path: path.join(evidence, "folders-failure.png") })
      .catch(() => {});
  }
  throw error;
} finally {
  await app.close();
}
