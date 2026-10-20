import { createRequire } from "node:module";
import { chromium } from "playwright";
import sharp from "sharp";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url),
  { LensSearch } = require("../electron/lens.cjs");
let opened;
const service = new LensSearch(async (url) => {
  opened = url;
});
// Only a generated test graphic is used for the optional network check.
const preview = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#3d6175"/><circle cx="150" cy="90" r="50" fill="#f2c46b"/></svg>',
  ),
)
  .webp()
  .toBuffer();
const browser = await chromium.launch({ headless: true });
try {
  await service.open(preview);
  const page = await browser.newPage();
  let uploaded = false;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().startsWith("https://lens.google.com/v3/upload")
    )
      uploaded = true;
  });
  await page.goto(opened, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForURL((url) => url.hostname.endsWith("google.com"), {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  });
  assert.equal(uploaded, true);
  const result = {
    passed: true,
    syntheticImageOnly: true,
    uploadSubmitted: true,
    resultHost: new URL(page.url()).hostname,
    resultPath: new URL(page.url()).pathname,
  };
  await fs.mkdir(
    path.resolve(process.env.LUMA_TEST_EVIDENCE || "test-results/evidence"),
    { recursive: true },
  );
  await fs.writeFile(
    path.join(
      path.resolve(process.env.LUMA_TEST_EVIDENCE || "test-results/evidence"),
      "lens.json",
    ),
    JSON.stringify(result, null, 2),
  );
  console.log(result);
} finally {
  service.close();
  await browser.close();
}
