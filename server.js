// Daler quiz serveri — MongoDB ulanishini to'g'rilash
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
const MONGODB_URI = process.env.MONGODB_URI;
const T_PTS = 5, W_PTS = 5, MAXT = 1200;

if (!MONGODB_URI) { console.error("XATO: MONGODB_URI o'rnatilmagan (Render > Environment)."); process.exit(1); }
if (ADMIN_KEY === 'admin123') console.warn("OGOHLANTIRISH: ADMIN_KEY standart holatda qolmoqda!");

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
const isAdmin = req => {
  const a = Buffer.from(String(req.headers['x-admin-key'] || '')), b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const readBody = (req, max) => new Promise((ok, no) => {
  let b = '';
  req.on('data', d => { b += d; if (b.length > max) { no(new Error('big')); req.destroy(); } });
  req.on('end', () => ok(b)); req.on('error', no);
});

function validateQuiz(j) {
  const err = m => { throw new Error(m); };
  if (!j || typeof j !== 'object') err("Noto'g'ri format");
  const topics = (j.topics || []).map(t => String(t).trim().slice(0, 100));
  if (!topics.length || topics.some(t => !t)) err('Kamida 1 ta mavzu kerak');
  if (!Array.isArray(j.q) || !j.q.length || j.q.length > 200) err('Savollar soni xato');
  const q = j.q.map((x, i) => {
    const t = String((x && x[0]) || '').trim().slice(0, 400);
    const o = Array.isArray(x && x[1]) ? x[1].map(s => String(s).trim().slice(0, 200)) : [];
    const c = x && x[2] | 0;
    if (!t || o.length < 2) err(`${i + 1}-savol xato`);
    return [t, o, c];
  });
  const qt = j.q.map((_, i) => (j.qt || [])[i] | 0);
  const w = (j.w || []).map((x, i) => [String(x[0] || '').trim().toUpperCase(), x[1] | 0, x[2] | 0, x[3] === 'v' ? 'v' : 'h', String(x[4] || '')]);
  return { q, w, topics, qt };
}

async function main() {
  // SSL xatosini oldini olish uchun serverApi qo'shildi
  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    tls: true,
    tlsAllowInvalidCertificates: true
  });

  await client.connect();
  const db = client.db('daler_quiz');
  const col = db.collection('results'), cfg = db.collection('config');
  await col.createIndex({ cid: 1 }, { unique: true }).catch(() => {});

  let quiz;
  const saved = await cfg.findOne({ _id: 'quiz' });
  if (saved) quiz = { q: saved.q, w: saved.w, topics: saved.topics, qt: saved.qt };
  else {
    quiz = validateQuiz(JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8')));
    await cfg.replaceOne({ _id: 'quiz' }, { _id: 'quiz', ...quiz }, { upsert: true });
  }
  console.log('MongoDB ulandi');

  const page = name => (req, res) => fs.readFile(path.join(__dirname, name), 'utf8', (e, html) => {
    if (e) { res.writeHead(500); return res.end('Topilmadi'); }
    if (name === 'index.html') {
      const data = JSON.stringify(quiz).replace(/</g, '\\u003c');
      html = html.replace('<script>', `<script>window.QUIZ=${data};</script>\n<script>`);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  const indexPage = page('index.html'), adminPage = page('admin.html');

  http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    try {
      if (url === '/health') { res.writeHead(200); return res.end('ok'); }
      if (url === '/admin' || url === '/admin.html') return adminPage(req, res);

      if (url === '/api/admin/quiz') {
        if (!isAdmin(req)) return send(res, 403, {});
        if (req.method === 'GET') return send(res, 200, quiz);
        if (req.method === 'PUT') {
          const v = validateQuiz(JSON.parse(await readBody(req, 300000)));
          await cfg.replaceOne({ _id: 'quiz' }, { _id: 'quiz', ...v }, { upsert: true });
          quiz = v;
          return send(res, 200, { ok: true });
        }
      }

      if (url === '/api/results' || url.startsWith('/api/results/')) {
        if (url === '/api/results' && req.method === 'GET') {
          const rows = await col.find({}, { projection: { _id: 0 } }).sort({ ts: 1 }).toArray();
          return send(res, 200, rows.map(({ cid, ...r }) => ({ id: cid, ...r })));
        }
        if (req.method === 'DELETE' && isAdmin(req)) {
          if (url === '/api/results') await col.deleteMany({});
          else await col.deleteOne({ cid: decodeURIComponent(url.slice('/api/results/'.length)) });
          return send(res, 200, {});
        }
        if (url === '/api/results' && req.method === 'POST') {
          const j = JSON.parse(await readBody(req, 5000));
          const NQ = quiz.q.length, NW = quiz.w.length, BASE = NQ * T_PTS + NW * W_PTS;
          const name = String(j.name || '').trim().slice(0, 40), cid = String(j.cid || '').slice(0, 60);
          const t = Math.min(NQ, j.test | 0), w = Math.min(NW, j.cw | 0), sec = Math.min(36000, j.sec | 0);
          const base = t * T_PTS + w * W_PTS;
          const total = Math.round((base + 10 * (base / BASE) * Math.max(0, 1 - sec / MAXT)) * 100) / 100;
          try { await col.insertOne({ cid, name, test: t, cw: w, base, sec, total, ts: Date.now() }); }
          catch (e) { if (e.code === 11000) return res.status ? null : send(res, 409, {}); }
          return send(res, 200, { total });
        }
      }
      return indexPage(req, res);
    } catch (e) { send(res, 500, {}); }
  }).listen(PORT, () => console.log('Server ishlayapti'));
}
main().catch(() => process.exit(1));