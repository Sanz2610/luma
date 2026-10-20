import { _electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const profile = path.resolve("test-results/about/profile");
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
await fs.mkdir(profile, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({ root: "" }),
);
const env = { ...process.env, LUMA_TEST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ args: ["."], env });
const errors = [];
try {
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ shell, clipboard }) => {
    global.__aboutLinks = [];
    global.__aboutAccounts = [];
    clipboard.writeText = (value) => global.__aboutAccounts.push(value);
    shell.openExternal = async (url) => {
      global.__aboutLinks.push(url);
    };
  });
  await page.locator('.rail [aria-label="About Luma"]').click();
  const dialog = page.getByRole("dialog", { name: "About Luma", exact: true });
  await dialog.waitFor();
  assert.equal(
    await page.locator(".workspace").evaluate((el) => el.inert),
    true,
  );
  await dialog.getByRole("button", { name: "GitHub", exact: true }).click();
  await dialog.getByRole("button", { name: "Developer", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Source code", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Releases", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Third-party notices", exact: true })
    .click();
  const urls = await app.evaluate(() => global.__aboutLinks);
  assert.deepEqual(urls, [
    "https://github.com/Sanz2610/luma",
    "https://github.com/Sanz2610",
    "https://github.com/Sanz2610/luma/tree/main/source/1.6.1",
    "https://github.com/Sanz2610/luma/releases/latest",
    "https://github.com/Sanz2610/luma/releases/latest/download/THIRD_PARTY_NOTICES.txt",
  ]);
  await assert.rejects(
    page.evaluate(() => window.luma.openProjectLink("https://example.com")),
    /Unknown project link/,
  );
  await assert.rejects(
    page.evaluate(() => window.luma.openProjectLink("__proto__")),
    /Unknown project link/,
  );
  await page.screenshot({ path: path.join(evidence, "about-desktop.png") });
  await dialog.getByText("MIT License", { exact: true }).click();
  assert.match(
    await dialog.locator("pre").innerText(),
    /Copyright \(c\) 2026 Sanz2610/,
  );
  await dialog.locator(".about-license summary").click();
  await dialog.locator(".about-donate summary").click();
  await dialog.getByRole("button", { name: "PayPal", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Copy account number", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Techcombank", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Copy account number", exact: true })
    .click();
  assert.deepEqual(await app.evaluate(() => global.__aboutAccounts), [
    "051704070016617",
    "19036932399011",
  ]);
  assert.equal(
    await app.evaluate(() => global.__aboutLinks.at(-1)),
    "https://paypal.me/PhanVanLap",
  );
  await assert.rejects(
    page.evaluate(() => window.luma.copyDonationAccount("__proto__")),
    /Unknown donation account/,
  );
  await dialog.getByRole("button", { name: "MoMo", exact: true }).click();
  await dialog.locator(".donate-content").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, "about-donate.png") });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .locator('.rail [aria-label="About Luma"]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  const native = await app.browserWindow(page);
  await native.evaluate((win) => {
    win.unmaximize();
    win.setMinimumSize(320, 500);
    win.setSize(390, 844);
  });
  await page.locator(".mobile-about").click();
  await dialog.waitFor();
  assert.ok(
    (await dialog.boundingBox()).width <=
      (await page.evaluate(() => innerWidth)),
  );
  await page.screenshot({ path: path.join(evidence, "about-narrow.png") });
  await dialog.locator(".about-license summary").click();
  await dialog.locator("pre").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, "about-license.png") });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(evidence, "about.json"),
    JSON.stringify(
      {
        passed: true,
        urls,
        errors,
        checks: [
          "sidebar About, attribution/version, local MIT text",
          "allowlisted external links; arbitrary URLs/prototype keys rejected",
          "modal keyboard focus and narrow layout",
        ],
      },
      null,
      2,
    ),
  );
  console.log({ passed: true, urls, errors });
} finally {
  await app.close();
}
