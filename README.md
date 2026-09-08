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
├── build.js                       erzeugt site/ aus src/ (Node, ohne Abhängigkeiten)
├── src/                           Quellen - hier wird bearbeitet
│   ├── meta.json                  Titel, Beschreibungen und URLs je Sprache
│   ├── doughcalculator.html       Markup des Rechners
│   ├── index.html                 Markup der Sammelseite
│   ├── index.i18n.json            Texte der Sammelseite (DE/EN)
│   ├── datenschutz.html           Markup der Datenschutzseite
│   ├── datenschutz.i18n.json      Texte der Datenschutzseite (DE/EN)
│   ├── root/                      landet unverändert in der Wurzel von site/
│   │   └── .htaccess              Cache-Header und Komprimierung (siehe unten)
│   ├── assets/                    Stylesheet, Skript, Icons
│   │   ├── style.css              gemeinsames Stylesheet
│   │   ├── doughcalculator.js     Rechenlogik, I18N und UI des Rechners
│   │   ├── favicon.svg            Zeichen des Rechners (auch als Favicon)
│   │   ├── favicon.ico            dasselbe Zeichen als Rasterfassung (siehe "Icons")
│   │   ├── doughpilot.svg         Zeichen der App
│   │   └── apple-touch-icon.png   Lesezeichen-Icon für iOS
│   └── icon-sources/              Vorlagen, die nicht ausgeliefert werden
│       └── favicon-16.svg         vereinfachte 16px-Ebene der ICO-Datei
├── .github/workflows/deploy.yml   baut site/ und lädt es zu IONOS (siehe DEPLOYMENT.md)
├── DEPLOYMENT.md                   Schritt-für-Schritt: GitHub → IONOS
└── README.md                       diese Datei

(site/ entsteht beim Bauen und liegt nicht im Repository:
 index.html, en/index.html, doughcalculator/index.html,
 doughcalculator/en/index.html, datenschutz/index.html,
 datenschutz/en/index.html, sitemap.xml, robots.txt, favicon.ico,
 der Inhalt von src/root/ und eine Kopie von assets/ —
 src/icon-sources/ wird nicht kopiert)
```


## src/root/

Alles in diesem Ordner landet unverändert in der Wurzel von `site/`. Gedacht
für Dateien, die genau dort liegen müssen und keine Seite sind:

- **`.htaccess`** — Cache-Header und Komprimierung. Der IONOS-Webspace liefert
  ohne diese Datei gar keinen `Cache-Control`-Header aus; Browser entscheiden
  dann nach eigener Heuristik, was am 07.09.2026 dazu geführt hat, dass ein
  Besucher neues Markup mit alter Rechenlogik zu sehen bekam. Versionierte
  Dateien (CSS, JS, Bilder — sie tragen einen Hash im Query-Parameter) dürfen
  ein Jahr gecacht werden, HTML muss bei jedem Aufruf gegengeprüft werden.
- **Bestätigungsdatei der Google Search Console**, sobald sie vorliegt. Hier
  abgelegt überlebt sie jeden Deploy; von Hand auf den Webspace kopiert wäre
  sie beim nächsten Upload weg.


## Icons

Das Zeichen liegt zweimal vor, weil sich die Browser uneinig sind:
**Safari unterstützt SVG-Favicons erst ab Version 26** und ignoriert
`<link rel="icon" type="image/svg+xml">` davor vollständig. Es fragt dann
`/favicon.ico` ab — und zeigt, wenn das mit 404 beantwortet wird, das
Icon, das seine Datenbank unter `ruhmkorf.de` gespeichert hat: das der
Hauptseite. Genau dieser Fall trat am 08.09.2026 auf.

Deshalb steht in beiden Seiten die ICO-Zeile **vor** der SVG-Zeile:
Browser nehmen die letzte Zeile, die sie verstehen — Chrome also das SVG,
Safari unter 26 die ICO-Datei. Der Build legt zusätzlich eine Kopie unter
`/favicon.ico` ab, damit auch der automatische Abruf nicht ins Leere läuft.

`src/assets/favicon.ico` enthält drei Ebenen, gerendert aus den SVG-Quellen:

| Ebene | Vorlage | wofür |
|---|---|---|
| 16px | `src/icon-sources/favicon-16.svg` | Tableiste ohne Retina |
| 32px | `src/assets/favicon.svg` | Tableiste mit Retina (der Regelfall) |
| 48px | `src/assets/favicon.svg` | Verknüpfungen unter Windows |

Die 16px-Ebene trägt bewusst ein anderes Motiv: Das volle Zeichen
zerfällt bei echten 16 Pixeln, das Prozentzeichen wird dort zu einem
Grauwertraster. Übrig bleibt deshalb nur das Prozentzeichen — es ist das
Element, das den Rechner von DoughPilot unterscheidet, während der Laib
beiden Zeichen gemeinsam ist. Ab 32px steckt das volle Motiv drin.

Alle Rasterfassungen (ICO wie `apple-touch-icon.png`) sind **fest in der
hellen Fassung** gerendert — sie können nicht auf `prefers-color-scheme`
reagieren, und die dunkelgrüne Kachel mit hellem Zeichen trägt auf hellen
wie dunklen Tableisten.

Erzeugt wurden sie durch Rendern der SVG-Dateien im Browser (je Größe
einzeln, nicht durch Herunterrechnen einer großen Fassung) und Bündeln zu
einer ICO-Datei. Sie werden nicht bei jedem Build neu erzeugt, sondern
liegen wie die OG-Vorschaubilder als fertige Datei in `src/assets/` —
nötig ist das nur, wenn sich das Zeichen ändert.


## Bauen und Deployen

**`site/` liegt nicht im Repository.** Der Ordner wird vollständig aus `src/`
erzeugt — vom Deploy-Workflow bei jedem Push auf `main`, direkt vor dem
Upload. Dadurch können Quelle und Ergebnis nicht auseinanderlaufen, und es
braucht lokal keine Node-Installation, um etwas zu veröffentlichen: Änderungen
in `src/` committen und pushen genügt.

Wer lokal bauen und die Seiten im Browser ansehen will, braucht Node:

```
node build.js          erzeugt site/ neu
node build.js --check   meldet per Exit-Code, ob site/ zu src/ passt
```

Warum es den Build überhaupt gibt: Die DE/EN-Umschaltung lief früher rein im
Browser über `localStorage`, auf ein und derselben URL. Für Suchmaschinen
existierte damit immer nur die deutsche Fassung; der englische Text war
faktisch nicht indexierbar. Jede Sprache braucht also eine eigene URL — und
zwei HTML-Dateien je Seite von Hand zu pflegen wäre auf Dauer auseinander
gelaufen. Damit fällt die frühere Regel „kein Build-Schritt" bewusst.

Was das Skript übernimmt:

- setzt die Texte je Sprache fest ins Markup (Elemente mit `data-i18n`)
- erzeugt Titel, Beschreibung, `canonical` und `hreflang` je Sprachfassung
- macht aus dem Sprachumschalter echte Links zwischen den Fassungen
- hängt an CSS, JS und Icons einen Cache-Buster aus dem **Dateiinhalt** —
  das ersetzt die früher von Hand hochgezählte Versionsnummer, deren
  Vergessen am 07.09.2026 dazu geführt hat, dass ein Besucher neues Markup
  mit alter Logik zu sehen bekam
- schreibt `sitemap.xml` mit allen Sprachfassungen
- kopiert `src/assets/` unverändert nach `site/assets/`

Wo welche Texte liegen: Die Sammelseite hat ihre in `src/index.i18n.json`.
Der Rechner dagegen im `I18N`-Objekt in `src/assets/doughcalculator.js` —
dort werden sie zur Laufzeit für Kategorien, Fehlermeldungen und die
Skalierliste ohnehin gebraucht, und dieselben Strings an zwei Stellen zu
pflegen wäre eine Fehlerquelle. Der Build liest sie von dort. Die Texte im
Markup von `src/` sind reine Platzhalter und werden beim Bauen überschrieben.

Der erzeugte `site/`-Ordner enthält ausschließlich das, was live gehen soll —
`src/`, `build.js`, `README.md` und `.github/` landen nie auf dem Webspace.
Deployment läuft auf `apps.ruhmkorf.de` (IONOS-Webspace der Domain
`ruhmkorf.de`), siehe `DEPLOYMENT.md`. Der Ordner funktioniert grundsätzlich
auf jedem statischen Hoster (GitHub Pages, Netlify, Vercel, …) – die Seiten
verweisen untereinander und auf ihre Assets ausschließlich relativ, hängen
also an keiner festen Domain.

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

- **Sammelseite:** trägt im Kopf weiterhin die Buchstabenkachel „AH". Ein
  eigenes Zeichen dafür gibt es noch nicht; das Brot-Zeichen des Rechners
  passt inhaltlich nicht zu einer allgemeinen Werkzeugsammlung.
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
