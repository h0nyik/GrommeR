/**
 * Podepíše NSIS/MSI (Windows) nebo .app.tar.gz (macOS) pro Tauri updater.
 * Přeskočí se tiše, pokud chybí TAURI_SIGNING_PRIVATE_KEY_PASSWORD.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const bundleDir = path.join(rootDir, "src-tauri", "target", "release", "bundle");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function shouldSign(filePath) {
  const base = path.basename(filePath);
  if (/portable/i.test(base)) return false;
  if (/\.exe$/i.test(base) && !/setup|nsis/i.test(base) && base !== "app.exe") return false;
  if (/\.exe$/i.test(base) && /setup|nsis/i.test(base)) return true;
  if (/\.msi$/i.test(base)) return true;
  if (/\.app\.tar\.gz$/i.test(base)) return true;
  return false;
}

function main() {
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    console.log("TAURI_SIGNING_PRIVATE_KEY není nastaven – podpis updateru se přeskočí.");
    return;
  }
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    console.log(
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD není nastaven – podpis updateru se přeskočí (latest.json nevznikne)."
    );
    return;
  }

  const files = walk(bundleDir).filter(shouldSign);
  if (files.length === 0) {
    console.log("Žádné soubory k podpisu updateru.");
    return;
  }

  for (const file of files) {
    console.log(`Podpis: ${path.relative(rootDir, file)}`);
    execSync(`npx tauri signer sign "${file}"`, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    });
  }
  console.log(`Podepsáno ${files.length} soubor(ů).`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
