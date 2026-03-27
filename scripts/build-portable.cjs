/**
 * Po úspěšném `npm run tauri build` zabalí složku aplikace (bundle "app")
 * do ZIP pro portable použití – rozbalení a spuštění bez instalace.
 * Použití: npm run build:portable (nebo po buildu node scripts/build-portable.cjs)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const bundleDir = path.join(rootDir, "src-tauri", "target", "release", "bundle");

const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
const version = tauriConf.version || "0.1.0";
const productName = (tauriConf.productName || "GrommetMarks").replace(/\s+/g, "");
const zipName = `${productName}-${version}-portable.zip`;

function findAppFolder() {
  if (!fs.existsSync(bundleDir)) {
    console.error("Složka bundle nenalezena. Nejprve spusťte: npm run tauri build");
    process.exit(1);
  }
  const entries = fs.readdirSync(bundleDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(bundleDir, e.name);
    const files = fs.readdirSync(dir);
    if (files.some((f) => f.endsWith(".exe"))) return dir;
  }
  const appDir = path.join(bundleDir, "app");
  if (fs.existsSync(appDir)) return appDir;
  console.error("Složka s aplikací (app.exe) v bundle nenalezena.");
  process.exit(1);
}

const appFolder = findAppFolder();
const zipPath = path.join(rootDir, zipName);

try {
  execSync(
    `Compress-Archive -LiteralPath "${appFolder}" -DestinationPath "${zipPath}" -Force`,
    { stdio: "inherit", shell: "powershell" }
  );
  console.log(`Portable ZIP vytvořen: ${zipName}`);
  console.log("Rozbalte ZIP kamkoli a spusťte .exe uvnitř složky – instalace není potřeba.");
} catch (err) {
  console.error("Vytvoření ZIP selhalo:", err.message);
  process.exit(1);
}
