/**
 * Sestaví plochou složku `release-upload/` jen se soubory, které mají být
 * na GitHub Release. Zachová 100 % updateru (soubory z latest.json) a pro
 * uživatele jen instalátory + portable + manifest.
 *
 * Použití: node scripts/prepare-release-assets.cjs <artifactsDir> [release-upload] [latest.json] [production|test]
 */

const fs = require("fs");
const path = require("path");

const artifactsDir = path.resolve(process.argv[2] || "artifacts");
const outputDir = path.resolve(process.argv[3] || "release-upload");
const manifestName = process.argv[4] || "latest.json";
const mode = process.argv[5] === "test" ? "test" : "production";

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function basenameFromUrl(url) {
  try {
    const decoded = decodeURIComponent(url.split("/").pop() || "");
    return path.basename(decoded);
  } catch {
    return path.basename(url);
  }
}

function pickOne(files, matcher, prefer) {
  const candidates = files.filter((file) => matcher.test(path.basename(file)));
  if (prefer) {
    const preferred = candidates.find((file) => prefer.test(path.basename(file)));
    if (preferred) return preferred;
  }
  return candidates[0] || null;
}

function copyToOutput(sourcePath, outputDirectory) {
  const name = path.basename(sourcePath);
  const dest = path.join(outputDirectory, name);
  fs.copyFileSync(sourcePath, dest);
  return name;
}

const allFiles = walk(artifactsDir).filter((file) => {
  const base = path.basename(file);
  if (/\.sig$/i.test(base)) return false;
  if (outputDir.startsWith(file)) return false;
  return true;
});

const manifestPath = path.join(artifactsDir, manifestName);
const requiredNames = new Set();

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const platform of Object.values(manifest.platforms || {})) {
    if (platform?.url) requiredNames.add(basenameFromUrl(platform.url));
  }
}

const selected = new Map();

function selectFile(filePath) {
  const base = path.basename(filePath);
  if (!selected.has(base)) selected.set(base, filePath);
}

for (const name of requiredNames) {
  const match = allFiles.find((file) => path.basename(file) === name);
  if (match) selectFile(match);
}

if (fs.existsSync(manifestPath)) {
  selectFile(manifestPath);
}

const portable = pickOne(allFiles, /^GrommeR_portable\.exe$/i);
if (portable && (mode === "production" || mode === "test")) {
  selectFile(portable);
}

const nsisZip = pickOne(allFiles, /setup.*\.exe\.zip$/i, /nsis/i);
if (nsisZip && !requiredNames.has(path.basename(nsisZip))) {
  selectFile(nsisZip);
}
const nsis = pickOne(
  allFiles,
  /^(?!.*portable).*\.exe$/i,
  /setup|nsis/i
);
if (nsis && !requiredNames.has(path.basename(nsis))) {
  selectFile(nsis);
}

if (mode === "production") {
  const msi = pickOne(allFiles, /\.msi$/i);
  if (msi) selectFile(msi);

  const dmg = pickOne(allFiles, /\.dmg$/i);
  if (dmg) selectFile(dmg);

  const appImage = pickOne(allFiles, /\.AppImage$/i);
  if (appImage && !requiredNames.has(path.basename(appImage))) {
    selectFile(appImage);
  }
}

if (selected.size === 0) {
  console.error("Žádný soubor pro release upload.");
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const uploaded = [];
for (const filePath of selected.values()) {
  uploaded.push(copyToOutput(filePath, outputDir));
}

console.log(`Release upload (${mode}): ${uploaded.sort().join(", ")}`);
