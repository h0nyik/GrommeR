/**
 * Vytvoří statický manifest `latest.json` pro Tauri updater z artefaktů stažených
 * v GitHub Actions. Do manifestu patří jen platformy, pro které existuje balíček
 * i odpovídající `.sig` podpis.
 */

const fs = require("fs");
const path = require("path");

const artifactsDir = path.resolve(process.argv[2] || "artifacts");
const tagName = process.argv[3] || process.env.GITHUB_REF_NAME || "";
const repoUrl = (process.argv[4] || "https://github.com/h0nyik/GrommeR").replace(/\/$/, "");
const outputFilename = process.argv[5] || "latest.json";
const downloadTag = process.argv[6] || tagName;

if (!tagName) {
  console.error("Chybí název tagu/verze pro latest.json.");
  process.exit(1);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function githubReleaseAssetName(filename) {
  // GitHub release upload přejmenovává mezery v názvech souborů na tečky.
  return filename.replace(/ /g, ".");
}

function releaseAssetUrl(filename) {
  const assetName = githubReleaseAssetName(filename);
  return `${repoUrl}/releases/download/${encodeURIComponent(downloadTag)}/${encodeURIComponent(assetName)}`;
}

function pickSignedAsset(files, matcher, prefer) {
  const candidates = files
    .filter((file) => matcher.test(path.basename(file)))
    .filter((file) => fs.existsSync(`${file}.sig`));

  if (prefer) {
    const preferred = candidates.find((file) => prefer.test(path.basename(file)));
    if (preferred) return preferred;
  }

  return candidates[0] || null;
}

const files = walk(artifactsDir);
const platformAssets = {
  "windows-x86_64": pickSignedAsset(
    files,
    /^(?!.*portable).*\.exe$/i,
    /setup|nsis/i
  ),
  "linux-x86_64": pickSignedAsset(files, /\.AppImage$/i),
  "darwin-aarch64": pickSignedAsset(files, /\.app\.tar\.gz$/i),
};

const platforms = Object.fromEntries(
  Object.entries(platformAssets)
    .filter(([, file]) => Boolean(file))
    .map(([target, file]) => {
      const filename = path.basename(file);
      return [
        target,
        {
          signature: fs.readFileSync(`${file}.sig`, "utf8").trim(),
          url: releaseAssetUrl(filename),
        },
      ];
    })
);

if (Object.keys(platforms).length === 0) {
  console.error("Nebyl nalezen žádný podepsaný updater artefakt.");
  process.exit(1);
}

function normalizeTagVersion(tag) {
  return tag.replace(/^test-v/i, "").replace(/^v/i, "");
}

const manifest = {
  version: normalizeTagVersion(tagName),
  notes: `Automatická aktualizace ${tagName}.`,
  pub_date: new Date().toISOString(),
  platforms,
};

const outputPath = path.join(artifactsDir, outputFilename);
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Vytvořen manifest updateru: ${outputPath}`);
console.log(`Platformy: ${Object.keys(platforms).join(", ")}`);
