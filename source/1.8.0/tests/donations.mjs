import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import jsQR from "jsqr";
import assert from "node:assert/strict";
const donations = JSON.parse(
  await fs.readFile("electron/donations.json", "utf8"),
);
const results = [];
for (const method of ["hdbank", "techcombank", "momo"]) {
  const { data, info } = await sharp(`src/assets/donate/${method}.png`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.ok(decoded, method + " QR must decode from the actual shipped asset");
  const payload = decoded.data;
  let crc = 0xffff;
  for (const byte of Buffer.from(payload.slice(0, -4))) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  assert.equal(
    crc.toString(16).toUpperCase().padStart(4, "0"),
    payload.slice(-4),
    method + " QR checksum",
  );
  if (donations.banks[method])
    assert.ok(
      payload.includes(donations.banks[method].account),
      method + " QR matches displayed account",
    );
  results.push({
    method,
    decoded: true,
    crcValid: true,
    accountMatches: donations.banks[method] ? true : undefined,
  });
}
const evidence = path.resolve(
  process.env.LUMA_TEST_EVIDENCE || "test-results/evidence",
);
await fs.mkdir(evidence, { recursive: true });
await fs.writeFile(
  path.join(evidence, "donations.json"),
  JSON.stringify({ passed: true, results }, null, 2),
);
console.log({ passed: true, results });
