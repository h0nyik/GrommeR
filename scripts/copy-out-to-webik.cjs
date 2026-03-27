/**
 * Zkopíruje obsah složky out/ do webik/ (pro nasazení na libovolný hosting).
 * Spouští se po next build. Vyžaduje Node 16+ (fs.cpSync).
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "out");
const dest = path.join(__dirname, "..", "webik");

if (!fs.existsSync(src)) {
  console.error("Složka out/ neexistuje. Nejprve spusťte: npm run build");
  process.exit(1);
}

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true });
}
fs.cpSync(src, dest, { recursive: true });
console.log("Build zkopírován do webik/");
