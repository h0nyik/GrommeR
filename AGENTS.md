## Learned User Preferences

- Odpovídej česky; UI texty, komentáře v kódu a projektová dokumentace také v češtině (viz `.cursorrules`).
- U každého produkčního tagu `v*` před pushnutím připrav stručný přehled hlavních změn oproti předchozí verzi v `release-notes/<tag>.md`.
- Na GitHub Release zobrazuj jen artefakty, které koncový uživatel skutečně potřebuje ke stažení; technický balast (např. samostatné `.sig`, deb/rpm, celé `bundle/**`) neuploadovat, při zachování plné funkčnosti Tauri updateru.
- Automatické aktualizace musí zůstat funkční; experimenty s updaterem dělej na izolované větvi, aby se nepoškodila stabilní produkční verze na GitHubu.
- U dostupné aktualizace chce viditelný startup popup s přívětivou výzvou; ideálně s krátkým výpisem novinek z release notes.
- Instalovaná verze: plný automatický update; portable verze: alespoň výrazné upozornění a možnost stáhnout novou verzi.
- Výstupní PDF musí být čistý tiskový rozměr bez crop marks / šnajtek a v maximální dostupné tiskové kvalitě; převody nesmí zbytečně degradovat zdrojovou grafiku.
- Při hlášení bugů (updater, CI, release) očekává důkladnou analýzu a opravu, ne jen vysvětlení.
- Git commity a větve po dokončení práce sjednoť bez zbytečného balastu.
- Nikdy neukládej do repa signing klíče, hesla ani jiné secrets.
- U release očekává hotové buildy ke stažení brzy po tagu; dlouhé fronty v Actions řešit aktivně.
- **Přejmenování na „GrommeR“**: aplikace se nově jmenuje **GrommeR** (dříve „Grommet Marks App“). Stávající dokumentaci neměnit zpětně, ale při každém dalším doplňování textů/dokumentace jasně a výrazně používat nový název „GrommeR“. `productName` a identitu instalátoru ponechat („Grommet Marks“), aby zůstal funkční auto-update; měnit jen viditelné UI.

## Learned Workspace Facts

- **Ověřené postupy (NEOBCHÁZET):** `.cursor/rules/verified-procedures.mdc` – jediný kanonický zdroj pro release/CI a zpracování velkých PDF. Před změnou těchto workflow nejdřív aktualizuj tento soubor.
- Projekt **Grommet Marks** (GrommeR): desktopová Tauri + Next.js aplikace pro generování značek průchodek do tiskových PDF bannerů; repo `https://github.com/h0nyik/GrommeR`.
- Výstup je vždy čisté TrimBox PDF; pojmenování `<BASE>__<SIRKA>x<VYSKA>__GS<SPACING>__TISK.pdf`.
- Windows: NSIS/MSI instalátory + `GrommeR_portable.exe`; macOS: `.dmg`; Linux: AppImage.
- Tauri updater: viz `verified-procedures.mdc` – signing u `tauri build` + `sign-updater-artifacts.cjs` + `latest.json` (`prepare-release-assets.cjs` filtruje upload).
- Pravidla release/updater: `.cursor/rules/github-releases.mdc`; šablona poznámek `release-notes/TEMPLATE.md`.
- Workflows: `tauri-builds.yml` (tag `v*`), `tauri-auto-update-test.yml` (tag `test-v*`).
- Podpisový klíč updateru je mimo repo v `~/.tauri/grommet-marks-updater.key`; GitHub secret `TAURI_SIGNING_PRIVATE_KEY` (+ volitelné heslo).
- Větev `auto-update-testing` slouží k bezpečnému testování auto-update bez rizika pro hlavní větev.
- Self-hosted runner používat jen pro Apple Intel Mac; ostatní platformy přes GitHub-hosted runners.
- Velké PDF: viz `verified-procedures.mdc` (práh 40 MB → lopdf, pdf.js metadata, sekvenční dávka, náhled vypnut nad 50 MB).
- Projektové pravidla v `.cursorrules`; vývojové poznámky v `DEV_NOTES.md`.
