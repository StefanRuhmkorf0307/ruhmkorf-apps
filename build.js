#!/usr/bin/env node
"use strict";

/*
 * Erzeugt aus den Quellen in src/ die fertigen Seiten in site/.
 *
 * Warum es diesen Schritt gibt: Die DE/EN-Umschaltung lief früher rein im
 * Browser über localStorage, auf ein und derselben URL. Für Suchmaschinen
 * existierte damit immer nur die deutsche Fassung - der englische Text war
 * faktisch nicht indexierbar. Jede Sprache braucht eine eigene URL, und die
 * von Hand doppelt zu pflegen wäre auf Dauer auseinandergelaufen.
 *
 * Was das Skript tut:
 *   - setzt die Texte je Sprache fest ins Markup (Elemente mit data-i18n)
 *   - erzeugt Titel, Beschreibung, canonical und hreflang je Sprachfassung
 *   - macht aus dem Sprachumschalter echte Links zwischen den Fassungen
 *   - hängt an CSS/JS/Icons einen Cache-Buster aus dem Dateiinhalt
 *   - schreibt sitemap.xml mit allen Sprachfassungen
 *
 * site/ ist vollständig erzeugt und steht deshalb nicht unter
 * Versionskontrolle - der Deploy-Workflow baut den Ordner vor dem Upload neu.
 * Damit können Quelle und Ergebnis gar nicht erst auseinanderlaufen.
 *
 * Aufruf:  node build.js          baut nach site/
 *          node build.js --check  baut nur im Speicher und meldet per
 *                                 Exit-Code 1, wenn site/ abweicht (nützlich
 *                                 lokal, im Workflow nicht mehr nötig)
 *
 * Keine Abhängigkeiten - reines Node.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const SRC_ASSETS = path.join(SRC, "assets");
const OUT = path.join(ROOT, "site");
const CHECK_ONLY = process.argv.includes("--check");

const meta = readJson(path.join(SRC, "meta.json"));
const problems = [];

/* ---------- Hilfsfunktionen ---------- */

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/*
 * Holt das I18N-Objektliteral aus der Rechner-Logik. Die Strings leben dort,
 * weil das Skript sie zur Laufzeit für Kategorien, Fehlermeldungen und die
 * Skalierliste braucht - sie zusätzlich in einer JSON zu pflegen hieße, sie
 * an zwei Stellen gleich halten zu müssen.
 *
 * Gelesen wird per Klammerzählung ab "var I18N = {", wobei Klammern
 * innerhalb von Strings und Kommentaren nicht mitzählen.
 */
function extractI18nFromScript(file) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  const marker = "var I18N = {";
  const start = code.indexOf(marker);
  if (start === -1) throw new Error(`I18N-Objekt in ${file} nicht gefunden`);

  let i = start + marker.length - 1; // auf die öffnende Klammer
  let depth = 0, inStr = null, inLineComment = false, inBlockComment = false;
  for (; i < code.length; i++) {
    const c = code[i], next = code[i + 1];
    if (inLineComment) { if (c === "\n") inLineComment = false; continue; }
    if (inBlockComment) { if (c === "*" && next === "/") { inBlockComment = false; i++; } continue; }
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  const literal = code.slice(code.indexOf("{", start), i);
  // eigener, versionierter Code - kein Fremdinput
  return new Function("return " + literal)();
}

/* Cache-Buster aus dem Dateiinhalt statt aus einer Zahl, die jemand von Hand
   hochzählen muss. Vergessene Erhöhungen waren am 07.09.2026 der Grund dafür,
   dass ein Besucher neues Markup mit alter Logik zu sehen bekam. */
const hashCache = new Map();
function assetHash(name) {
  if (hashCache.has(name)) return hashCache.get(name);
  const file = path.join(SRC_ASSETS, name);
  let h = "0";
  if (fs.existsSync(file)) {
    // Ueber den bereinigten Inhalt hashen - ausgeliefert wird die Fassung
    // ohne Metadaten, und der Parameter soll zu ihr passen.
    h = crypto.createHash("sha1").update(stripMetadata(name, fs.readFileSync(file))).digest("hex").slice(0, 8);
  } else {
    problems.push(`Asset fehlt, kein Cache-Buster möglich: src/assets/${name}`);
  }
  hashCache.set(name, h);
  return h;
}

/* Entfernt Metadaten, die sich beim Kopieren zwischen Rechnern an Bilddateien
   anhaengen (Content Credentials nach C2PA). Am 07.09.2026 hatte das
   favicon.svg dadurch 9,6 statt 1,8 KB - Ballast bei jedem Seitenaufruf, ohne
   Nutzen fuer eine Web-Grafik. Hier statt an der Quelle, weil die Metadaten
   bei jedem erneuten Uebertragen zurueckkaemen. */
function stripMetadata(name, buf) {
  if (name.endsWith(".svg")) {
    const cleaned = buf.toString("utf8")
      .replace(/<metadata>[\s\S]*?<\/metadata>\s*/g, "")
      .replace(/\s+xmlns:c2pa="[^"]*"/g, "");
    return Buffer.from(cleaned, "utf8");
  }
  if (name.endsWith(".png")) {
    // PNG besteht aus Chunks: 4 Byte Laenge, 4 Byte Typ, Daten, 4 Byte CRC.
    // Entfernt werden nur Textchunks und Content Credentials - alles, was
    // zur Darstellung gehoert (IHDR, PLTE, IDAT, IEND, tRNS, sRGB, ...),
    // bleibt unangetastet.
    const DROP = new Set(["iTXt", "tEXt", "zTXt", "eXIf", "caBX"]);
    const parts = [buf.subarray(0, 8)]; // Signatur
    let off = 8;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString("ascii", off + 4, off + 8);
      const end = off + 12 + len;
      if (end > buf.length) break;
      if (!DROP.has(type)) parts.push(buf.subarray(off, end));
      off = end;
      if (type === "IEND") break;
    }
    return Buffer.concat(parts);
  }
  return buf;
}

/* ---------- Transformationen ---------- */

/* Ersetzt den Inhalt aller Elemente mit data-i18n durch den Text der
   Zielsprache. Bewusst kein allgemeiner HTML-Parser: Das Markup ist
   projekteigen, und für jeden Schlüssel wird geprüft, dass er genau einmal
   vorkommt - Abweichungen brechen den Build ab, statt still danebenzugehen. */
function applyTexts(html, strings, pageId) {
  const used = new Set();
  const out = html.replace(
    /(<([a-zA-Z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (all, open, tag, key, inner, close) => {
      if (!(key in strings)) {
        problems.push(`[${pageId}] Kein Text für data-i18n="${key}"`);
        return all;
      }
      if (/<[a-zA-Z]/.test(inner)) {
        problems.push(`[${pageId}] data-i18n="${key}" enthält Markup - Text würde es überschreiben`);
        return all;
      }
      used.add(key);
      return open + escapeHtml(strings[key]) + close;
    }
  );
  const declared = new Set(Object.keys(strings).filter((k) => !k.startsWith("_")));
  for (const key of used) declared.delete(key);
  return { html: out, unusedKeys: [...declared] };
}

/* Der Umschalter war eine Schaltfläche, die im Browser die Sprache tauschte.
   Mit eigenen URLs je Sprache wird daraus ein echter Link - nur so kann eine
   Suchmaschine der anderen Fassung überhaupt folgen. Die aktuelle Sprache
   bleibt bewusst ohne Link. */
function buildLangToggle(page, lang, depth) {
  const items = Object.keys(page.variants).map((code) => {
    const label = code.toUpperCase();
    if (code === lang) {
      return `<span class="active" aria-current="true">${label}</span>`;
    }
    const href = relativeUrl(page.variants[lang].path, page.variants[code].path);
    return `<a href="${escapeAttr(href)}" hreflang="${code}">${label}</a>`;
  });
  return `<div class="lang-toggle" role="group" aria-label="Language">\n      ${items.join("\n      ")}\n    </div>`;
}

/* Relativer Pfad von einer generierten Seite zu einer anderen. Absolute Pfade
   wären kürzer, würden die Seiten aber an die Domainwurzel binden - so bleibt
   der site/-Ordner auf jedem Hoster und auch lokal lauffähig. */
function relativeUrl(fromPath, toPath) {
  const fromDir = path.posix.dirname(fromPath);
  let rel = path.posix.relative(fromDir, toPath);
  rel = rel.replace(/(^|\/)index\.html$/, "$1");
  return rel === "" ? "./" : rel;
}

function assetsPrefix(pagePath) {
  const depth = pagePath.split("/").length - 1;
  return depth === 0 ? "assets" : "../".repeat(depth) + "assets";
}

/* ---------- Seitenaufbau ---------- */

function renderPage(page, lang, strings) {
  const variant = page.variants[lang];
  const src = fs.readFileSync(path.join(SRC, page.source), "utf8");
  const prefix = assetsPrefix(variant.path);

  let html = src;

  // 1. Texte der Zielsprache einsetzen
  const applied = applyTexts(html, strings, `${page.id}/${lang}`);
  html = applied.html;
  if (applied.unusedKeys.length) {
    // Kein Fehler: Der Rechner hält Strings vor, die erst zur Laufzeit
    // gebraucht werden (Kategorien, Fehlermeldungen, Skalierzeilen).
  }

  // 2. Asset-Pfade auf die Tiefe der Zielseite bringen, mit Cache-Buster
  html = html.replace(/\{\{assets\}\}\/([A-Za-z0-9._-]+)/g, (all, file) => {
    return `${prefix}/${file}?v=${assetHash(file)}`;
  });

  // 3. Sprache am Wurzelelement
  html = html.replace(/<html\b[^>]*>/, `<html lang="${lang}">`);

  // 4. Titel und Beschreibung
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(variant.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${escapeAttr(variant.description)}">`
  );

  // 5. canonical und hreflang. x-default zeigt auf die Standardsprache und
  //    ist das, was Suchmaschinen ohne passende Sprachpräferenz nehmen.
  const alternates = Object.keys(page.variants)
    .map((code) => `<link rel="alternate" hreflang="${code}" href="${meta.baseUrl}${page.variants[code].url}">`)
    .concat([
      `<link rel="alternate" hreflang="x-default" href="${meta.baseUrl}${page.variants[meta.defaultLang].url}">`
    ]);
  /* Open Graph steuert, wie die Seite beim Teilen in WhatsApp, Facebook,
     Slack oder Foren aussieht. Ohne diese Angaben zeigen die Dienste
     bestenfalls die nackte URL - fuer die geplanten Community-Posts der
     entscheidende Unterschied. Das Vorschaubild ist optional: Die
     Sammelseite bekommt keins, weil das vorhandene Motiv den Rechner beim
     Namen nennt und dort in die Irre fuehren wuerde. */
  const og = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeAttr(variant.title)}">`,
    `<meta property="og:description" content="${escapeAttr(variant.description)}">`,
    `<meta property="og:url" content="${meta.baseUrl}${variant.url}">`,
    `<meta property="og:locale" content="${(meta.locales || {})[lang] || lang}">`
  ];
  if (variant.ogImage) {
    og.push(
      `<meta property="og:image" content="${meta.baseUrl}/assets/${variant.ogImage}?v=${assetHash(variant.ogImage)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`
    );
  } else {
    og.push(`<meta name="twitter:card" content="summary">`);
  }

  const head = [
    `<link rel="canonical" href="${meta.baseUrl}${variant.url}">`,
    ...alternates,
    ...og
  ].join("\n");
  html = html.replace("{{head-links}}", head);

  // 6. Sprachumschalter als Links
  html = html.replace(/<div class="lang-toggle"[\s\S]*?<\/div>/, buildLangToggle(page, lang));

  // 7. Verweise zwischen den Seiten in der passenden Sprachfassung
  html = html.replace(/\{\{link:([a-zA-Z0-9_-]+)\}\}/g, (all, targetId) => {
    const target = meta.pages.find((p) => p.id === targetId);
    if (!target) { problems.push(`Unbekanntes Linkziel: ${targetId}`); return all; }
    return escapeAttr(relativeUrl(variant.path, target.variants[lang].path));
  });

  /* Der QUELLE-Hinweis am Kopf der Vorlage richtet sich an den, der sie
     bearbeitet - in der ausgelieferten Seite hat er nichts verloren. */
  html = html.replace(/^<!--\s*QUELLE[\s\S]*?-->\s*/, "");

  const banner = `<!-- Erzeugt von build.js aus src/${page.source} - nicht von Hand bearbeiten.\n     Änderungen gehören in src/ bzw. in das I18N-Objekt der Rechner-Logik. -->\n`;
  return banner + html;
}

function buildSitemap(files) {
  const urls = [];
  for (const page of meta.pages) {
    for (const lang of Object.keys(page.variants)) {
      const v = page.variants[lang];
      const alt = Object.keys(page.variants)
        .map((c) => `    <xhtml:link rel="alternate" hreflang="${c}" href="${meta.baseUrl}${page.variants[c].url}"/>`)
        .join("\n");
      urls.push(
        `  <url>\n    <loc>${meta.baseUrl}${v.url}</loc>\n${alt}\n` +
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${meta.baseUrl}${page.variants[meta.defaultLang].url}"/>\n  </url>`
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

/* ---------- Lauf ---------- */

const generated = new Map();

for (const page of meta.pages) {
  const strings = page.i18nFromScript
    ? extractI18nFromScript(page.i18nFromScript)
    : readJson(path.join(SRC, page.i18n));

  const langs = Object.keys(page.variants);
  const missing = langs.filter((l) => !strings[l]);
  if (missing.length) {
    problems.push(`[${page.id}] Keine Texte für: ${missing.join(", ")}`);
    continue;
  }
  for (const lang of langs) {
    generated.set(page.variants[lang].path, renderPage(page, lang, strings[lang]));
  }
}

generated.set("sitemap.xml", buildSitemap());

/* Assets werden unveraendert mitkopiert. Erst dadurch ist site/ vollstaendig
   erzeugt und kann komplett aus der Versionskontrolle bleiben - sonst muesste
   die .gitignore einzelne Dateien auflisten und bei jeder neuen Seite
   nachgezogen werden. */
const assetFiles = fs.existsSync(SRC_ASSETS) ? fs.readdirSync(SRC_ASSETS) : [];
if (!assetFiles.length) problems.push("src/assets/ ist leer oder fehlt");
for (const name of assetFiles) {
  generated.set("assets/" + name, stripMetadata(name, fs.readFileSync(path.join(SRC_ASSETS, name))));
}

/* Zusaetzlich eine Kopie unter /favicon.ico. Die Seiten verweisen zwar
   ausdruecklich auf assets/favicon.ico, aber Browser fragen diesen Pfad von
   sich aus ab, wenn sie mit den angegebenen Icons nichts anfangen koennen -
   Safari vor Version 26 kann das SVG-Favicon nicht und tut genau das. Ohne
   die Kopie beantwortet der Server das mit 404, und Safari greift dann auf
   das zurueck, was seine Icon-Datenbank unter ruhmkorf.de gespeichert hat:
   das alte Zeichen der Hauptseite. */
if (generated.has("assets/favicon.ico")) {
  generated.set("favicon.ico", generated.get("assets/favicon.ico"));
} else {
  problems.push("src/assets/favicon.ico fehlt - ohne sie zeigen aeltere Safari-Versionen ein fremdes Icon");
}

if (problems.length) {
  console.error("Build abgebrochen:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

let changed = 0;
for (const [rel, content] of generated) {
  const target = path.join(OUT, rel);
  const isBuffer = Buffer.isBuffer(content);
  let same = false;
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target);
    same = isBuffer ? current.equals(content) : current.toString("utf8") === content;
  }
  if (same) continue;
  changed++;
  if (CHECK_ONLY) {
    console.error(`Nicht aktuell: site/${rel}`);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    console.log(`geschrieben: site/${rel}`);
  }
}

if (CHECK_ONLY) {
  if (changed) {
    console.error(`\n${changed} Datei(en) in site/ entsprechen nicht den Quellen in src/.`);
    console.error("Bitte 'node build.js' ausführen und das Ergebnis mit committen.");
    process.exit(1);
  }
  console.log("site/ ist auf dem Stand von src/.");
} else if (!changed) {
  console.log("Nichts zu tun - site/ war bereits aktuell.");
} else {
  console.log(`\nFertig: ${changed} Datei(en) aktualisiert.`);
}
