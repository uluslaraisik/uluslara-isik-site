// Sends this week's column (Haftalık Yazı) to Buttondown subscribers.
import fs from "node:fs";
import vm from "node:vm";
const KEY = process.env.BUTTONDOWN_API_KEY;
if (!KEY) { console.error("BUTTONDOWN_API_KEY missing"); process.exit(1); }
const html = fs.readFileSync("public/index.html", "utf8");
const i = html.indexOf("const COL=["), j = html.indexOf("\n];", i);
const COL = vm.runInNewContext(html.slice(i + 10, j + 2));
const M = {Ocak:1,Şubat:2,Mart:3,Nisan:4,Mayıs:5,Haziran:6,Temmuz:7,Ağustos:8,Eylül:9,Ekim:10,Kasım:11,Aralık:12};
const iso = c => { const [d, m, y] = c.d.split(" "); return `${y}-${String(M[m]).padStart(2,"0")}-${String(d).padStart(2,"0")}`; };
const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Istanbul"}).format(new Date());
const want = process.env.COLUMN_NO;
const c = want ? COL.find(x => String(x.n) === String(want)) : COL.find(x => iso(x) === today);
if (!c) { console.log("No column for", want || today); process.exit(0); }
const url = `https://uluslaraisik.org/yazi/${c.n}`;
const subject = `${c.t} · Haftalık Yazı ${c.n}`;
const H = {Authorization: `Token ${KEY}`, "Content-Type": "application/json"};
const prev = await (await fetch("https://api.buttondown.com/v1/emails?page_size=100", {headers: H})).json();
const ex = (prev.results || []).find(e => e.subject === subject);
if (ex && ex.status !== "draft") { console.log("Already sent:", subject, ex.status); process.exit(0); }
if (ex && process.env.DRAFT !== "1") {
  const r0 = await fetch(`https://api.buttondown.com/v1/emails/${ex.id}`, {method: "PATCH", headers: H, body: JSON.stringify({status: "about_to_send"})});
  console.log(r0.status, (await r0.text()).slice(0, 200)); process.exit(r0.ok ? 0 : 1);
}
if (ex) { console.log("Draft exists:", ex.id); process.exit(0); }
const body = [
  `![${c.t}](https://uluslaraisik.org/yazi/${c.n}.jpg)`, "",
  `**${c.ref}** · ${c.d}`, "", ...c.p.flatMap(x => [x, ""]),
  `[Sitede oku →](${url})`, "", "---", "",
  `## ${c.te}`, "", `**${c.ref}** · ${c.dEn}`, "", ...c.pe.flatMap(x => [x, ""]),
  `[Read on the website →](${url})`
].join("\n");
const r = await fetch("https://api.buttondown.com/v1/emails", {method: "POST", headers: H,
  body: JSON.stringify({subject, body, status: process.env.DRAFT === "1" ? "draft" : "about_to_send"})});
const t = await r.text();
console.log(r.status, t.slice(0, 300));
if (!r.ok) process.exit(1);
