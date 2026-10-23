// All third-party native image decoding lives in this expendable utility process.
const fs = require("node:fs/promises");
const sharp = require("sharp");
const { pipelineFor, details } = require("./image-details.cjs");
sharp.cache(false);
sharp.concurrency(1);
const MAX_PIXELS = 64 * 1024 * 1024;

// Read only sampled rows for ordinary Windows BMPs. libvips does not decode BMP.
async function bitmap(file, edge) {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(160);
    await handle.read(header, 0, header.length, 0);
    if (header.toString("ascii", 0, 2) !== "BM" || header.readUInt32LE(14) < 40)
      throw new Error("Unsupported BMP header.");
    const width = header.readInt32LE(18),
      signedHeight = header.readInt32LE(22),
      height = Math.abs(signedHeight),
      bits = header.readUInt16LE(28),
      compression = header.readUInt32LE(30),
      offset = header.readUInt32LE(10);
    if (
      width < 1 ||
      height < 1 ||
      width * height > MAX_PIXELS ||
      ![1, 4, 8, 16, 24, 32].includes(bits) ||
      ![0, 3].includes(compression)
    )
      throw new Error("This BMP cannot be previewed safely.");
    const scale = Math.min(1, edge / width, edge / height),
      outWidth = Math.max(1, Math.round(width * scale)),
      outHeight = Math.max(1, Math.round(height * scale));
    const stride = Math.ceil((width * bits) / 32) * 4,
      row = Buffer.alloc(stride),
      output = Buffer.alloc(outWidth * outHeight * 3);
    let palette;
    if (bits <= 8) {
      const colors = header.readUInt32LE(46) || 2 ** bits;
      if (colors > 2 ** bits) throw new Error("Invalid BMP palette size.");
      palette = Buffer.alloc(4 * colors);
      await handle.read(
        palette,
        0,
        palette.length,
        14 + header.readUInt32LE(14),
      );
    }
    const masks =
      compression === 3
        ? [
            header.readUInt32LE(54),
            header.readUInt32LE(58),
            header.readUInt32LE(62),
          ]
        : bits === 16
          ? [0x7c00, 0x03e0, 0x001f]
          : [0xff0000, 0xff00, 0xff];
    const channel = (value, mask) => {
      if (!mask) return 0;
      let shift = 0;
      while (((mask >>> shift) & 1) === 0) shift++;
      const range = mask >>> shift;
      return Math.round((((value & mask) >>> shift) * 255) / range);
    };
    for (let y = 0; y < outHeight; y++) {
      const sourceY = Math.min(height - 1, Math.floor(y / scale)),
        diskY = signedHeight > 0 ? height - sourceY - 1 : sourceY;
      const result = await handle.read(row, 0, stride, offset + diskY * stride);
      if (result.bytesRead < stride) throw new Error("Truncated BMP.");
      for (let x = 0; x < outWidth; x++) {
        const sx = Math.min(width - 1, Math.floor(x / scale)),
          out = (y * outWidth + x) * 3;
        if (bits <= 8) {
          const value =
            bits === 8
              ? row[sx]
              : bits === 4
                ? (row[sx >> 1] >> (sx % 2 ? 0 : 4)) & 15
                : (row[sx >> 3] >> (7 - (sx % 8))) & 1;
          const p = value * 4;
          if (p + 2 >= palette.length) throw new Error("Invalid BMP palette.");
          output[out] = palette[p + 2];
          output[out + 1] = palette[p + 1];
          output[out + 2] = palette[p];
        } else if (bits === 24) {
          const p = sx * 3;
          output[out] = row[p + 2];
          output[out + 1] = row[p + 1];
          output[out + 2] = row[p];
        } else {
          const value =
            bits === 16 ? row.readUInt16LE(sx * 2) : row.readUInt32LE(sx * 4);
          output[out] = channel(value, masks[0]);
          output[out + 1] = channel(value, masks[1]);
          output[out + 2] = channel(value, masks[2]);
        }
      }
    }
    return sharp(output, {
      raw: { width: outWidth, height: outHeight, channels: 3 },
    });
  } finally {
    await handle.close();
  }
}

let busy = false;
process.parentPort.on("message", async (event) => {
  const job = event.data;
  if (job.kind !== "decode" || busy) return;
  busy = true;
  const monitor = setInterval(() => {
    if (process.memoryUsage().rss > 448 * 1024 * 1024) {
      process.parentPort.postMessage({ kind: "memory-limit", id: job.id });
      process.exit(71);
    }
  }, 150);
  try {
    if (job.edge === "info") {
      await fs.writeFile(
        job.temp,
        JSON.stringify(await details(job.file, sharp)),
      );
    } else {
      const pipeline = /\.bmp$/i.test(job.file)
        ? await bitmap(job.file, job.edge)
        : await pipelineFor(job.file, sharp);
      await pipeline
        .resize(job.edge, job.edge, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 2 })
        .toFile(job.temp);
    }
    await fs.rename(job.temp, job.destination);
    process.parentPort.postMessage({
      kind: "result",
      id: job.id,
      ok: true,
      rss: process.memoryUsage().rss,
    });
  } catch (error) {
    await fs.rm(job.temp, { force: true }).catch(() => {});
    process.parentPort.postMessage({
      kind: "result",
      id: job.id,
      ok: false,
      error: error.message,
      rss: process.memoryUsage().rss,
    });
  } finally {
    clearInterval(monitor);
    busy = false;
  }
});
process.parentPort.postMessage({ kind: "ready" });
