/**
 * Erzeugt eine simulierte Test-E-Mail auf localhost:4000
 * Verwendung:
 *   node scripts/test-mail.js [question | info | spam]
 *   node scripts/test-mail.js "Eigener Betreff" "Eigener Inhalt der E-Mail..."
 */

const arg1 = process.argv[2] || 'question';
const arg2 = process.argv[3];
const arg3 = process.argv[4];
const arg4 = process.argv[5];

let payload = {};

if (['question', 'info', 'spam', 'newsletter'].includes(arg1.toLowerCase())) {
  payload = { preset: arg1.toLowerCase() };
} else {
  payload = {
    subject: arg1,
    body: arg2 || 'Dies ist eine manuelle Test-E-Mail über das Testskript.',
    fromName: arg3 || 'Praxis Dr. Weber',
    from: arg4 || 'termin@zahnarzt-weber.de'
  };
}

try {
  const res = await fetch('http://localhost:4000/api/mail/test-inject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await res.json();

  if (json.success) {
    console.log('\n✅ TEST-MAIL ERFOLGREICH EINGESPIELT!');
    console.log(`   ID: #${json.email.id}`);
    console.log(`   Betreff: "${json.email.subject}"`);
    console.log(`   Absender: ${json.email.fromName || json.email.from}`);
    console.log('\n🚀 Der KI-Agent Run wurde automatisch gestartet.');
    console.log('   -> Sieh dir das Ergebnis im Arbeitstisch (Agent-Briefing) oder in der E-Mail-Übersicht an.\n');
  } else {
    console.error('❌ Fehler vom Server:', json.error);
  }
} catch (err) {
  console.error('❌ Verbindungsfehler zu localhost:4000:', err.message);
  console.error('   Läuft der Server? (npm run server / node build/index.js)');
}
