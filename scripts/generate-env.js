import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env');
const outputPath = path.join(__dirname, '../public/env-config.js');

let mobileServerUrl = 'https://ki.kleiner-wald-server.de'; // Default fallback

try {
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^MOBILE_SERVER_URL=(.+)$/m);
        if (match && match[1]) {
            mobileServerUrl = match[1].trim();
        }
    }
} catch (err) {
    console.warn('Fehler beim Lesen der .env Datei, verwende Standardwert:', err);
}

const content = `// Generated file - do not edit manually or commit to version control
window.ENV_CONFIG = {
  MOBILE_SERVER_URL: "${mobileServerUrl}"
};
`;

try {
    const publicDir = path.dirname(outputPath);
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, content, 'utf8');
    console.log(`env-config.js erfolgreich generiert mit MOBILE_SERVER_URL=${mobileServerUrl}`);
} catch (err) {
    console.error('Fehler beim Schreiben von env-config.js:', err);
}
