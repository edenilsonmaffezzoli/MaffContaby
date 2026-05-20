import { readFileSync } from 'node:fs';

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

const p = process.argv[2] ?? 'C:/Edenilson/casos-teste-qase-corrigido.csv';
const lines = readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const h = parseCsvLine(lines[0]);
console.log('header', h.length, h);
for (let i = 1; i < lines.length; i++) {
  const f = parseCsvLine(lines[i]);
  console.log(`row ${i}`, f.length, f.length === h.length ? 'OK' : 'MISMATCH');
}
