// Işık Işık (Advent 2026): anonymous one-line responses.
// Stores only: day, text, amin count, hidden flag, a random edit key, created time. No names, no IPs.
const FIRST = "2026-11-29", LAST = "2026-12-25", MAXLEN = 90, DAILY_CAP = 3000;

const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

const todayIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

const BAD_PREFIX = ["siktir", "sikeyim", "sikerim", "sikim", "sikiyim", "sikik", "sikis", "amk", "amina", "amcik", "orospu", "oruspu", "orosbu", "yarrak", "yarak", "pezevenk", "kahpe", "ibne", "pust", "gavat", "serefsiz", "gotveren", "gotlek", "fuck", "shit", "bitch", "asshole", "motherf"];
const BAD_EXACT = ["aq", "amq", "mk", "sg", "pic", "sik"];
function fold(s) {
  return s.toLocaleLowerCase("tr-TR").replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/[@4]/g, "a").replace(/0/g, "o").replace(/[1!]/g, "i").replace(/3/g, "e").replace(/\$/g, "s");
}
export function check(raw) {
  const t = String(raw ?? "").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f]/g, " ").trim().replace(/\s+/g, " ");
  if (t.length < 2) return { err: "Bir cümle yaz." };
  if (t.length > MAXLEN) return { err: "Cümle en fazla 90 karakter olabilir." };
  if (/(https?:|www\.|\.com|\.net|\.org|\.tr\b|@|t\.me|\d[\d\s().-]{6,}\d)/i.test(t)) return { err: "Bağlantı, e-posta ya da telefon numarası yazılamaz." };
  if (/(^|[^a-zçğıöşü])göt($|[^a-zçğıöşü])/i.test(t)) return { err: "Bu cümle paylaşılamıyor. Lütfen başka sözcüklerle yaz." };
  const words = fold(t).split(/[^a-z]+/).filter(Boolean);
  for (const w of words) if (BAD_EXACT.includes(w) || BAD_PREFIX.some(p => w.startsWith(p))) return { err: "Bu cümle paylaşılamıyor. Lütfen başka sözcüklerle yaz." };
  return { t };
}

let ready = false;
async function db(env) {
  if (!ready) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS isik (id INTEGER PRIMARY KEY AUTOINCREMENT, d TEXT NOT NULL, t TEXT NOT NULL DEFAULT '', a INTEGER NOT NULL DEFAULT 0, h INTEGER NOT NULL DEFAULT 0, k TEXT NOT NULL, c INTEGER NOT NULL)").run();
    ready = true;
  }
  return env.DB;
}
const sameOrigin = (req, u) => { const o = req.headers.get("origin"); return !o || o === u.origin; };
const body = async req => { try { const t = await req.text(); return t.length > 2000 ? null : JSON.parse(t); } catch { return null; } };
const isId = v => Number.isInteger(v) && v > 0;

async function api(req, env, u) {
  if (!env.DB) return json({ err: "db" }, 503);
  const D = await db(env), p = u.pathname.replace(/\/$/, ""), m = req.method;

  if (p === "/api/isik" && m === "GET") {
    const n = await D.prepare("SELECT COUNT(*) AS n FROM isik WHERE h=0").first("n");
    const { results } = await D.prepare("SELECT id,d,t,a FROM isik WHERE h=0 AND t<>'' ORDER BY id DESC LIMIT 900").all();
    return json({ n, s: results.map(r => [r.id, r.d, r.t, r.a]) }, 200, { "cache-control": "public, max-age=20" });
  }
  if (m !== "POST" && !(p === "/api/isik/admin" && m === "GET")) return json({ err: "method" }, 405);
  if (m === "POST" && !sameOrigin(req, u)) return json({ err: "origin" }, 403);

  if (p === "/api/isik/admin") {
    const key = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    if (!env.ADMIN_KEY) return json({ err: "ADMIN_KEY ayarlanmamış" }, 503);
    if (key.length !== env.ADMIN_KEY.length || !crypto.subtle.timingSafeEqual(new TextEncoder().encode(key), new TextEncoder().encode(env.ADMIN_KEY))) return json({ err: "auth" }, 401);
    if (m === "GET") {
      const { results } = await D.prepare("SELECT id,d,t,a,h,c FROM isik WHERE t<>'' ORDER BY id DESC LIMIT 1000").all();
      const n = await D.prepare("SELECT COUNT(*) AS n FROM isik").first("n");
      return json({ n, rows: results });
    }
    const b = await body(req);
    if (!b || !isId(b.id)) return json({ err: "bad" }, 400);
    await D.prepare("UPDATE isik SET h=? WHERE id=?").bind(b.h ? 1 : 0, b.id).run();
    return json({ ok: true });
  }

  const b = await body(req);
  if (!b) return json({ err: "bad" }, 400);

  if (p === "/api/isik") {
    const d = String(b.d || "");
    if (!/^\d{4}-\d\d-\d\d$/.test(d) || d < FIRST || d > LAST || d > todayIstanbul()) return json({ err: "Bu gün henüz açılmadı." }, 422);
    let t = "";
    if (b.p) { const c = check(b.t); if (c.err) return json({ err: c.err }, 422); t = c.t; }
    const since = Date.now() - 864e5;
    const cnt = await D.prepare("SELECT COUNT(*) AS n FROM isik WHERE c>?").bind(since).first("n");
    if (cnt >= DAILY_CAP) return json({ err: "Şu anda çok yoğun. Biraz sonra tekrar dene." }, 429);
    const k = crypto.randomUUID();
    const r = await D.prepare("INSERT INTO isik (d,t,k,c) VALUES (?,?,?,?)").bind(d, t, k, Date.now()).run();
    return json({ id: r.meta.last_row_id, k });
  }
  if (p === "/api/isik/amin") {
    if (!isId(b.id)) return json({ err: "bad" }, 400);
    await D.prepare("UPDATE isik SET a=MAX(0,a+?) WHERE id=? AND h=0").bind(b.on ? 1 : -1, b.id).run();
    return json({ ok: true });
  }
  if (p === "/api/isik/sil") {
    if (!isId(b.id) || typeof b.k !== "string") return json({ err: "bad" }, 400);
    await D.prepare("DELETE FROM isik WHERE id=? AND k=?").bind(b.id, b.k).run();
    return json({ ok: true });
  }
  return json({ err: "notfound" }, 404);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname.startsWith("/api/")) {
      try { return await api(req, env, u); } catch (e) { return json({ err: "server" }, 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
