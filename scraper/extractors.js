// Ogni estrattore gira DENTRO la pagina del sito (page.evaluate) e legge solo il testo visibile.
// Restituisce {giornata, teams:{NomeSquadra:{mod, xi:[11], official?}}, out?:{NomeSquadra:[{n,k}]}, updated?, matches?}

const lineFormat = function () {
  const t = document.body.innerText;
  const teams = {}, out = {}, ball = {};
  const re = /^\s*([A-Za-zÀ-ÿ' .]+?)\s*\((\d(?:-\d){2,3})\)\s*:\s*(.+)$/gm;
  const hits = [];
  let m;
  while ((m = re.exec(t))) hits.push({ i: m.index, end: re.lastIndex, name: m[1].trim(), mod: m[2], body: m[3] });
  hits.forEach((h, k) => {
    const body = h.body.replace(/\.?\s*(All\.|Allenatore:?)\s.*$/i, "");
    const xi = body.split(/[;,]/).map(s => s.trim().replace(/\.$/, "")).filter(Boolean);
    if (xi.length < 10 || xi.length > 12 || teams[h.name]) return; // 10: virgola mancante sul sito, sistemata dopo
    teams[h.name] = { mod: h.mod, xi };
    const tail = t.slice(h.end, k + 1 < hits.length ? hits[k + 1].i : h.end + 800);
    const list = (lab) => { const r = tail.match(new RegExp(lab + "\\s*:\\s*([^\\n]+)", "i")); return r ? r[1].split(/,\s*(?![^()]*\))/).map(s => ({ n: s.replace(/\(.*?\)/g, "").trim().replace(/\.$/, ""), note: (s.match(/\((.*?)\)/) || [])[1] || "" })).filter(o => o.n && !/^nessun/i.test(o.n) && o.n !== "-") : []; };
    const o = [...list("Squalificat[io]").map(x => ({ n: x.n, k: "squal" })), ...list("(?:Indisponibili|Infortunati|Assenti)").map(x => ({ n: x.n, k: /valutar|\bin dubbio\b|\bin forse\b/i.test(x.note) ? "dubbio" : "inf" }))];
    if (o.length) out[h.name] = o;
    const b = list("Ballottagg[io]").map(x => x.n.replace(/\s*\d+\s*%.*$/, "").trim()).filter(x => /-/.test(x));
    if (b.length) ball[h.name] = b;
  });
  const g = t.match(/(\d{1,2})\s*(?:\^|ª|a|°)\s*giornata/i) || t.match(/giornata\s+(\d{1,2})\b/i);
  const upd = (t.match(/(\d{1,2}\s+\w{3}\s+\d{4}\s*-\s*\d{1,2}:\d{2})/) || [])[1] || "";
  return { giornata: g ? +g[1] : null, teams, out, ball, updated: upd };
};

const fantacalcio = function () {
  const t = document.body.innerText;
  const g = t.match(/Giornata\s+(\d{1,2})/);
  const DAYS = { "Lunedì": "Lun", "Martedì": "Mar", "Mercoledì": "Mer", "Giovedì": "Gio", "Venerdì": "Ven", "Sabato": "Sab", "Domenica": "Dom" };
  const MONTHS = { gennaio: "01", febbraio: "02", marzo: "03", aprile: "04", maggio: "05", giugno: "06", luglio: "07", agosto: "08", settembre: "09", ottobre: "10", novembre: "11", dicembre: "12" };
  const parts = t.split(/\n(Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica) (\d{1,2}) (\w+), (\d{1,2}:\d{2})\n/);
  const isMod = s => /^\d(-\d){2,3}$/.test(s);
  const isPct = s => /^\d{1,3}%$/.test(s);
  const matches = [], teams = {}, ball = {}, out = {};
  let updated = "";
  for (let i = 1; i + 4 < parts.length + 1; i += 5) {
    const when = `${DAYS[parts[i]] || parts[i]} ${parts[i + 1].padStart(2, "0")}/${MONTHS[parts[i + 2].toLowerCase()] || "??"} ${parts[i + 3]}`;
    const body = (parts[i + 4] || "").split("Presentazione squadre")[0];
    // "Dettaglio calciatori": Ballottaggi (nome, %, nome, %), Squalificati, Infortunati (nome + descrizione). Le due squadre
    // sono mescolate (colonna sinistra e destra): l'abbinamento alla squadra lo fa build.js con le rose.
    const det = ((parts[i + 4] || "").split("Dettaglio calciatori")[1] || "");
    const sec = (lab, next) => (det.split(new RegExp("\\n" + lab + "\\n"))[1] || "").split(new RegExp("\\n(?:" + next + ")\\n"))[0];
    const bl = sec("Ballottaggi", "Squalificati").split("\n").map(x => x.trim()).filter(x => x && !/^\d{1,3}%$/.test(x) && !/^Nessun/i.test(x));
    const pairs = []; for (let k = 0; k + 1 < bl.length; k += 2) pairs.push(bl[k] + " - " + bl[k + 1]);
    const names = txt => txt.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).flatMap(x => x.split("\n")).map(x => x.trim())
      .map(x => /^Nessun/i.test(x) ? "-" : x) // "Nessun calciatore" = colonna vuota: lo tengo come separatore tra casa e trasferta
      .filter(x => x === "-" || (x && x.length <= 30 && !/\s(di|del|della|al|alla|contro|da|in|out|e)\s/i.test(" " + x + " ") && /^[A-ZÀ-Ý]/.test(x)));
    const outs = [...names(sec("Squalificati", "Diffidati")).map(n => ({ n, k: "squal" })), ...names(sec("Infortunati", "In dubbio")).map(n => ({ n, k: "inf" })), ...names(sec("In dubbio", "Presentazione squadre|Dettaglio calciatori")).map(n => ({ n, k: "dubbio" }))];
    const L = body.split("\n").map(s => s.trim()).filter(s => s && !/connection is too slow/i.test(s));
    const tIdx = L.map((s, k) => (isMod(L[k + 1] || "") ? k : -1)).filter(k => k >= 0);
    if (tIdx.length < 2) continue;
    const side = (from, to) => {
      const name = L[from], mod = L[from + 1], xi = [], pct = {}, bench = [];
      let inBench = false;
      for (let k = from + 2; k < to; k++) {
        if (L[k] === "Panchina") { inBench = true; continue; }
        if (isPct(L[k]) || /^Ultimo aggiornamento/.test(L[k])) continue;
        if (!isPct(L[k + 1] || "")) continue;
        if (inBench) bench.push(L[k]); else { xi.push(L[k]); pct[L[k]] = parseInt(L[k + 1]); }
      }
      return { name, mod, xi, pct, bench };
    };
    const endIdx = L.findIndex(s => /^Ultimo aggiornamento/.test(s));
    const u = endIdx >= 0 ? L[endIdx].replace(/^Ultimo aggiornamento\s*/, "") : "";
    if (u > updated) updated = u;
    const H = side(tIdx[0], tIdx[1]), A = side(tIdx[1], endIdx > 0 ? endIdx : L.length);
    if (H.xi.length !== 11 || A.xi.length !== 11) continue;
    matches.push({ home: H.name, away: A.name, when });
    // formazione ufficiale: Fantacalcio.it mette tutti gli 11 titolari al 100%
    for (const S of [H, A]) { teams[S.name] = { mod: S.mod, xi: S.xi, pct: S.pct, bench: S.bench, official: S.xi.every(n => S.pct[n] === 100) }; ball[S.name] = pairs; out[S.name] = outs; }
  }
  return { giornata: g ? +g[1] : null, matches, teams, ball, out, mixed: true, updated };
};

const gazzetta = function () {
  const t = document.querySelector("main")?.innerText || document.body.innerText;
  const g = t.match(/(\d{1,2})°\s*Giornata/i);
  const upd = (t.match(/Aggiornato:\s*([^\n]+)/) || [])[1] || "";
  const teams = {}, out = {}, ball = {};
  for (const blk of t.split(/Torna su/)) {
    const L = blk.split("\n").map(s => s.trim()).filter(Boolean);
    const mi = L.map((s, k) => /^Modulo:/.test(s) ? k : -1).filter(k => k >= 0);
    if (mi.length < 2) continue;
    const home = L[mi[0] - 2], away = L[mi[0] - 1];
    const mods = mi.map(k => L[k].replace(/^Modulo:\s*/, ""));
    const hx = [], ax = [];
    for (const s of L) {
      let m = s.match(/^(\D.*?)\s+(\d{1,2})$/); if (m && hx.length < 11 && !/^(Ore|Modulo|Allenatore)/.test(s)) { hx.push(m[1]); continue; }
      m = s.match(/^(\d{1,2})\s+(\D.*)$/); if (m && ax.length < 11) ax.push(m[2]);
    }
    if (hx.length !== 11 || ax.length !== 11) continue;
    teams[home] = { mod: mods[0], xi: hx }; teams[away] = { mod: mods[1], xi: ax };
    // "Indisponibili: Stones (Da valutare), Lautaro Martínez (Rientro alla 12)" -> "da valutare" diventa in dubbio
    const grab = lab => L.filter(s => s.startsWith(lab + ":")).map(s => s.slice(lab.length + 1).split(/,\s*(?![^()]*\))/).map(x => ({ n: x.replace(/\(.*?\)/g, "").trim(), note: (x.match(/\((.*?)\)/) || [])[1] || "" })).filter(x => x.n && !/^nessuno$/i.test(x.n)));
    const sq = grab("Squalificati"), ind = grab("Indisponibili");
    // "Ballottaggio: Halhal-Schingtienne 60-40%, Diouf-Spence, 60-40%" -> ["Halhal-Schingtienne", "Diouf-Spence"]
    const bl = L.filter(x => /^Ballottagg(io|i):/i.test(x)).map(x => x.replace(/^Ballottagg(io|i):\s*/i, "").split(/%\s*,?\s*/).map(seg => seg.replace(/,?\s*\d+\s*-\s*\d+\s*%?\s*$/, "").replace(/\.$/, "").trim()).filter(seg => /-/.test(seg) && !/^nessun/i.test(seg)));
    ball[home] = bl[0] || []; ball[away] = bl[1] || [];
    const kind = o => /valutar|\bin dubbio\b|\bin forse\b/i.test(o.note) ? "dubbio" : "inf";
    out[home] = [...(sq[0] || []).map(o => ({ n: o.n, k: "squal" })), ...(ind[0] || []).map(o => ({ n: o.n, k: kind(o) }))];
    out[away] = [...(sq[1] || []).map(o => ({ n: o.n, k: "squal" })), ...(ind[1] || []).map(o => ({ n: o.n, k: kind(o) }))];
  }
  return { giornata: g ? +g[1] : null, teams, out, ball, updated: upd };
};

const corriere = function () {
  const t = document.querySelector("main")?.innerText || document.body.innerText;
  const g = t.match(/(\d{1,2})°\s*giornata/i);
  const teams = {};
  for (const blk of t.split(/Torna su/)) {
    if (!/Titolari/.test(blk)) continue;
    const [head, rest] = blk.split("Titolari");
    const H = head.split("\n").map(s => s.trim()).filter(Boolean).slice(-4);
    const names = rest.split(/COS. IN CAMPO/)[0].split("\n").map(s => s.trim()).filter(s => s && !/^\d+$/.test(s));
    if (H.length < 4 || names.length < 22) continue;
    teams[H[0]] = { mod: H[1], xi: names.slice(0, 11) };
    teams[H[2]] = { mod: H[3], xi: names.slice(11, 22) };
  }
  return { giornata: g ? +g[1] : null, teams, updated: "" };
};

const sosfanta = function () {
  const t = document.querySelector("main")?.innerText || document.body.innerText;
  const teams = {}, ball = {};
  // intestazione di ogni partita; il blocco finisce dove inizia la partita dopo (le partite già giocate non hanno BALLOTTAGGI)
  const re = /\n([A-Za-zÀ-ÿ' ]+)\n(\d(?:-\d){2,3})\n(\d{2}\/\d{2}\/\d{4}) - (\d{2}:\d{2})\n([A-Za-zÀ-ÿ' ]+)\n(\d(?:-\d){2,3})\nTitolari\n/g;
  const H = [...t.matchAll(re)];
  let date = "";
  H.forEach((m, i) => {
    const blk = t.slice(m.index + m[0].length, i + 1 < H.length ? H[i + 1].index : t.length);
    const body = blk.split(/\n(?:BALLOTTAGGI|INDISPONIBILI|SQUALIFICATI|PANCHINA|Panchina)\b/)[0];
    // BALLOTTAGGI: "51%\n-\n49%\nEstupinan - Diawara S." (le due squadre insieme: l'abbinamento lo fa build.js)
    const bz = (blk.split(/\nBALLOTTAGGI\b/)[1] || "").split(/\n(?:INDISPONIBILI|SQUALIFICATI|DIFFIDATI)\b/)[0];
    const pairs = bz.split("\n").map(s => s.trim()).filter(s => / - /.test(s) && /[A-Za-zÀ-ÿ]/.test(s));
    ball[m[1]] = pairs; ball[m[5]] = pairs;
    const names = body.split("\n").map(s => s.trim()).filter(s => s && !/^\d{1,3}%$/.test(s));
    if (names.length < 22) return;
    teams[m[1]] = { mod: m[2], xi: names.slice(0, 11) };
    teams[m[5]] = { mod: m[6], xi: names.slice(11, 22) };
    date = date || m[3];
  });
  return { giornata: null, teams, ball, firstDate: date, updated: "" };
};

// Sky, articolo di una singola partita: "GENOA (4-2-3-1), la probabile formazione" + elenco (la seconda squadra è in una scheda nascosta)
const skyMatch = function () {
  const teams = {};
  const heads = [...document.querySelectorAll("h2,h3,h4,strong,b,p,div,span")].filter(e => e.children.length === 0 && /\(\d(?:-\d){2,3}\),?\s*la probabile formazione/i.test(e.textContent));
  for (const e of heads) {
    const m = e.textContent.trim().match(/^(.+?)\s*\((\d(?:-\d){2,3})\)/); if (!m || teams[m[1]]) continue;
    // a volte l'elenco è nello stesso paragrafo: "MONZA (3-4-2-1), la probabile formazione: Törnqvist; ..."
    const par = e.parentElement, same = par && par.tagName === "P" ? (par.textContent.split(/la probabile formazione:?/i)[1] || "") : "";
    let txt = /;.*;.*;/.test(same) ? same.trim().split("\n")[0] : "", n = e;
    for (let k = 0; k < 6 && !txt; k++) { for (let x = n.nextElementSibling; x && !txt; x = x.nextElementSibling) if (/;.*;.*;/.test(x.textContent)) txt = x.textContent.trim().split("\n")[0]; n = n.parentElement; if (!n) break; }
    const body = txt.replace(/\.?\s*(All\.|Allenatore:?)\s.*$/i, "");
    const xi = body.split(/[;,]/).map(x => x.trim().replace(/\.$/, "")).filter(Boolean);
    if (xi.length >= 10 && xi.length <= 12) teams[m[1]] = { mod: m[2], xi };
  }
  const g = location.href.match(/(\d{1,2})-giornata/);
  const d = location.href.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  return { giornata: g ? +g[1] : null, teams, out: {}, updated: d ? `${d[3]}/${d[2]}` : "" };
};

// Lega Serie A, pagina della partita: "Sassuolo\n4-3-3\nPosizione\n14th\nLazio\n4-3-3\n1st\nPosizione\n80\nTurati\n26\n..." fino ad "Allenatori"
const lega = function () {
  const t = document.body.innerText;
  // Team\nmod\nPosizione\nrank\nTeam\nmod\nPosizione\nrank\nXI...\nAllenatori
  let m = t.match(/\n([A-ZÀ-Ü][^\n]{1,40})\n(\d(?:-\d){2,3})\nPosizione\n[^\n]*\n([A-ZÀ-Ü][^\n]{1,40})\n(\d(?:-\d){2,3})\nPosizione\n[^\n]*\n([\s\S]*?)\nAllenatori/i);
  if (!m) m = t.match(/\n([A-ZÀ-Ü][^\n]{1,40})\n(\d(?:-\d){2,3})\nPosizione[^\n]*\n([A-ZÀ-Ü][^\n]{1,40})\n(\d(?:-\d){2,3})\nPosizione[^\n]*\n([\s\S]*?)\nAllenatori/i);
  if (!m) return { teams: {} };
  const names = m[5].split("\n").map(x => x.trim()).filter(x => x && !/^\d{1,2}$/.test(x));
  if (names.length < 22) return { teams: {} };
  const home = m[1].trim(), away = m[3].trim();
  const teams = {
    [home]: { mod: m[2], xi: names.slice(0, 11) },
    [away]: { mod: m[4], xi: names.slice(11, 22) },
  };
  // Post-gara (tab /lineups): sezione PANCHINA con eventuali minuti di ingresso "(74')"
  // Pattern tipico: Nome\nRuolo\n(74') oppure Nome\nRuolo senza minuto
  const pan = t.split(/\nPANCHINA\n/i)[1] || t.split(/\nPanchina\n/i)[1] || "";
  if (pan) {
    const chunk = pan.split(/\n(?:TESTA A TESTA|Statistiche|CLASSIFICA|Allenatori)/i)[0] || pan;
    const lines = chunk.split("\n").map(s => s.trim()).filter(Boolean);
    // Rimuove prefissi numero maglia "20 Demba Thiam" → "Demba Thiam"
    const stripNum = s => s.replace(/^\d{1,2}\s+/, "").trim();
    const isRole = s => /^(Portiere|Difensore|Centrocampista|Attaccante|Allenatore)/i.test(s);
    const isMin = s => /^\(\d{1,3}(?:\+\d{1,2})?'\)$/.test(s);
    const benches = { [home]: [], [away]: [] };
    let side = home, i = 0;
    // euristica: prima metà panchina casa, dopo un secondo blocco o dopo ~9-15 nomi → trasferta
    // meglio: conta i nomi fino a ripetizione di struttura; split a metà se due team
    const entries = [];
    while (i < lines.length) {
      let name = lines[i];
      if (/^Allenatori$/i.test(name)) break;
      if (isMin(name) || isRole(name) || /^\d+$/.test(name)) { i++; continue; }
      name = stripNum(name);
      if (!name || name.length < 2 || name.length > 40) { i++; continue; }
      let min = null, j = i + 1;
      if (j < lines.length && isRole(lines[j])) j++;
      if (j < lines.length && isMin(lines[j])) { min = parseInt(lines[j].replace(/\D/g, ""), 10); j++; }
      // secondo minuto (uscita) opzionale
      if (j < lines.length && isMin(lines[j])) j++;
      entries.push({ n: name, min });
      i = j > i + 1 ? j : i + 1;
    }
    if (entries.length >= 4) {
      // split casa/trasferta: tipicamente ~7-12 per lato
      const mid = Math.ceil(entries.length / 2);
      benches[home] = entries.slice(0, mid);
      benches[away] = entries.slice(mid);
      for (const side of [home, away]) {
        teams[side].bench = benches[side].map(e => e.n);
        teams[side].subs = benches[side].filter(e => e.min != null).map(e => ({ n: e.n, min: e.min }));
      }
    }
  }
  return { teams };
};

// SportMediaset: una pagina per partita (?match=id1:id2). Testo tipico:
// TEAM1\nMOD1\nDATA\nORA\nTEAM2\nMOD2\nALLENATORE\nCoach1\n11 giocatori\nALLENATORE\nCoach2\n11 giocatori
// poi PANCHINA / INDISPONIBILI (due righe: casa, trasferta) / SQUALIFICATI
const sportmediaset = function () {
  const t = document.body.innerText;
  const g = t.match(/(?:Formazioni Serie A - )?Giornata\s+(\d+)/i);
  const teams = {}, out = {};
  // blocchi ALLENATORE: coach + 11 titolari, si ferma al prossimo ALLENATORE/PANCHINA/ecc.
  const blocks = [];
  const re = /ALLENATORE\n([^\n]+)\n([\s\S]*?)(?=\nALLENATORE\n|\nPANCHINA\n|\nINDISPONIBILI\n|\nSQUALIFICATI\n|$)/gi;
  let m;
  while ((m = re.exec(t))) {
    const xi = m[2].split("\n").map(s => s.trim()).filter(s =>
      s && !/^(ALLENATORE|PANCHINA|INDISPONIBILI|SQUALIFICATI|LE ULTIME)$/i.test(s) &&
      !/^\d(?:-\d){2,3}$/.test(s) && !/^\d{1,2}\/\d{1,2}/.test(s) && !/^\d{1,2}:\d{2}$/.test(s)
    ).slice(0, 11);
    if (xi.length >= 10) blocks.push({ coach: m[1].trim(), xi });
  }
  // intestazione: TEAM1 MOD1 DATA ORA TEAM2 MOD2
  const head = t.match(/\n([A-ZÀ-Ü][A-Za-zÀ-ÿ' .]{2,30})\n(\d(?:-\d){2,3})\n(\d{1,2}\/\d{1,2}\/\d{4})\n(\d{1,2}:\d{2})\n([A-ZÀ-Ü][A-Za-zÀ-ÿ' .]{2,30})\n(\d(?:-\d){2,3})\n/i);
  if (head && blocks.length >= 2) {
    const home = head[1].trim(), away = head[5].trim();
    teams[home] = { mod: head[2], xi: blocks[0].xi };
    teams[away] = { mod: head[6], xi: blocks[1].xi };
    // INDISPONIBILI: due righe consecutive dopo la label (casa poi trasferta), elenco separato da virgole
    const ind = t.match(/INDISPONIBILI\n([^\n]*)\n([^\n]*)/i);
    if (ind) {
      const parseList = (line, team) => {
        const names = line.split(/,\s*/).map(s => s.trim()).filter(s => s && !/^nessun/i.test(s) && s !== "-");
        if (names.length) out[team] = names.map(n => ({ n, k: "inf" }));
      };
      parseList(ind[1], home);
      parseList(ind[2], away);
    }
    // SQUALIFICATI (stessa struttura, se presenti)
    const sq = t.match(/SQUALIFICATI\n([^\n]*)\n([^\n]*)/i);
    if (sq) {
      const addSq = (line, team) => {
        const names = line.split(/,\s*/).map(s => s.trim()).filter(s => s && !/^nessun/i.test(s) && s !== "-" && !/^LE ULTIME/i.test(s));
        if (!names.length) return;
        out[team] = (out[team] || []).concat(names.map(n => ({ n, k: "squal" })));
      };
      addSq(sq[1], home);
      addSq(sq[2], away);
    }
  }
  return { giornata: g ? +g[1] : null, teams, out, updated: head ? head[3] : "" };
};

module.exports = { lega, skyMatch, lineFormat, fantacalcio, gazzetta, corriere, sosfanta, sportmediaset };
