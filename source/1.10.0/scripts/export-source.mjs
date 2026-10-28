import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const ref = args[args.indexOf("--ref") + 1];
if (!args.includes("--ref") || !/^\b[a-f0-9]{40}\b$/.test(ref || ""))
  throw new Error("Use --ref with a full reviewed development commit SHA.");
function git(parameters, encoding = "utf8") {
  const result = spawnSync("git", parameters, {
    encoding,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error("Cannot read the reviewed source commit.");
  return result.stdout;
}
const originalPackage = JSON.parse(git(["show", `${ref}:package.json`]));
const version = originalPackage.version;
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Only stable versioned snapshots are supported.");
const publicRoot = path.resolve("../luma-release");
const remote = git([
  "-C",
  publicRoot,
  "config",
  "--get",
  "remote.origin.url",
]).trim();
if (remote !== "https://github.com/Sanz2610/luma.git")
  throw new Error("Expected public checkout is unavailable.");
const destination = path.join(publicRoot, "source", version);
if (await fs.stat(destination).catch(() => null))
  throw new Error(
    "Snapshot already exists; never overwrite a published snapshot.",
  );
const standalone = new Set([
  ".gitattributes",
  ".gitignore",
  ".prettierrc.json",
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.mjs",
  "build/icon.ico",
  "build/icon.png",
  "build/installer.nsh",
  "CODEC_SOURCES.md",
]);
const selected = git(["ls-tree", "-r", "--name-only", ref])
  .trim()
  .split("\n")
  .filter(
    (file) =>
      standalone.has(file) ||
      /^(src|electron|tests|scripts|licenses)\//.test(file),
  );
const exported = new Map();
for (const file of selected) {
  if (
    file.includes("..") ||
    /\.(exe|zip|log|env)$/.test(file) ||
    file.includes("node_modules")
  )
    throw new Error("Unexpected source path.");
  const bytes = git(["show", `${ref}:${file}`], null);
  if (!/\.(ico|png)$/.test(file)) {
    const text = bytes.toString("utf8");
    if (
      /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----|C:[/\\]Users[/\\]ADMIN/.test(
        text,
      )
    )
      throw new Error("Source privacy scan requires review: " + file);
  }
  exported.set(file, bytes);
}
// Earlier releases predate the license decision. Retain runtime sources exactly,
// and declare only additive distribution metadata/license differences.
const pkg = JSON.parse(exported.get("package.json"));
pkg.author = { name: "Sanz2610", url: "https://github.com/Sanz2610" };
pkg.license = "MIT";
pkg.repository = { type: "git", url: "https://github.com/Sanz2610/luma.git" };
pkg.build.extraResources ||= [];
for (const resource of [
  { from: "LICENSE", to: "LICENSE.luma.txt" },
  { from: "CREDITS.md", to: "CREDITS.md" },
])
  if (!pkg.build.extraResources.some((item) => item.from === resource.from))
    pkg.build.extraResources.push(resource);
exported.set("package.json", Buffer.from(JSON.stringify(pkg, null, 2) + "\n"));
const lock = JSON.parse(exported.get("package-lock.json"));
lock.packages[""].license = "MIT";
exported.set(
  "package-lock.json",
  Buffer.from(JSON.stringify(lock, null, 2) + "\n"),
);
for (const file of ["LICENSE", "CREDITS.md"])
  exported.set(file, await fs.readFile(file));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const manifest = {
  version,
  developmentCommit: ref,
  license: "MIT",
  copyright: "2026 Sanz2610",
  files: [],
};
for (const [file, bytes] of exported) {
  const original = selected.includes(file)
    ? git(["show", `${ref}:${file}`], null)
    : null;
  manifest.files.push({
    path: file,
    sha256: hash(bytes),
    ...(original
      ? {
          originalSha256: hash(original),
          matchesDevelopmentCommit: hash(original) === hash(bytes),
        }
      : { addedForPublication: true }),
  });
}
const readme = `# Luma ${version} source\n\nCreated and maintained by [Sanz2610](https://github.com/Sanz2610). [MIT License](LICENSE); see [CREDITS.md](CREDITS.md).\n\nThis is a curated source snapshot for Luma ${version}, exported from development commit ${ref}. It includes application code, build configuration, dependency lockfile and tests; private development history and local data are excluded. SOURCE_MANIFEST.json records every exported file and its SHA-256. Runtime src/ and electron/ files match that development commit. Earlier snapshots may have additive author/license/resource metadata in package files, disclosed by the manifest.\n\n## Build and test\n\nWindows x64, Node.js 22.12+ or 24+, npm:\n\n\x60\x60\x60powershell\ncd source/${version}\nnpm ci\nnpm test\nnpm run build\nnpm start\n\x60\x60\x60\n\nFrom this directory, npm run dist creates installer and portable under ../work/release. npm run test:ui, test:windows and test:about exercise visible native windows (only scripts present in this snapshot apply). test:app uses synthetic fixtures and really recycles disposable fixture files. Do not put personal photos in test-results/. Release-publishing scripts require maintainer credentials and should not be used just to build or inspect Luma.\n\nNormal photo browsing is local. electron/library.cjs owns indexing and Recycle Bin checks, electron/thumbnail-service.cjs isolates native decoding, electron/main.cjs restricts IPC and protocol access, electron/lens.cjs performs explicit Lens preview upload, and electron/updates.cjs handles GitHub update traffic.\n\n## Verification limits\n\nCompare source file SHA-256 against SOURCE_MANIFEST.json. Published binary SHA-256 is in the release's SHA256SUMS.txt. Matching source hashes preserves the reviewed snapshot; source visibility alone does not prove a binary was built from it. Bit-for-bit reproducible Windows executables and publisher signing are not currently promised. Dependencies retain their own licenses and notices.\n`;
exported.set("README.md", Buffer.from(readme));
manifest.files.push({
  path: "README.md",
  sha256: hash(exported.get("README.md")),
  addedForPublication: true,
});
exported.set(
  "SOURCE_MANIFEST.json",
  Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
);
for (const [file, bytes] of exported) {
  const target = path.resolve(destination, file);
  if (!target.startsWith(destination + path.sep))
    throw new Error("Source target escaped snapshot.");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
}
console.log(
  JSON.stringify(
    {
      version,
      developmentCommit: ref,
      destination,
      files: exported.size,
      runtimeFilesUnchanged: manifest.files
        .filter((file) => /^(src|electron)\//.test(file.path))
        .every((file) => file.matchesDevelopmentCommit),
    },
    null,
    2,
  ),
);
