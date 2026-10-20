import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(
  process.env.LUMA_TEST_LIBRARY || "test-results/stress-v11",
);
const profile = path.resolve("test-results/stability-v13");
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root, thumbnailSize: 160, gap: "compact" }),
);
const env = {
  ...process.env,
  LUMA_TEST_PROFILE: profile,
  LUMA_TEST_HEADLESS: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const application = await _electron.launch({ args: ["."], env });
const errors = [],
  memory = [];
const rounds = Number(process.env.LUMA_STRESS_ROUNDS || 6);
let result;
try {
  const page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("tab", { name: "All photos", exact: true }).waitFor();
  await page.waitForFunction(async () => {
    const d = await window.luma.getLibrary();
    return !d.scanning && d.images.length > 0;
  });
  await page.locator(".photo.loaded").first().waitFor({ timeout: 30000 });
  const data = await page.evaluate(() => window.luma.getLibrary());
  const metrics = () =>
    application.evaluate(({ app }) => ({
      processes: app.getAppMetrics().map((p) => ({
        pid: p.pid,
        type: p.type,
        name: p.name,
        workingSetKB: p.memory.workingSetSize,
        privateKB: p.memory.privateBytes,
      })),
      thumbnails: global.__lumaDiagnostics.thumbnailService.snapshot(),
    }));
  memory.push(await metrics());
  // Many large jumps and tab changes while the real decoder is still busy.
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < 32; i++) {
      await page.locator(".gallery-scroll").evaluate(
        (el, fraction) => {
          el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
        },
        ((i * 17 + round * 5) % 32) / 31,
      );
      if (i % 4 === 0) {
        const tabs = page.locator(".folder-tab");
        if (await tabs.count())
          await tabs.nth((i / 4) % Math.min(5, await tabs.count())).click();
        await page
          .getByRole("tab", { name: "All photos", exact: true })
          .click();
      }
    }
    memory.push(await metrics());
    console.log(`Completed rapid-scroll round ${round + 1}/${rounds}`);
  }
  await page.getByRole("button", { name: "Go to bottom", exact: true }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector(".gallery-scroll");
    return el.scrollTop >= el.scrollHeight - el.clientHeight - 2;
  });
  await page.getByRole("button", { name: "Go to top", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".gallery-scroll").scrollTop === 0,
  );
  // Verify a real utility-process termination is isolated from the UI.
  const validId = await page
    .locator(".photo.loaded")
    .first()
    .getAttribute("data-id");
  const killed = await application.evaluate(() => {
    const service = global.__lumaDiagnostics.thumbnailService;
    const child = service.worker;
    if (!child) return false;
    child.kill();
    return true;
  });
  if (killed) {
    await page.waitForFunction(() => !!window.luma);
    await page
      .getByRole("button", { name: "Go to bottom", exact: true })
      .click();
    await page.locator(".photo.loaded").first().waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByRole("tab", { name: "All photos", exact: true }).count(),
      1,
    );
    const recovered = await page.evaluate(
      async (id) =>
        await window.luma.loadThumbnail(id, crypto.randomUUID(), 512),
      validId,
    );
    assert.ok(
      recovered.data?.length > 0,
      "A new decoder should serve a preview after the previous worker exits",
    );
  }
  await page.waitForFunction(async () => {
    await new Promise((r) => setTimeout(r, 100));
    return true;
  });
  memory.push(await metrics());
  const diagnostic = memory.at(-1).thumbnails;
  assert.ok(diagnostic.peakQueued <= 32);
  assert.ok(diagnostic.active <= 1);
  assert.deepEqual(errors, []);
  const mainMetrics = memory.map(
    (m) => m.processes.find((p) => p.type === "Browser")?.workingSetKB || 0,
  );
  result = {
    passed: true,
    rootName: path.basename(root),
    photos: data.images.length,
    folders: data.folders.length,
    jumps: rounds * 32,
    tabChanges: rounds * 16,
    forcedWorkerExitSurvived: killed,
    mainWorkingSetPeakMB: Math.round(Math.max(...mainMetrics) / 1024),
    diagnostic,
    memory,
    errors,
  };
  await fs.writeFile(
    path.join(
      evidence,
      process.env.LUMA_TEST_LIBRARY
        ? "real-library-stability.json"
        : "stability.json",
    ),
    JSON.stringify(result, null, 2),
  );
  await page.screenshot({ path: path.join(evidence, "stability.png") });
  console.log(JSON.stringify({ ...result, memory: undefined }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ errors, memory: memory.at(-1) }, null, 2));
  const pages = application.windows();
  if (pages[0])
    await pages[0].screenshot({ path: path.join(evidence, "failure.png") });
  throw error;
} finally {
  await application.close();
}
