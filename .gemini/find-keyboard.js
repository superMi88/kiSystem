const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'ttezlowa', 'Documents', 'Programmieren', 'kiSystem', 'public', 'index.html');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
console.log('--- Matches for keyboard ---');
lines.forEach((line, idx) => {
    if (line.includes('keyboard')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
