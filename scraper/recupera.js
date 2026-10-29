// Recupera dalle versioni precedenti di docs/data.json (cronologia git) le previsioni
// che si sono perse nella giornata in corso: per ogni squadra e fonte mancante prende
// l'ultima previsione salvata prima che sparisse. Non sostituisce nulla di quello che c'è già.
//
// Variabile facoltativa: FONTI="spm" (o "spm,gazzetta"); vuoto = tutte le fonti.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FILE = "docs/data.json";
const OUT = path.join(__dirname, "..", FILE);
const only = String(process.env.FONTI || "").split(",").map(s => s.trim()).filter(Boolean);

const D = JSON.parse(fs.readFileSync(OUT, "utf8"));
const commits = execSync(`git log --format=%H -- ${FILE}`, { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").filter(Boolean);
console.log(`${commits.length} versioni di ${FILE} nella cronologia; giornata in corso: ${D.giornata}`);

const found = {}; // "squadra|fonte" -> true
let n = 0, read = 0;
for (const c of commits) { // dalla più recente alla più vecchia
  let old;
  try { old = JSON.parse(execSync(`git show ${c}:${FILE}`, { encoding: "utf8", maxBuffer: 1 << 26 })); } catch (e) { continue; }
  read++;
  if (old.giornata != D.giornata) { if (+old.giornata < +D.giornata) break; continue; } // giornata precedente: stop
  for (const [t, OT] of Object.entries(old.teams || {})) {
    const T = D.teams?.[t]; if (!T) continue;
    T.lineups = T.lineups || {};
    for (const [k, L] of Object.entries(OT.lineups || {})) {
      if (only.length && !only.includes(k)) continue;
      if (T.lineups[k] || found[t + "|" + k] || !L?.xi?.length) continue;
      T.lineups[k] = L; found[t + "|" + k] = true; n++;
      console.log(`+ ${t}: previsione ${k} recuperata (versione ${c.slice(0, 7)}, ${old.generated})`);
    }
  }
}
// la fonte risulta pubblicata se ora ha delle formazioni
for (const s of D.sources || []) {
  const teams = Object.values(D.teams || {}).filter(T => T.lineups?.[s.key]).length;
  if (teams && !s.ok) s.ok = true;
}
fs.writeFileSync(OUT, JSON.stringify(D));
console.log(`Fatto: ${n} previsioni recuperate (${read} versioni lette).`);
