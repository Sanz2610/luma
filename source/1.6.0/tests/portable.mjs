import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createFixtures } from "./fixtures.mjs";

const exe = path.resolve("../work/release/Luma-1.6.0-Windows.exe");
const profile = path.resolve("test-results/portable-profile");
const root = path.resolve(
  process.env.LUMA_TEST_LIBRARY || "test-results/library",
);
if (!process.env.LUMA_TEST_LIBRARY) await createFixtures(root);
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
await fs.mkdir(profile, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({
    root,
    thumbnailSize: 220,
    ratio: "4:5",
    links: { [path.join(root, "Chân dung")]: "https://example.com/portrait" },
  }),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  exe,
  [`--user-data-dir=${profile}`, "--remote-debugging-port=9351"],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser, page;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:9351/json/version");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  assert.equal(ready, true, "Portable app should start its Electron process");
  browser = await chromium.connectOverCDP("http://127.0.0.1:9351");
  const context = browser.contexts()[0];
  page = context.pages()[0] || (await context.waitForEvent("page"));
  await page.getByRole("tab", { name: "All photos", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".photo img").length > 0 &&
      [...document.querySelectorAll(".photo img")].every(
        (img) => img.complete && img.naturalWidth,
      ),
  );
  const data = await page.evaluate(() => window.luma.getLibrary());
  assert.equal(
    (await page.evaluate(() => window.luma.updateState())).mode,
    "portable",
  );
  assert.equal(data.folders.length, 5);
  assert.ok(data.images.length >= 30);
  await page.getByRole("button", { name: "Go to bottom", exact: true }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector(".gallery-scroll");
    return el.scrollTop >= el.scrollHeight - el.clientHeight - 2;
  });
  await page.getByRole("button", { name: "Go to top", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".gallery-scroll").scrollTop === 0,
  );
  assert.equal(
    await page
      .locator(".photo")
      .first()
      .evaluate((el) => getComputedStyle(el).borderRadius),
    "0px",
  );
  const tile = await page.locator(".photo").first().boundingBox();
  assert.ok(Math.abs(tile.width / tile.height - 0.8) < 0.001);
  const opening = context.waitForEvent("page");
  await page.locator(".photo").first().click();
  const vp = await opening;
  await vp.waitForFunction(
    () => document.querySelector(".viewer-original")?.naturalWidth > 0,
  );
  const image = await vp.locator(".viewer-original").boundingBox(),
    stage = await vp.locator(".viewer-stage").boundingBox();
  assert.ok(image.width <= stage.width + 1 && image.height <= stage.height + 1);
  await vp.screenshot({ path: path.join(evidence, "portable-viewer.png") });
  await vp
    .getByRole("button", { name: "Close viewer (Esc)", exact: true })
    .dispatchEvent("click")
    .catch((error) => {
      if (!vp.isClosed()) throw error;
    });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".photo").length > 0 &&
      [...document.querySelectorAll(".photo")].every((el) =>
        el.classList.contains("loaded"),
      ),
  );
  const cache = await page.evaluate(() => window.luma.cacheInfo());
  assert.ok(cache > 0);
  await page.mouse.move(20, 20);
  await page.screenshot({ path: path.join(evidence, "portable-gallery.png") });
  const result = {
    passed: true,
    executable: exe,
    folders: data.folders.length,
    images: data.images.length,
    cacheBytes: cache,
    note: "Launched actual portable wrapper, attached to resulting Electron process; local thumbnail and full-image viewer passed.",
  };
  await fs.writeFile(
    path.join(evidence, "portable-smoke.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (page)
    await page
      .evaluate(() => window.luma.windowAction("close"))
      .catch(() => {});
  if (browser) await browser.close();
}
