// Cloudflare Pages Function：每日挑战排行榜
// 需要在 Pages 项目里绑定一个 KV 命名空间，变量名 SCORES（见 README）
//   GET  /api/scores?board=today|all|dYYYYMMDD&pid=xxx   读取前 50 名
//   POST /api/scores  {name, score, wave, day:'YYYY-MM-DD', pid}  提交成绩（每人每榜只留最好的一次）

const MAX_SCORE = 400000;
const KEEP = 100;
const cnDay = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
const dayBoard = (day) => 'd' + day.replace(/-/g, '');

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function cleanName(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '')
    .trim()
    .slice(0, 10) || '无名小卒';
}

async function readBoard(env, board) {
  try { return (await env.SCORES.get('b:' + board, 'json')) || []; } catch (_) { return []; }
}

export async function onRequestGet({ request, env }) {
  if (!env.SCORES) return json({ error: 'no-kv' }, 503);
  const url = new URL(request.url);
  let board = url.searchParams.get('board') || 'today';
  if (board === 'today') board = dayBoard(cnDay(Date.now()));
  if (!/^(all|d\d{8})$/.test(board)) return json({ error: 'bad-board' }, 400);
  const pid = url.searchParams.get('pid') || '';
  const list = await readBoard(env, board);
  const mineIdx = pid ? list.findIndex((e) => e.pid === pid) : -1;
  return json({
    board,
    list: list.slice(0, 50).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, wave: e.wave, me: !!pid && e.pid === pid })),
    mine: mineIdx >= 0 ? { rank: mineIdx + 1, score: list[mineIdx].score } : null,
    total: list.length,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.SCORES) return json({ error: 'no-kv' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const name = cleanName(body.name);
  const score = Math.floor(Number(body.score));
  const wave = Math.floor(Number(body.wave));
  const pid = String(body.pid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  const day = String(body.day || '');
  if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE) return json({ error: 'bad-score' }, 400);
  if (!Number.isFinite(wave) || wave < 1 || wave > 150 || score > wave * 1000 + 60000) return json({ error: 'bad-wave' }, 400);
  if (pid.length < 6) return json({ error: 'bad-pid' }, 400);
  const now = Date.now();
  if (day !== cnDay(now) && day !== cnDay(now - 86400000)) return json({ error: 'bad-day' }, 400);

  const result = {};
  for (const board of [dayBoard(day), 'all']) {
    const list = await readBoard(env, board);
    const i = list.findIndex((e) => e.pid === pid);
    if (i >= 0) {
      if (list[i].score >= score) { list[i].name = name; result[board] = i + 1; continue; }
      list.splice(i, 1);
    }
    const entry = { name, score, wave, pid, t: now };
    let pos = list.findIndex((e) => e.score < score);
    if (pos < 0) pos = list.length;
    if (pos >= KEEP) { result[board] = null; continue; }
    list.splice(pos, 0, entry);
    list.length = Math.min(list.length, KEEP);
    await env.SCORES.put('b:' + board, JSON.stringify(list), board === 'all' ? {} : { expirationTtl: 86400 * 8 });
    result[board] = pos + 1;
  }
  return json({ ok: true, today: result[dayBoard(day)], all: result.all });
}
