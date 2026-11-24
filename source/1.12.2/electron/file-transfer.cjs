const fs = require("node:fs/promises");
const path = require("node:path");

function selection(ids, mode) {
  if (
    !["copy", "move"].includes(mode) ||
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100000 ||
    ids.some((id) => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
  )
    throw new Error("Invalid file selection.");
  return [...new Set(ids)];
}

const sameFile = (a, b) =>
  a.isFile() &&
  b.isFile() &&
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs;

// Reserve names exclusively, including collisions between selected folders.
async function createTarget(io, directory, name) {
  const { name: stem, ext } = path.parse(name);
  for (let index = 0; index < 10000; index++) {
    const file = path.join(
      directory,
      index ? `${stem} (${index})${ext}` : name,
    );
    try {
      return { file, handle: await io.open(file, "wx") };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error("Too many files share this name in the destination folder.");
}

async function transferFiles({
  ids,
  mode,
  destination,
  resolveFile,
  nameForId = () => "File",
  waitForImage = async () => {},
  onProgress = () => {},
  io = fs,
}) {
  ids = selection(ids, mode);
  const directory = await io.realpath(destination);
  if (!(await io.lstat(directory)).isDirectory())
    throw new Error("Choose an existing destination folder.");
  const result = { completed: [], skipped: [], failed: [], renamed: 0 };
  const buffer = Buffer.allocUnsafe(256 * 1024);
  onProgress({ done: 0, total: ids.length, mode });
  for (const [index, id] of ids.entries()) {
    let source,
      target,
      original,
      targetIdentity,
      complete = false;
    let item;
    try {
      item = await resolveFile(id, true);
      if (
        mode === "move" &&
        path.dirname(item.filePath).toLowerCase() === directory.toLowerCase()
      ) {
        result.skipped.push(id);
        continue;
      }
      await waitForImage(id);
      item = await resolveFile(id, true);
      if (
        (await io.realpath(directory)).toLowerCase() !== directory.toLowerCase()
      )
        throw new Error("The destination folder changed. Choose it again.");
      source = await io.open(item.filePath, "r");
      original = await source.stat();
      if (
        !sameFile(original, await io.lstat(item.filePath)) ||
        original.size !== item.size ||
        original.mtimeMs !== item.modified
      )
        throw new Error(
          "The source file changed. Refresh the library and try again.",
        );
      target = await createTarget(io, directory, path.basename(item.filePath));
      targetIdentity = await target.handle.stat();
      // Reuse one bounded buffer for the batch, including large videos.
      for (let position = 0; position < original.size;) {
        const { bytesRead } = await source.read(
          buffer,
          0,
          Math.min(buffer.length, original.size - position),
          position,
        );
        if (!bytesRead)
          throw new Error(
            "The source file changed while copying. Its original was kept.",
          );
        for (let written = 0; written < bytesRead;) {
          const { bytesWritten } = await target.handle.write(
            buffer,
            written,
            bytesRead - written,
            position + written,
          );
          if (!bytesWritten)
            throw new Error("Could not write the destination file.");
          written += bytesWritten;
        }
        position += bytesRead;
      }
      await target.handle.sync();
      if (
        (await target.handle.stat()).size !== original.size ||
        !sameFile(original, await source.stat())
      )
        throw new Error(
          "The source file changed while copying. Its original was kept.",
        );
      await resolveFile(id, true);
      if (!sameFile(original, await io.lstat(item.filePath)))
        throw new Error(
          "The source file changed while copying. Its original was kept.",
        );
      await target.handle.utimes(original.atime, original.mtime);
      await target.handle.close();
      target.handle = null;
      await source.close();
      source = null;
      complete = true;
      if (mode === "move") {
        try {
          await resolveFile(id, true);
          if (!sameFile(original, await io.lstat(item.filePath)))
            throw new Error("The original changed.");
          await io.unlink(item.filePath);
        } catch {
          throw new Error(
            "Copied, but the original could not be removed. Both copies were kept.",
          );
        }
      }
      result.completed.push(id);
      if (path.basename(target.file) !== path.basename(item.filePath))
        result.renamed++;
    } catch (error) {
      result.failed.push({
        id,
        name: item?.name || nameForId(id) || "File",
        reason: error.message,
      });
    } finally {
      await source?.close().catch(() => {});
      await target?.handle?.close().catch(() => {});
      if (target && !complete) {
        // Remove only our incomplete file, never a replacement made elsewhere.
        const stat = await io.lstat(target.file).catch(() => null);
        if (
          stat &&
          stat.dev === targetIdentity?.dev &&
          stat.ino === targetIdentity?.ino
        )
          await io.unlink(target.file).catch(() => {});
      }
      onProgress({ done: index + 1, total: ids.length, mode });
    }
  }
  return result;
}

module.exports = { transferFiles, selection };
