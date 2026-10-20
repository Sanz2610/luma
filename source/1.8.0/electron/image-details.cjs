const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { isRaw } = require("./image-formats.cjs");
const MAX_PIXELS = 64 * 1024 * 1024;

async function exiftool(file, args, binary = false) {
  const executable = require("exiftool-vendored.exe").replace(
    "app.asar",
    "app.asar.unpacked",
  );
  return new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      ["-charset", "filename=UTF8", ...args, "--", file],
      {
        windowsHide: true,
        timeout: 8000,
        maxBuffer: binary ? 48 * 1024 * 1024 : 128 * 1024,
        encoding: binary ? "buffer" : "utf8",
      },
      (error, stdout) =>
        error
          ? reject(new Error("Image metadata could not be read."))
          : resolve(stdout),
    );
    process.parentPort?.postMessage({ kind: "decoder-child", pid: child.pid });
    child.once("exit", () =>
      process.parentPort?.postMessage({ kind: "decoder-child", pid: null }),
    );
  });
}
async function rawPreview(file) {
  for (const tag of ["JpgFromRaw", "PreviewImage", "ThumbnailImage"]) {
    const bytes = await exiftool(file, ["-b", "-" + tag], true);
    if (bytes.length > 0) return bytes;
  }
  throw new Error("This RAW file has no readable embedded preview.");
}
async function heicImage(file) {
  if ((await fs.stat(file)).size > 128 * 1024 * 1024)
    throw new Error("This HEIC file exceeds the preview file-size limit.");
  const decode = require("heic-decode");
  const images = await decode.all({ buffer: await fs.readFile(file) });
  try {
    if (!images[0] || images[0].width * images[0].height > MAX_PIXELS)
      throw new Error("This image exceeds the 64 MP preview limit.");
    return await images[0].decode();
  } finally {
    images.dispose();
  }
}
async function pipelineFor(file, sharp) {
  if (/\.hei[cf]$/i.test(file)) {
    const image = await heicImage(file);
    return sharp(Buffer.from(image.data), {
      raw: { width: image.width, height: image.height, channels: 4 },
    });
  }
  return sharp(isRaw(file) ? await rawPreview(file) : file, {
    failOn: "none",
    limitInputPixels: MAX_PIXELS,
    sequentialRead: true,
    page: 0,
    pages: 1,
  }).rotate();
}
async function details(file, sharp) {
  let meta = {},
    tags = {};
  try {
    meta = await sharp(file, {
      limitInputPixels: MAX_PIXELS,
      page: 0,
      pages: 1,
    }).metadata();
  } catch {}
  try {
    const result = await exiftool(file, [
      "-j",
      "-n",
      "-ImageWidth",
      "-ImageHeight",
      "-ExifImageWidth",
      "-ExifImageHeight",
      "-BitsPerSample",
      "-BitDepth",
      "-SamplesPerPixel",
      "-ColorComponents",
      "-XResolution",
      "-YResolution",
      "-ResolutionUnit",
      "-PixelsPerUnitX",
      "-PixelUnits",
      "-DateTimeOriginal",
      "-Make",
      "-Model",
      "-Orientation",
    ]);
    tags = JSON.parse(result)[0] || {};
  } catch {}
  const orientation = Number(tags.Orientation || meta.orientation || 1);
  let width =
    Number(meta.width || tags.ImageWidth || tags.ExifImageWidth) || null;
  let height =
    Number(
      meta.pageHeight ||
        meta.height ||
        tags.ImageHeight ||
        tags.ExifImageHeight,
    ) || null;
  if ([5, 6, 7, 8].includes(orientation)) [width, height] = [height, width];
  const sampleBits =
    Number(String(tags.BitsPerSample || "").split(/\D+/)[0]) ||
    Number(tags.BitDepth) ||
    {
      uchar: 8,
      char: 8,
      ushort: 16,
      short: 16,
      uint: 32,
      int: 32,
      float: 32,
      double: 64,
    }[meta.depth];
  const channels =
    Number(tags.SamplesPerPixel || tags.ColorComponents || meta.channels) ||
    null;
  const unit = Number(tags.ResolutionUnit),
    resolution = Number(tags.XResolution);
  const exifUnits = !!meta.exif || /\.tiff?$/i.test(file) || isRaw(file);
  const dpi =
    Number(tags.PixelUnits) === 1 && Number(tags.PixelsPerUnitX) > 0
      ? Number(tags.PixelsPerUnitX) * 0.0254
      : resolution > 0 && unit === (exifUnits ? 2 : 1)
        ? resolution
        : resolution > 0 && unit === (exifUnits ? 3 : 2)
          ? resolution * 2.54
          : null;
  return {
    width,
    height,
    dpi: dpi ? Math.round(dpi) : null,
    bitDepth:
      sampleBits && channels
        ? sampleBits * channels
        : Number(tags.BitDepth) || null,
    colorSpace: meta.space || null,
    captured: tags.DateTimeOriginal || null,
    camera: [tags.Make, tags.Model].filter(Boolean).join(" ") || null,
    pages: meta.pages || 1,
    previewOnly: isRaw(file),
  };
}
module.exports = { pipelineFor, details };
