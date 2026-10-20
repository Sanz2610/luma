import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
const root = path.resolve("test-results/library"),
  profile = path.resolve("test-results/startup-v13"),
  evidence = path.resolve(
    process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
  );
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root, thumbnailSize: 220 }),
);
const { createFixtures } = await import("./fixtures.mjs");
await createFixtures(root);
const results = [];
for (const type of ["direct", "portable", "direct", "portable"]) {
  const exe = path.resolve(
      type === "direct"
        ? "../work/release/win-unpacked/Luma.exe"
        : "../work/release/Luma-1.6.1-Windows.exe",
    ),
    port = type === "direct" ? 9363 : 9364;
  const env = { ...process.env, LUMA_TEST_HEADLESS: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const start = performance.now(),
    child = spawn(
      exe,
      [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`],
      { env, windowsHide: true, stdio: "ignore" },
    );
  let browser, page;
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) throw new Error("App did not start.");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    page =
      browser.contexts()[0].pages()[0] ||
      (await browser.contexts()[0].waitForEvent("page"));
    await page.locator(".photo").first().waitFor();
    const uiMs = Math.round(performance.now() - start);
    await page.locator(".photo.loaded").first().waitFor();
    const firstThumbnailMs = Math.round(performance.now() - start);
    results.push({ type, uiMs, firstThumbnailMs });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    if (page)
      await page
        .evaluate(() => window.luma.windowAction("close"))
        .catch(() => {});
    if (browser) await browser.close();
    await new Promise((r) => setTimeout(r, 350));
  }
}
await fs.writeFile(
  path.join(evidence, "startup.json"),
  JSON.stringify(
    {
      note: "Warm local machine samples. Direct launch uses the same executable layout as an installation; installer itself was not run.",
      results,
    },
    null,
    2,
  ),
);
