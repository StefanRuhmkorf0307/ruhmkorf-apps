# Deployment: GitHub → IONOS (apps.ruhmkorf.de)

Diese Anleitung bringt den Inhalt von `site/` automatisch auf
`apps.ruhmkorf.de`, bei jedem Push auf `main`. Ausgangslage: `ruhmkorf.de`
läuft bereits bei IONOS (DNS "durch IONOS verwaltet"), es existiert bereits
ein Webspace für die Domain, aktuell u.a. mit Click & Build und Mail belegt.

## Schritt 1 – GitHub-Repo anlegen

1. Auf [github.com](https://github.com) ein neues, privates Repository
   anlegen (z.B. `sauerteig-tools`).
2. Diesen kompletten Ordner (wie geliefert, inkl. `.github/`, `site/`,
   `.gitignore`, `README.md`, `DEPLOYMENT.md`) in das Repo pushen:

   ```bash
   cd sauerteig-tools
   git init                     # falls noch nicht geschehen
   git add .
   git commit -m "Initial commit: DoughCalculator + Sammelseite"
   git branch -M main
   git remote add origin git@github.com:<dein-user>/sauerteig-tools.git
   git push -u origin main
   ```

## Schritt 2 – Subdomain + Zielverzeichnis bei IONOS anlegen

1. IONOS-Kundencenter → **Domains & SSL** → `ruhmkorf.de` → Tab
   **Subdomains** → „Subdomain hinzufügen" → `apps` eingeben und
   speichern (falls `apps.ruhmkorf.de` noch nicht existiert).
2. Der Subdomain ein **eigenes, leeres Verzeichnis im Webspace**
   zuweisen (nicht Click & Build, nicht die Haupt-Website) – je nach
   Paket entweder direkt beim Anlegen der Subdomain wählbar, oder unter
   **Hosting → Webspace verwalten** nachträglich zuweisbar.
3. Den genauen Pfad dieses Verzeichnisses notieren, wie er im
   Webspace/FTP-Dateibrowser erscheint (z.B. `/apps.ruhmkorf.de/` oder
   ein anderes Muster, je nach Paket) – dieser Pfad kommt in Schritt 5
   in `remote_path`.
4. SSL: unter **SSL-Zertifikate** prüfen, ob für `apps.ruhmkorf.de`
   automatisch ein Zertifikat aktiv ist bzw. es aktivieren.

## Schritt 3 – SFTP-Zugangsdaten holen

1. IONOS-Kundencenter → **Hosting** → Kachel **„SFTP & SSH"**.
2. Servername sowie Benutzername/Passwort notieren (Linux-Hosting bei
   IONOS empfiehlt **SFTP auf Port 22**, nicht klassisches FTP/FTPS).
3. Falls möglich: einen eigenen FTP/SFTP-Benutzer anlegen, der **nur**
   auf das `apps`-Verzeichnis Zugriff hat (Sicherheitsempfehlung, nicht
   zwingend) – sonst reicht der Haupt-Zugang.

## Schritt 4 – Secrets in GitHub hinterlegen

Im Repo: **Settings → Secrets and variables → Actions → New repository
secret**, drei Secrets anlegen:

| Name | Wert |
|---|---|
| `IONOS_FTP_SERVER` | Servername aus Schritt 3 |
| `IONOS_FTP_USERNAME` | Benutzername aus Schritt 3 |
| `IONOS_FTP_PASSWORD` | Passwort aus Schritt 3 |

## Schritt 5 – Zielverzeichnis im Workflow eintragen

In `.github/workflows/deploy.yml` den Wert von `remote_path:` auf das in
Schritt 2.3 notierte Verzeichnis anpassen (aktuell als Platzhalter
`/apps.ruhmkorf.de/` eingetragen). Änderung committen und pushen.

## Schritt 6 – Deployment prüfen

1. Push auf `main` (oder im Repo unter **Actions** den Workflow „Deploy
   to IONOS (SFTP)" manuell über „Run workflow" starten).
2. Im **Actions**-Tab den Lauf beobachten – bei einem Fehler zeigt das
   Log meist direkt, ob Server/Zugangsdaten/Pfad nicht stimmen.
3. Nach Erfolg: `https://apps.ruhmkorf.de` aufrufen und prüfen, ob die
   Sammelseite erscheint und der Link zum DoughCalculator funktioniert.

## Danach

- Jede Änderung an Dateien unter `site/` und ein Push auf `main` geht
  automatisch live – kein manuelles Hochladen mehr nötig.
- Für die spätere DoughPilot-Web-Version genügt ein neuer Unterordner
  `site/doughpilot/` plus Aktivierung der entsprechenden Kachel in
  `site/index.html` – der bestehende Workflow deployt automatisch mit.
