# KI-System Server (Prisma & Gemini Flash)

Dieses System wurde auf **Prisma (SQLite)** und **Google Gemini 1.5 Flash** umgestellt.

## Features
- **Datenbank**: Nutzt SQLite via Prisma. Die gesamte Datenbank befindet sich in der Datei `dev.db`.
- **AI**: Nutzt das `gemini-1.5-flash` Modell (kostenloser Spielraum bei Google AI Studio).
- **Portabilität**: Da SQLite eine lokale Datei ist, kannst du den gesamten Ordner einfach zwischen deinem PC und Desktop kopieren (z.B. via Git, Dropbox oder USB-Stick).

## Einrichtung

1. **Abhängigkeiten installieren**:
   ```bash
   npm install
   ```

2. **API Key eintragen**:
   Öffne die Datei `.env` und trage deinen Google AI Studio API Key ein:
   ```env
   GOOGLE_API_KEY="DEIN_KEY_HIER"
   ```

3. **Datenbank initialisieren** (bereits erledigt, falls `dev.db` existiert):
   ```bash
   npx prisma db push
   ```

4. **Server starten**:
   ```bash
   npm run build
   npm start
   # ODER für Entwicklung (falls ts-node installiert ist)
   npx ts-node src/index.ts
   ```

## Portabilität (PC & Desktop)
Um das System auf beiden Geräten synchron zu halten, empfehle ich:
- **GitHub**: Lade das Projekt hoch (exklusive `.env` und `node_modules`).
- **Cloud-Speicher**: Lege den Ordner in OneDrive/Dropbox (beachte, dass SQLite Dateien bei gleichzeitiger Nutzung Probleme machen können).
- **Manuell**: Kopiere den Ordner. Die `dev.db` enthält alle deine Daten (Lichtstatus & Chatverlauf).
