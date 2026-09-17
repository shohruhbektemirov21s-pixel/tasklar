const fs = require('fs');
let content = fs.readFileSync('D:/Task/backend/apps/uitexts/defaults.json', 'utf8');
content = content.trim();
if (content.endsWith('\\n')) content = content.slice(0, -2); // remove trailing backslash n
while (content.endsWith('n')) content = content.slice(0, -1);
while (content.endsWith('\\')) content = content.slice(0, -1);
if (!content.endsWith('}')) {
    content = content.substring(0, content.lastIndexOf('}') + 1);
}
const defaults = JSON.parse(content);
const tsx = fs.readFileSync('D:/Task/frontend/src/pages/ChangeRequests.tsx', 'utf8');

const regex = /tx\(['"]([^'"]+)['"]/g;
let match;
const keysInCode = new Set();
while ((match = regex.exec(tsx)) !== null) {
  keysInCode.add(match[1]);
}

const newKeys = {};
for (const key of keysInCode) {
  if (!defaults[key]) {
    const val = key.split('.').pop().replace(/_/g, ' ');
    const capitalized = val.charAt(0).toUpperCase() + val.slice(1);
    
    defaults[key] = {
      value: capitalized,
      note: 'pages/ChangeRequests.tsx'
    };
    newKeys[key] = capitalized;
  }
}

const sortedKeys = Object.keys(defaults).sort();
const sortedDefaults = {};
for (const k of sortedKeys) {
  sortedDefaults[k] = defaults[k];
}

fs.writeFileSync('D:/Task/backend/apps/uitexts/defaults.json', JSON.stringify(sortedDefaults, null, 2));

console.log('Added ' + Object.keys(newKeys).length + ' missing keys:');
console.log(Object.keys(newKeys).join(', '));
