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
  ".gif",
  ".jxl",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ...RAW_EXTENSIONS,
]);
const IMAGE_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
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
const isVideo = (file) =>
  [".mp4", ".mov"].includes(path.extname(file).toLowerCase());
const mediaType = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  return isRaw(file)
    ? "RAW"
    : { jpeg: "JPG", tif: "TIFF", heif: "HEIC" }[ext] || ext.toUpperCase();
};
const needsConversion = (file) =>
  CONVERTED_EXTENSIONS.has(path.extname(file).toLowerCase());
module.exports = {
  IMAGE_EXTENSIONS,
  isRaw,
  isVideo,
  mediaType,
  needsConversion,
};
