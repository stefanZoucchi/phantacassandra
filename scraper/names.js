// Abbinamento dei nomi tra siti diversi ("Nuno Tavares" = "Tavares N.", "Pio Esposito" = "Esposito F.P.", ...)
const norm = s => String(s || "").replace(/[øØ]/g, "o").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[’']/g, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
const base = c => { let t = norm(c); while (t.length > 1 && t[t.length - 1].length <= 2) t = t.slice(0, -1); return t; };
const inits = c => norm(c).slice(base(c).length);

const ALIAS = {
  "nuno tavares": "Tavares N.", "diogo leite": "Leite", "rodrigo mora": "Mora", "lucas perri": "Perri", "yan couto": "Couto",
  "nico paz": "Paz N.", "goncalo ramos": "Ramos G.", "g ramos": "Ramos G.", "cisse": "Cissè A.", "estupinian": "Estupinan", "hutchison": "Hutchinson",
  "c augusto": "Carlos Augusto", "kike perez": "Perez K.", "josep martinez": "Martinez Jo.", "anguissa": "Zambo Anguissa", "rafa marin": "Marin R.",
  "valde": "Valdepenas", "pote": "Goncalves P.", "goncalves": "Goncalves P.", "pedro goncalves": "Goncalves P.", "dodo": "Dodò", "ghejdemis": "Ghedjemis",
  "akinsamiro": "Akinsanmiro", "junior messias": "Messias", "floriani": "Floriani Mussolini", "sebastiano esposito": "Esposito Se.",
  "pio esposito": "Esposito F.P.", "lautaro": "Martinez L.", "lautaro martinez": "Martinez L.", "mbala nzola": "Nzola", "gustavo varela": "Varela G.",
  "ricardo mangas": "Mangas", "dany mota": "Mota", "fali cande": "Candè", "danilo veiga": "Veiga D.", "petar sucic": "Sucic P.", "daniel braganca": "Braganca",
  "akor adams": "Adams A.", "ismael kone": "Konè I.", "manu kone": "Konè M."
};
const TEAM_ALIAS = { "cagliari|carlos": "Kevin Carlos", "inter|martinez": "Martinez Jo.", "inter|esposito": "Esposito F.P.", "inter|stankovic": "Stankovic A.",
  "venezia|stankovic": "Stankovic F.", "venezia|adams": "Adams A.", "torino|adams": "Adams C.", "atalanta|orbic": "Obric", "sassuolo|esposito": "Esposito Se." };

function matchName(name, cands, team) {
  const n = norm(name), key = n.join(" ");
  if (!n.length) return null;
  const ta = TEAM_ALIAS[norm(team || "").join(" ") + "|" + key];
  if (ta && cands.includes(ta)) return ta;
  if (ALIAS[key] && cands.includes(ALIAS[key])) return ALIAS[key];
  let hit = cands.find(c => norm(c).join(" ") === key); if (hit) return hit;
  hit = cands.filter(c => base(c).join(" ") === key); if (hit.length === 1) return hit[0];
  const n2 = n.filter(x => x.length > 2); const k2 = (n2.length ? n2 : n).join(" ");
  hit = cands.filter(c => base(c).join(" ") === k2);
  if (hit.length > 1) {
    const short = n.filter(x => !base(hit[0]).includes(x));
    const h2 = hit.filter(c => inits(c).some(i => short.some(s => s.startsWith(i))));
    if (h2.length === 1) return h2[0];
  }
  if (hit.length === 1) return hit[0];
  hit = cands.filter(c => { const b = base(c); return b.every(x => n.includes(x)); });
  if (hit.length === 1) return hit[0];
  const last = (n2.length ? n2 : n).slice(-1)[0];
  hit = cands.filter(c => { const b = base(c); return b[b.length - 1] === last || b[0] === last; });
  return hit.length === 1 ? hit[0] : null;
}
const sameTeam = (a, b) => norm(a).join(" ") === norm(b).join(" ");

module.exports = { norm, matchName, sameTeam };
