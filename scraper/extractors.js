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
      .filter(x => x && !/^Nessun/i.test(x) && x.length <= 30 && !/\s(di|del|della|al|alla|contro|da|in|out|e)\s/i.test(" " + x + " ") && /^[A-ZÀ-Ý]/.test(x));
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
  const m = t.match(/\n([^\n]+)\n(\d(?:-\d){2,3})\nPosizione\n[^\n]*\n([^\n]+)\n(\d(?:-\d){2,3})\n[^\n]*\nPosizione\n([\s\S]*?)\nAllenatori/);
  if (!m) return { teams: {} };
  const names = m[5].split("\n").map(x => x.trim()).filter(x => x && !/^\d{1,2}$/.test(x));
  if (names.length < 22) return { teams: {} };
  return { teams: { [m[1].trim()]: { mod: m[2], xi: names.slice(0, 11) }, [m[3].trim()]: { mod: m[4], xi: names.slice(11, 22) } } };
};

module.exports = { lega, skyMatch, lineFormat, fantacalcio, gazzetta, corriere, sosfanta };
