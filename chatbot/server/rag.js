import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "knowledge");
const STOP = new Set("a an the is are was were be to of and or in on for with at by it this that as from about what how do does can i you your my".split(" "));

export function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w) && w.length > 1) ?? [];
}

// Split every .txt file in /knowledge into paragraph-based chunks.
export function loadKnowledge() {
  if (!fs.existsSync(dir)) return [];
  const chunks = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
    const paras = fs.readFileSync(path.join(dir, file), "utf8").split(/\n\s*\n/);
    let buf = "";
    for (const p of paras) {
      if ((buf + p).length > 350 && buf) { chunks.push({ source: file, text: buf.trim() }); buf = ""; }
      buf += p + "\n\n";
    }
    if (buf.trim()) chunks.push({ source: file, text: buf.trim() });
  }
  const df = new Map();
  for (const c of chunks) {
    c.tokens = tokenize(c.text);
    for (const t of new Set(c.tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  chunks.forEach((c) => (c.df = df));
  chunks.N = chunks.length;
  return chunks;
}

// Keyword scoring weighted by rarity (TF-IDF style). Words match if one starts with the other,
// so "applytracker" still finds "ApplyTrack". Returns top-k relevant chunks.
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

export function retrieve(chunks, query, k = 3) {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !chunks.length) return [];
  const idf = new Map(q.map((t) => {
    const df = chunks.filter((c) => c.tokens.some((x) => same(x, t))).length || 1;
    return [t, Math.log(1 + chunks.length / df)];
  }));
  return chunks
    .map((c) => {
      let score = 0;
      for (const t of q) {
        const tf = c.tokens.filter((x) => same(x, t)).length;
        if (tf) score += (1 + Math.log(tf)) * idf.get(t);
      }
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
