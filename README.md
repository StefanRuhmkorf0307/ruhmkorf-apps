# Alltagshelfer

Sammlung von statischen, framework-losen Web-Tools für den Alltag. Aktuell
dreht sich hier alles ums Sauerteigbrot (DoughCalculator, parallel zur
DoughPilot-iOS-App), nach und nach sollen aber ganz unterschiedliche Helfer
dazukommen. Kein Login, keine Server-Komponente – reines HTML/CSS/JS, letzte
Rezeptwerte werden über `localStorage` im Browser gemerkt (kein echtes
HTTP-Cookie, aber funktional dasselbe Ziel: Werte bleiben ohne Konto
erhalten).

## Struktur

```
ruhmkorf-apps/                  (Repo-Root)
├── .github/workflows/deploy.yml   automatisches Deployment nach IONOS (siehe DEPLOYMENT.md)
├── site/                          alles, was tatsächlich live geht
│   ├── index.html                 Sammelseite (Übersicht/Landingpage, verlinkt alle Tools)
│   ├── assets/
│   │   ├── style.css              gemeinsames Stylesheet für alle Seiten
│   │   └── doughcalculator.js     Rechenlogik + I18N + UI des DoughCalculators
│   └── doughcalculator/
│       └── index.html             DoughCalculator (nur Markup, lädt doughcalculator.js)
├── DEPLOYMENT.md                   Schritt-für-Schritt: GitHub → IONOS (apps.ruhmkorf.de)
└── README.md                       diese Datei
```

Kein Bundler, kein Build-Schritt – die Seiten laufen so, wie sie im Repo
liegen. Die Sammelseite trägt ihr kleines Skript noch inline; die Logik des
DoughCalculators liegt seit 2026-09-07 in `assets/doughcalculator.js` statt
inline in der Seite. Grund: Die geplante englische Sprachversion braucht
eine zweite HTML-Datei, und die soll dieselbe Logik mitbenutzen, statt sie
zu duplizieren (siehe „Offene Punkte“). Nebeneffekt: der Browser kann die
Datei zwischen Seitenaufrufen cachen.

Der `site/`-Ordner ist bewusst vom Repo-Root getrennt, damit der
Deploy-Workflow nur diesen Inhalt hochlädt und nicht versehentlich
`README.md`, `DEPLOYMENT.md` oder `.github/` mit auf den Webspace legt.
Geplanter Hosting-Weg: automatisches Deployment auf `apps.ruhmkorf.de`
(IONOS-Webspace der Domain `ruhmkorf.de`) bei jedem Push auf `main`, siehe
`DEPLOYMENT.md`. Der Ordner funktioniert aber grundsätzlich auf jedem
statischen Hoster (GitHub Pages, Netlify, Vercel, …) – es gibt keine
Abhängigkeiten oder Build-Konfiguration.

## DoughCalculator – Rechenlogik (v1, Stand 2026-09-05)

- **Bäckerprozent** je Zutat = `Menge_Zutat / Gesamtmehlgewicht × 100`
  (Gesamtmehlgewicht = Summe aus `Menge × Mehlanteil%` über alle Zutaten).
- **Hydration** = `Gesamtwassergewicht / Gesamtmehlgewicht × 100`
  (Gesamtwassergewicht = Summe aus `Menge × Wasseranteil%`).
- **Erwartetes Brotgewicht** = `Gesamtteiggewicht × (1 − 0,15)`, also fester
  Backverlust von 15% (Wert aus dem iOS-App-Modell übernommen, siehe
  `doughpilot-projekt-uebersicht.md` im Projekt).
- **Skalieren** (Ziel-Teiggewicht / Ziel-Brotgewicht / Menge einer
  bestimmten Zutat) wendet einen einzigen Skalierungsfaktor auf **alle**
  Zutatenmengen an. Das ist mathematisch identisch zur klassischen
  Bäckerprozent-Skalierung (alle Prozentanteile bleiben unverändert), aber
  einfacher zu implementieren als eine Rückrechnung über die Prozente.
- Kategorien: Mehl, Wasser, Flüssigkeit, Anstellgut, Salz, Sonstiges. Der
  Mehl-/Wasseranteil ist **nicht** mehr pro Zutat editierbar, sondern eine
  feste Hintergrund-Annahme je Kategorie (Mehl 100/0, Wasser 0/100,
  Flüssigkeit 0/100, Anstellgut 50/50 = 100% Hydration, Salz 0/0, Sonstiges
  0/0). Bei Flüssigkeit, Anstellgut und Sonstiges wird die Annahme als
  eigene, volle Tabellenzeile direkt unter der jeweiligen Zutat angezeigt
  (kleiner kursiver Hinweistext über die gesamte Zeilenbreite, mit „ⓘ“),
  da sie dort nicht offensichtlich ist (bei Mehl/Wasser/Salz ist sie es).

Bewusst **nicht** übernommen aus `sourdough-core` (Rust-Kern der iOS-App):
Diese Web-Implementierung ist eigenständiges JS, keine WASM-Anbindung an
`sourdough-core`. Die Formeln (Bäckerprozente, Hydration, 15%-Backverlust)
sind fachlich identisch zum Modell aus der Projektübersicht, aber
unabhängig gepflegt – bei künftigen Änderungen an `sourdough-core` müsste
diese Datei manuell nachgezogen werden.

## Offene Punkte

- **Zweisprachige URLs (entschieden, noch nicht umgesetzt):** Die DE/EN-Um­
  schaltung läuft aktuell nur über JavaScript/`localStorage` auf **einer**
  URL – Suchmaschinen sehen dort immer nur Deutsch, die englische Version
  ist faktisch nicht indexierbar. Geplant sind getrennte URLs
  (`/doughcalculator/` und `/doughcalculator/en/`) plus `hreflang`, erzeugt
  von einem kleinen Build-Skript aus einer gemeinsamen Quelle. Damit fällt
  die bisherige Regel „kein Build-Schritt“ bewusst. Das Auslagern von
  `doughcalculator.js` war der erste Schritt dorthin. Details und Begründung:
  `claude/marketing-seo-doughcalculator.md` im Claude-Projekt.
- **Zeichenkodierung prüfen:** `doughcalculator.js` enthält Umlaute (die
  deutschen Oberflächentexte). Bindet ein Server die Datei mit einem
  abweichenden Charset im `Content-Type` ein, werden sie zerschossen. Lokal
  und über einen Server ohne Charset-Angabe getestet und in Ordnung – nach
  dem nächsten Deploy einmal live gegenprüfen (steht z.B. „Bäcker-%“
  korrekt in der Tabellenüberschrift?).
- **Branding:** Die Sammelseite heißt jetzt „Alltagshelfer“ (bewusst
  allgemein statt sauerteig-spezifisch, siehe `index.html`) - eine eigene
  Domain dafür ist noch nicht reserviert, die Seite läuft weiter unter
  `apps.ruhmkorf.de`.
- **DoughPilot Web:** Auf der Sammelseite als „Demnächst“-Kachel
  vorbereitet (`index.html`, `.tool-card.disabled`). Sobald die
  Web-Version existiert (laut Projektübersicht geplant über
  `wasm-pack`-Build von `sourdough-core`), einfach einen neuen Ordner
  `doughpilot/` anlegen und die Kachel in `index.html` verlinken/aktivieren.
- **localStorage vs. Cookie:** Ursprünglich war „Speicherung als Cookie“
  angedacht; hier wurde stattdessen `localStorage` verwendet (kein
  Cookie-Banner nötig, einfacher, gleiche Funktion: Werte bleiben ohne
  Konto im Browser erhalten). Falls doch ein echtes Cookie (z.B. weil ein
  Server die Werte lesen soll) gebraucht wird, bitte Bescheid geben.
