import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export async function createFixtures(root) {
  const names = ["Chân dung", "Đời thường", "Du lịch", "Cảm hứng", "Yêu thích"];
  for (let folder = 0; folder < names.length; folder++) {
    const destination = path.join(root, names[folder]);
    await fs.mkdir(destination, { recursive: true });
    for (let image = 0; image < 8; image++) {
      const color = ["#568a83", "#b37b69", "#557c98", "#8d77a3", "#899b64"][
        (folder + image) % 5
      ];
      const svg = `<svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="1100" fill="${color}"/><circle cx="600" cy="330" r="190" fill="#f2dfb2"/><path d="M0 850L300 390L580 900L750 600L900 850V1100H0Z" fill="#1c343a"/><path d="M0 1000L460 700L900 1100H0Z" fill="#38525b"/></svg>`;
      await sharp(Buffer.from(svg))
        .jpeg({ quality: 85 })
        .toFile(
          path.join(
            destination,
            `Khoảnh khắc ${String(folder + 1).padStart(2, "0")}-${String(image + 1).padStart(2, "0")}.jpg`,
          ),
        );
    }
  }
}
