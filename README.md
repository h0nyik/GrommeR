# Grommet Marks App

Desktopová a webová aplikace pro generování **značek průchodek (grommet marks)** do tiskových PDF bannerů. Umožňuje přesné umístění vektorových značek na hrany banneru – kruh nebo čtverec, v RGB nebo CMYK – a výstup exportuje jako čistý TrimBox PDF připravený k tisku.

---

## Funkce

- **Nahrání PDF nebo obrázku** (JPG, PNG) – jednotlivě nebo dávka (až 10 souborů)
- **Výpočet pozic značek** – počet na hranu nebo rozteč v cm, symetrické rozmístění
- **Všechny 4 hrany** – horní, dolní, levá, pravá (libovolná kombinace)
- **Offset od rohů** – nastavitelný v mm, cm nebo palcích
- **Tvar značky** – kruh (průměr v mm) nebo čtverec (strana v mm)
- **Barva** – RGB (color picker) nebo CMYK (C/M/Y/K v %)  
  - Mapka kontrastních barev podle podkladové barvy banneru
  - Rychlá CMYK paletka (M100, K100, C100…)
- **PDF boxy** – zobrazení MediaBox, CropBox, BleedBox, TrimBox, ArtBox zdrojového souboru
- **Výstup** – vždy čistý TrimBox PDF s vloženými vektorovými značkami
- **Název souboru** – automaticky generovaný ve formátu `<BASE>__<SIRKA>x<VYSKA><j>__GS<SPACING>__TISK.pdf`
- **Desktopová verze (Windows)** – nativní dialog pro výběr souborů, výstupní složka pro dávku, strategie při konfliktu názvů (přepsat / suffix / přeskočit)

---

## Snímky obrazovky

> Příklad: nahrání PDF banneru, nastavení značek M100 průměr 7mm, rozteč 48cm, výstup jako čistý TrimBox.

---

## Požadavky

### Webová verze (prohlížeč)
- Moderní prohlížeč s podporou Web API (Chrome, Firefox, Edge)
- Žádná instalace

### Desktopová verze (Windows / macOS)
- **Windows** 10 nebo novější (64-bit)
- [Microsoft Edge WebView2](https://developer.microsoft.com/cs-cz/microsoft-edge/webview2/) – obvykle předinstalován od Windows 11; na Windows 10 ke stažení zdarma
- Instalátor **NSIS** nebo **MSI**, případně **`GrommeR_portable.exe`** (stejná aplikace bez instalace) z [Releases](https://github.com/h0nyik/GrommeR/releases)
- **macOS** (Apple Silicon): z Releases stáhněte **`.dmg`**, po připojení obrazu přetáhněte aplikaci na ikonu složky **Aplikace** v okně instalátoru

### Pro sestavení ze zdrojových kódů
- [Node.js](https://nodejs.org/) 18 nebo novější
- [Rust](https://www.rust-lang.org/tools/install) (stable, min. 1.77)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/cs/visual-cpp-build-tools/) s komponentou „Desktop development with C++"

---

## Instalace a spuštění

### 1. Webová verze (lokální vývoj)

```bash
git clone https://github.com/h0nyik/GrommeR.git
cd GrommeR
npm install
npm run dev
```

Aplikace poběží na [http://localhost:3000](http://localhost:3000).

### 2. Produkční webový build

```bash
npm run build
```

Výstup je ve složce `out/` – statické HTML/JS/CSS soubory, které lze nahrát na libovolný hosting.

### 3. Desktopová aplikace (Windows .exe)

```bash
npm run tauri build
```

Výstupní soubory (Windows):
- `src-tauri/target/release/app.exe` – stejná aplikace jako v instalátoru, jen bez zástupce v nabídce Start (vhodné k ručnímu kopírování / testu)
- `src-tauri/target/release/bundle/nsis/Grommet.Marks_*_x64-setup.exe` – NSIS instalátor
- `src-tauri/target/release/bundle/msi/Grommet.Marks_*_x64_en-US.msi` – MSI instalátor

Na **macOS** po `npm run tauri build` najdete DMG v `src-tauri/target/release/bundle/dmg/` (okno s přetažením do Aplikací).

---

## Použití aplikace

### Základní workflow

1. **Nahrajte soubor** – PDF nebo obrázek (JPG, PNG). Dávka: vyberte více souborů najednou.
2. **Nastavte hrany** – zaškrtněte horní / dolní / levou / pravou hranu.
3. **Offset od rohů** – vzdálenost první/poslední značky od rohu banneru. Výchozí: 2,8 cm.
4. **Režim rozmístění:**
   - *Rozteč* – maximální vzdálenost mezi středy značek (v cm). Aplikace vypočítá počet a rovnoměrně je rozmístí.
   - *Počet* – pevný počet značek na každou hranu.
5. **Tvar a velikost** – kruh nebo čtverec, průměr/strana v mm.
6. **Barva** – RGB nebo CMYK. Pro tisk doporučujeme CMYK (např. M100 pro magentovou).
7. **Klikněte „Generovat PDF se značkami"** – soubor se stáhne automaticky.

### Sekce „PDF boxy"

Zobrazí rozměry všech boxů zdrojového PDF. Výstup je vždy ořezán na **TrimBox** (čistý tiskový rozměr), takže ořezové značky a bleed nejsou ve výstupu přítomny.

### Dávkové zpracování

Nahrajte 2–10 souborů najednou. Každý soubor se zpracuje se stejným nastavením. Ve výstupním řádku každého souboru lze zadat vlastní název výstupního souboru.

### Desktopová aplikace – výstupní složka (F3.2)

V desktopové verzi je k dispozici sekce **Výstupní složka**:
- Tlačítkem „Vybrat složku…" vyberete společnou složku pro celou dávku – soubory se ukládají přímo bez dialogu pro každý soubor.
- **Strategie při konfliktu názvů:**
  - *Přepsat* – existující soubor se přepíše
  - *Přidat číselný suffix* – `soubor_1.pdf`, `soubor_2.pdf`…
  - *Přeskočit* – soubor se nevytvoří, přeskočí se

---

## Konvence názvu výstupního souboru

```
<BASE>__<SIRKA>x<VYSKA><j>__GS<SPACING>__TISK.pdf
```

- `<BASE>` – zkrácený původní název (bez přípon `final`, `export`, `v3` apod., max 25 znaků, bez diakritiky)
- `<SIRKA>x<VYSKA><j>` – reálné rozměry v metrech (≥1000mm) nebo centimetrech  
  Příklad: `200x100cm`, `13x2m`
- `GS<SPACING>` – rozteč značek v cm: `GS48` (stejná H/V) nebo `GS48x30` (různá)
- `_TISK.pdf` – přípona

**Příklad:**  
`HYGODOMU__200x100cm__GS48__TISK.pdf`

---

## Technologie

| Vrstva | Technologie |
|---|---|
| Frontend | [Next.js 16](https://nextjs.org/) (TypeScript, App Router, statický export) |
| Styly | [Tailwind CSS 4](https://tailwindcss.com/) |
| PDF manipulace | [pdf-lib 1.17](https://pdf-lib.js.org/) |
| PDF náhled | [PDF.js](https://mozilla.github.io/pdf.js/) |
| Desktop wrapper | [Tauri 2](https://tauri.app/) (Rust) |
| Testy | [Vitest](https://vitest.dev/) |

---

## Struktura projektu

```
GrommeR/
├── app/                  # Next.js stránky (App Router)
├── components/           # React komponenty
│   ├── GrommetForm.tsx   # Hlavní formulář
│   ├── PdfBoxesSection.tsx
│   ├── PdfPreview.tsx
│   ├── ImagePreview.tsx
│   └── ...
├── lib/                  # Knihovní funkce
│   ├── grommet-marks.ts  # Výpočet pozic značek
│   ├── pdf-utils.ts      # PDF manipulace (pdf-lib)
│   ├── image-to-pdf.ts   # Obrázky → PDF
│   ├── output-filename.ts # Generátor názvů souborů
│   ├── tauri-bridge.ts   # Desktop/web abstrakce
│   └── analytics.ts      # Anonymní statistiky
├── types/                # TypeScript typy
├── public/               # Statické soubory
├── scripts/              # Build skripty
│   ├── copy-out-to-webik.cjs
│   └── build-portable.cjs
├── src-tauri/            # Tauri (Rust) desktop wrapper
│   ├── src/              # Rust zdrojový kód
│   ├── capabilities/     # Tauri oprávnění
│   ├── icons/            # Ikony aplikace
│   └── tauri.conf.json   # Konfigurace Tauri
├── next.config.ts        # Konfigurace Next.js
├── package.json
└── README.md
```

---

## Testy

```bash
npm run test          # jednorázový běh
npm run test:watch    # sledovací režim
```

Pokrytí: výpočet pozic značek, práce s PDF, generátor názvů, převod obrázků → PDF (celkem 28 testů).

---

## Přispívání

1. Forkněte repozitář
2. Vytvořte větev pro vaši změnu: `git checkout -b feature/moje-zmena`
3. Commitujte: `git commit -m "Popis změny"`
4. Pushněte: `git push origin feature/moje-zmena`
5. Otevřete Pull Request

---

## Licence

MIT – viz [LICENSE](LICENSE)

---

## Autor

[h0nyik](https://github.com/h0nyik)
