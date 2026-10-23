const path = require("node:path");
const RAW_EXTENSIONS = new Set([
  ".cr2",
  ".cr3",
  ".nef",
  ".nrw",
  ".arw",
  ".dng",
  ".rw2",
  ".orf",
  ".raf",
  ".pef",
  ".srw",
]);
const CONVERTED_EXTENSIONS = new Set([
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ...RAW_EXTENSIONS,
]);
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
  ...CONVERTED_EXTENSIONS,
]);
const isRaw = (file) => RAW_EXTENSIONS.has(path.extname(file).toLowerCase());
const needsConversion = (file) =>
  CONVERTED_EXTENSIONS.has(path.extname(file).toLowerCase());
module.exports = { IMAGE_EXTENSIONS, isRaw, needsConversion };
