// Test automatici offline sugli extractor (pacchetto pippo).
// Esegui: node scraper/test-extractors.js
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg); };

// Simula document per funzioni che leggono body.innerText
function withText(text, fn) {
  const prev = global.document;
  global.document = {
    body: { innerText: text },
    querySelector: () => ({ innerText: text }),
  };
  try { return fn(); }
  finally { global.document = prev; }
}

const X = require("./extractors");

// --- SportMediaset ---
{
  const sample = `
Formazioni Serie A - Giornata 9
Monza
3-4-2-1
28/10/2026
20:45
Napoli
4-3-3
ALLENATORE
Ivan Juric
Tornqvist
Bakoune
Lucchesi
Goglichidze
Birindelli
Mangas
Colombo
Foe-Ondoa
Robinson
Varela
Ngonge
ALLENATORE
Max Allegri
Milinkovic-Savic
Olivera
Rrahmani
Rafa Marin
Di Lorenzo
Lobotka
Anguissa
McTominay
Hojlund
Lang
Politano
PANCHINA
Cutrone, Colpani
Meret, De Bruyne
INDISPONIBILI
Nessuno
Nessuno
SQUALIFICATI
Nessuno
Nessuno
`;
  const r = withText(sample, X.sportmediaset);
  assert(r.giornata === 9, "spm giornata 9");
  assert(r.teams.Monza && r.teams.Monza.xi.length === 11, "spm Monza 11");
  assert(r.teams.Napoli && r.teams.Napoli.xi.length === 11, "spm Napoli 11");
  assert(r.teams.Monza.xi[0] === "Tornqvist", "spm primo titolare Monza");
}

// --- Lega post-gara (XI + panchina con minuti) ---
{
  const sample = `
Monza
3-4-2-1
Posizione
16th
Napoli
4-3-3
Posizione
6th
Tornqvist
Bakoune
Lucchesi
Goglichidze
Birindelli
Mangas
Colombo
Foe-Ondoa
Robinson
Varela
Ngonge
Milinkovic-Savic
Olivera
Rrahmani
Rafa Marin
Di Lorenzo
Lobotka
Anguissa
McTominay
Hojlund
Lang
Politano
Allenatori
Ivan Juric
Marco Landucci
PANCHINA
20 Demba Thiam
Portiere
6 Valentin Antov
Difensore
(74')
10 Patrick Cutrone
Attaccante
14 Ebenezer Akinsanmiro
Centrocampista
(60')
1 Alex Meret
Portiere
11 Kevin De Bruyne
Centrocampista
(63')
20 Lorenzo Lucca
Attaccante
(81')
`;
  const r = withText(sample, X.lega);
  const teamNames = Object.keys(r.teams || {});
  assert(teamNames.length >= 2, "lega 2 squadre: " + teamNames.join(","));
  const t0 = r.teams[teamNames[0]], t1 = r.teams[teamNames[1]];
  assert(t0.xi && t0.xi.length === 11, "lega XI casa");
  assert(t1.xi && t1.xi.length === 11, "lega XI trasferta");
  const benches = [...(t0.bench || []), ...(t1.bench || [])];
  const allSubs = [...(t0.subs || []), ...(t1.subs || [])];
  assert(benches.length > 0 || allSubs.length > 0, "lega bench o subs");
  if (allSubs.length) assert(allSubs.some(s => s.min > 0), "lega sub con minuto");
}


// --- Lega eventi sostituzioni ---
{
  const sample = `
Milan
3-5-1-1
Posizione
2nd
Bologna
4-2-3-1
Posizione
10th
Maignan
Estupinan
Pavlovic
Gabbia
Tomori
Fofana
Modric
Rabiot
Pulisic
Leao
Gimenez
Skorupski
Miranda
Casale
Heggem
Zortea
Ferguson
Freuler
Rowe
Odgaard
Orsolini
Castro
Allenatori
EVENTS
85'
Entra Christopher Nkunku - esce Santiago Giménez ( Milan )
72'
Entra Niclas Füllkrug - esce Rafael Leão ( Milan )
Statistiche della partita
`;
  const r = withText(sample, X.lega);
  assert(r.teams.Milan?.subs?.some(s => s.n.includes("Nkunku") && s.min === 85), "lega entra Nkunku 85");
  assert(r.teams.Milan?.exits?.some(s => s.n.includes("Gim") && s.min === 85), "lega esce Gimenez 85");
}

// --- History merge ---
{
  const { mergeHistory, load } = require("./history");
  const fs = require("fs");
  const path = require("path");
  const tmp = path.join(__dirname, "..", "docs", "history-players.json");
  const backup = fs.existsSync(tmp) ? fs.readFileSync(tmp, "utf8") : null;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ season: "test", giornate: [], players: {}, updated: null }));
    mergeHistory(9, {
      Monza: {
        xi: ["Varela", "Ngonge"],
        bench: ["Cutrone", "Antov"],
        subs: [{ n: "Antov", min: 74 }],
      },
    }, { Monza: [{ n: "InfortunatoX", k: "inf" }, { n: "SqualY", k: "squal" }] });
    const H = load();
    assert(H.players.Varela?.g["9"]?.s === "T", "history T");
    assert(H.players.Cutrone?.g["9"]?.s === "P", "history P");
    assert(H.players.Antov?.g["9"]?.s === "E" && H.players.Antov.g["9"].min === 74, "history E+min");
    assert(H.players.InfortunatoX?.g["9"]?.s === "I", "history I");
    assert(H.players.SqualY?.g["9"]?.s === "S", "history S");
  } finally {
    if (backup != null) fs.writeFileSync(tmp, backup);
    else fs.writeFileSync(tmp, JSON.stringify({ season: "2026-27", updated: null, giornate: [], players: {} }, null, 2));
  }
}

if (!process.exitCode) console.log("\nTutti i test extractor/history ok.");
else console.log("\nAlcuni test falliti.");
