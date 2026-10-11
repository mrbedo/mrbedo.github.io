const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'artworks.json');

async function generateThumbnail(entry) {
  const source = path.join(root, entry.image);
  const destination = path.join(root, entry.thumbnail);

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await sharp(source)
    .rotate()
    .resize(720, 720, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true
    })
    .toColorspace('srgb')
    .jpeg({
      quality: 82,
      progressive: true,
      chromaSubsampling: '4:2:0',
      mozjpeg: true
    })
    .toFile(destination);

  const { size } = await fs.stat(destination);
  console.log(`${entry.name}: ${(size / 1024).toFixed(1)} KB`);
}

async function main() {
  const entries = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  if (!Array.isArray(entries) || entries.some(entry =>
    !entry || typeof entry.name !== 'string' ||
    typeof entry.image !== 'string' ||
    typeof entry.thumbnail !== 'string'
  )) {
    throw new Error('artworks.json must contain entries with name, image, and thumbnail paths.');
  }

  await Promise.all(entries.map(generateThumbnail));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
