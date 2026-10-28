// Ogni estrattore gira DENTRO la pagina del sito (page.evaluate) e legge solo il testo visibile.
// Restituisce {giornata, teams:{NomeSquadra:{mod, xi:[11], official?}}, out?:{NomeSquadra:[{n,k}]}, updated?, matches?}

const lineFormat = function () {
  const t = document.body.innerText;
  const teams = {}, out = {};
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
    const list = (lab) => { const r = tail.match(new RegExp(lab + "\\s*:\\s*([^\\n]+)", "i")); return r ? r[1].split(/,\s*/).map(s => s.replace(/\(.*?\)/g, "").trim()).filter(s => s && !/^nessun/i.test(s) && s !== "-") : []; };
    const o = [...list("Squalificati").map(n => ({ n, k: "squal" })), ...list("Indisponibili").map(n => ({ n, k: "inf" }))];
    if (o.length) out[h.name] = o;
  });
  const g = t.match(/(\d{1,2})\s*(?:\^|ª|a|°)\s*giornata/i) || t.match(/giornata\s+(\d{1,2})\b/i);
  const upd = (t.match(/(\d{1,2}\s+\w{3}\s+\d{4}\s*-\s*\d{1,2}:\d{2})/) || [])[1] || "";
  return { giornata: g ? +g[1] : null, teams, out, updated: upd };
};

const fantacalcio = function () {
  const t = document.body.innerText;
  const g = t.match(/Giornata\s+(\d{1,2})/);
  const DAYS = { "Lunedì": "Lun", "Martedì": "Mar", "Mercoledì": "Mer", "Giovedì": "Gio", "Venerdì": "Ven", "Sabato": "Sab", "Domenica": "Dom" };
  const MONTHS = { gennaio: "01", febbraio: "02", marzo: "03", aprile: "04", maggio: "05", giugno: "06", luglio: "07", agosto: "08", settembre: "09", ottobre: "10", novembre: "11", dicembre: "12" };
  const parts = t.split(/\n(Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica) (\d{1,2}) (\w+), (\d{1,2}:\d{2})\n/);
  const isMod = s => /^\d(-\d){2,3}$/.test(s);
  const isPct = s => /^\d{1,3}%$/.test(s);
  const matches = [], teams = {};
  let updated = "";
  for (let i = 1; i + 4 < parts.length + 1; i += 5) {
    const when = `${DAYS[parts[i]] || parts[i]} ${parts[i + 1].padStart(2, "0")}/${MONTHS[parts[i + 2].toLowerCase()] || "??"} ${parts[i + 3]}`;
    const body = (parts[i + 4] || "").split("Presentazione squadre")[0];
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
    for (const S of [H, A]) teams[S.name] = { mod: S.mod, xi: S.xi, pct: S.pct, bench: S.bench, official: S.xi.every(n => S.pct[n] === 100) };
  }
  return { giornata: g ? +g[1] : null, matches, teams, updated };
};

const gazzetta = function () {
  const t = document.querySelector("main")?.innerText || document.body.innerText;
  const g = t.match(/(\d{1,2})°\s*Giornata/i);
  const upd = (t.match(/Aggiornato:\s*([^\n]+)/) || [])[1] || "";
  const teams = {}, out = {};
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
    const grab = lab => L.filter(s => s.startsWith(lab + ":")).map(s => s.slice(lab.length + 1).split(/,\s*/).map(x => x.replace(/\(.*?\)/g, "").trim()).filter(x => x && !/^nessuno$/i.test(x)));
    const sq = grab("Squalificati"), ind = grab("Indisponibili");
    out[home] = [...(sq[0] || []).map(n => ({ n, k: "squal" })), ...(ind[0] || []).map(n => ({ n, k: "inf" }))];
    out[away] = [...(sq[1] || []).map(n => ({ n, k: "squal" })), ...(ind[1] || []).map(n => ({ n, k: "inf" }))];
  }
  return { giornata: g ? +g[1] : null, teams, out, updated: upd };
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
  const teams = {};
  const re = /\n([A-Za-zÀ-ÿ' ]+)\n(\d(?:-\d){2,3})\n(\d{2}\/\d{2}\/\d{4}) - (\d{2}:\d{2})\n([A-Za-zÀ-ÿ' ]+)\n(\d(?:-\d){2,3})\nTitolari\n([\s\S]*?)\nBALLOTTAGGI/g;
  let m, date = "";
  while ((m = re.exec(t))) {
    const names = m[7].split("\n").map(s => s.trim()).filter(s => s && !/^\d{1,3}%$/.test(s));
    if (names.length < 22) continue;
    teams[m[1]] = { mod: m[2], xi: names.slice(0, 11) };
    teams[m[5]] = { mod: m[6], xi: names.slice(11, 22) };
    date = date || m[3];
  }
  return { giornata: null, teams, firstDate: date, updated: "" };
};

module.exports = { lineFormat, fantacalcio, gazzetta, corriere, sosfanta };
