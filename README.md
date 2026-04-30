# kiSystem - Gemini Mobile Light

Ein intelligentes Lichtsteuerungssystem mit KI-Integration, das sowohl als Desktop-Erweiterung unter Windows als auch als mobile App funktioniert.

## 🚀 Vision & Konzept

Das Ziel dieses Projekts ist ein nahtloses Steuerungs-Interface für Smart-Home-Elemente (simuliert durch das "Licht"), das durch Google Gemini KI unterstützt wird. Die Anwendung soll sich wie ein integraler Bestandteil des Betriebssystems anfühlen.

### 💻 Desktop-Verhalten (Windows)
Auf dem PC wird **Electron** genutzt, um eine tiefere Systemintegration zu erreichen:
- **System Tray Icon:** Ein kleines Icon in der Taskleiste (unten rechts) zeigt den Status an und dient als Schnellzugriff.
- **Side-Panel Menü:** Beim Klick auf das Icon öffnet sich von der rechten Seite ein Menü, ähnlich dem Windows-Benachrichtigungszentrum.
- **Kachel-Design:** Das Menü besteht aus modernen, schwebenden Kacheln mit Abständen dazwischen. Das Design nutzt Transparenz-Effekte (Glassmorphism), sodass der Hintergrund dezent durchscheint.
- **Hintergrund-Betrieb:** Der Server läuft unsichtbar im Hintergrund, während das Tray-Icon die Kontrolle ermöglicht.

### 📱 Mobiles Verhalten (Android/iOS)
Die Anwendung ist von Grund auf "Mobile First" entwickelt:
- **Responsive Web-Design:** Das Frontend ist so optimiert, dass es auf dem Handy wie eine native App aussieht.
- **PWA-Unterstützung:** Die Anwendung kann als Progressive Web App direkt auf dem Homescreen installiert werden.
- **Plattformübergreifender Code:** Die Logik und das Design der Kacheln sind so geschrieben, dass sie sowohl in Electron als auch im mobilen Browser identisch funktionieren.

---

## 🛠 Technologie-Stack

- **Backend:** Node.js & Express (API-Server)
- **KI-Logik:** Google Gemini API (via MCP SDK)
- **Datenbank:** PostgreSQL & Prisma ORM
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript
- **Desktop-Wrapper:** Electron
- **Containerisierung:** Docker (für die PostgreSQL Datenbank)

---

## 📂 Projektstruktur

- `/src`: Backend-Logik und API-Endpunkte.
- `/public`: Das geteilte Frontend (HTML/CSS), das sowohl vom Browser als auch von Electron geladen wird.
- `/electron` (geplant): Konfiguration für das Windows Side-Panel und Tray-Icon.
- `start_postgres.bat`: Schneller Start der Datenbank-Umgebung via Docker.

---

## 🛠 Geplante Features
- [ ] **Electron Integration:** Umstellung auf Desktop-App mit Tray-Icon.
- [ ] **Dynamic Tiles:** Kacheln, die ihren Status (Licht an/aus) in Echtzeit aktualisieren.
- [ ] **Voice-to-Light:** Sprachsteuerung über Gemini direkt vom Desktop oder Handy.
- [ ] **Translucency:** Implementierung von Mica/Acrylic Effekten für das Windows-Panel.

---

## 🚦 Startanleitung

1. **Datenbank:** `start_postgres.bat` ausführen (erfordert Docker Desktop).
2. **Setup:** `npm install` und `npx prisma generate` (einmalig).
3. **Build:** Wird automatisch vom KI-Assistenten (Antigravity) bei Änderungen ausgeführt.
4. **Starten:** Um den Server und die Desktop-App (Electron) zu starten, nutze:
   ```powershell
   npm run dev
   ```

*Hinweis: `npm run dev` startet gleichzeitig den Express-Server auf Port 3001 und das Electron Side-Panel.*
