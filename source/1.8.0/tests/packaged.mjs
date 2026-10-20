import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createFixtures } from "./fixtures.mjs";

const executable = path.resolve(
  process.env.LUMA_PACKAGED_EXE || "../work/release/win-unpacked/Luma.exe",
);
const fixtureRoot = path.resolve(
  process.env.LUMA_TEST_LIBRARY || "test-results/library",
);
if (!process.env.LUMA_TEST_LIBRARY) await createFixtures(fixtureRoot);
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
const profile = path.resolve(
  "test-results",
  path.basename(executable).includes("Windows")
    ? "portable-profile"
    : "packaged-profile",
);
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({
    root: fixtureRoot,
    thumbnailSize: 220,
    links: {
      [path.join(fixtureRoot, "Chân dung")]: "https://example.com/my-gallery",
    },
  }),
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath: executable,
  args: [`--user-data-dir=${profile}`],
  env,
  timeout: 60000,
});
const errors = [];
try {
  const page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.getByRole("tab", { name: "All photos", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".photo img").length > 0 &&
      [...document.querySelectorAll(".photo img")].every(
        (img) => img.complete && img.naturalWidth,
      ),
  );
  const info = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    profile: app.getPath("userData"),
  }));
  assert.equal(info.packaged, true);
  assert.equal(
    (await page.evaluate(() => window.luma.updateState())).mode,
    "installed",
  );
  assert.equal(
    await application.evaluate(() =>
      global.__lumaDiagnostics.nativeImageLoadedInMain(),
    ),
    false,
  );
  assert.equal(info.profile.toLowerCase(), profile.toLowerCase());
  const snapshot = await page.evaluate(() => window.luma.getLibrary());
  assert.equal(snapshot.folders.length, 5);
  assert.ok(snapshot.images.length >= 30);
  const cache = await page.evaluate(() => window.luma.cacheInfo());
  assert.ok(cache > 0, "Sharp native thumbnail output should exist");
  await page.mouse.move(20, 20);
  await page.screenshot({
    path: path.join(
      evidence,
      path.basename(executable).includes("Windows")
        ? "portable-gallery.png"
        : "packaged-gallery.png",
    ),
  });
  const opening = application.waitForEvent("window");
  await page.locator(".photo").first().click();
  const vp = await opening;
  await vp.waitForFunction(
    () => document.querySelector(".viewer-original")?.naturalWidth > 0,
  );
  await vp
    .getByRole("button", { name: "Close viewer (Esc)", exact: true })
    .dispatchEvent("click")
    .catch((error) => {
      if (!vp.isClosed()) throw error;
    });
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    executable,
    packaged: info.packaged,
    profile: info.profile,
    images: snapshot.images.length,
    folders: snapshot.folders.length,
    cacheBytes: cache,
    errors,
  };
  await fs.writeFile(
    path.join(
      evidence,
      path.basename(executable).includes("Windows")
        ? "portable-smoke.json"
        : "packaged-smoke.json",
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await application.close();
}
