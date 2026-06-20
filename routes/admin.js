'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireAdmin, auditLog } = require('../lib/middleware');
const router = Router();

router.use(requireAdmin);

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function layout(title, body, activeTab) {
  const tabs = [
    { href: '/admin', label: 'Overview', key: '' },
    { href: '/admin/users', label: 'Users', key: 'users' },
    { href: '/admin/content', label: 'Content', key: 'content' },
    { href: '/admin/markets', label: 'Markets', key: 'markets' },
    { href: '/admin/futures', label: 'Futures', key: 'futures' },
    { href: '/admin/ico', label: 'ICO', key: 'ico' },
    { href: '/admin/finance', label: 'Finance', key: 'finance' },
    { href: '/admin/verification', label: 'Verification', key: 'verification' },
    { href: '/admin/config', label: 'Config', key: 'config' },
    { href: '/admin/security', label: 'Security', key: 'security' },
    { href: '/admin/notifications', label: 'Notify', key: 'notifications' },
  ];
  const navItems = tabs.map(t =>
    `<a href="${t.href}" style="display:block;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;${activeTab===t.key?'background:#3b82f6;color:#fff;font-weight:600':'color:#374151'}">${esc(t.label)}</a>`
  ).join('');
  return `<!DOCTYPE html><html><head><title>Veya Admin — ${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;color:#111827;margin:0}
.layout{display:flex;min-height:100vh}.sidebar{width:200px;background:#fff;border-right:1px solid #e5e7eb;padding:16px;flex-shrink:0}
.logo{font-weight:900;font-size:18px;color:#3b82f6;margin-bottom:20px}.main{flex:1;padding:24px;overflow:auto}
h1{font-size:22px;font-weight:700;margin:0 0 20px}h2{font-size:16px;font-weight:600;margin:16px 0 8px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:16px}
.metric{display:inline-block;text-align:center;padding:16px 24px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin:8px}
.metric-val{font-size:28px;font-weight:700;color:#3b82f6}.metric-label{font-size:12px;color:#6b7280;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:8px;background:#f3f4f6;border-bottom:2px solid #e5e7eb}
td{padding:8px;border-bottom:1px solid #f3f4f6}tr:hover td{background:#f9fafb}
.btn{display:inline-flex;align-items:center;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;text-decoration:none}
.btn-red{background:#ef4444;color:#fff}.btn-green{background:#22c55e;color:#fff}.btn-blue{background:#3b82f6;color:#fff}.btn-gray{background:#6b7280;color:#fff}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.badge-0{background:#e5e7eb;color:#374151}.badge-1{background:#dbeafe;color:#1d4ed8}.badge-2{background:#ede9fe;color:#7c3aed}
.admin-metrics{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
input,select,textarea{padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:100%}
form{margin:0}.form-row{margin-bottom:12px}label{font-size:13px;font-weight:600;display:block;margin-bottom:4px}
.alert{padding:12px 16px;border-radius:8px;margin-bottom:12px;font-size:13px}
.alert-warn{background:#fef3c7;border:1px solid #fbbf24;color:#92400e}
.alert-red{background:#fee2e2;border:1px solid #f87171;color:#991b1b}</style></head>
<body><div class="layout">
<div class="sidebar"><div class="logo">👑 Veya Admin</div>${navItems}</div>
<div class="main"><h1>${esc(title)}</h1>${body}</div>
</div></body></html>`;
}

// GET /admin — overview
router.get('/', async (req, res) => {
  try {
    const [users, posts, markets, positions, liq] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM user_profiles'),
      pool.query('SELECT COUNT(*) FROM posts'),
      pool.query('SELECT COUNT(*) FROM markets WHERE status=$1', ['active']),
      pool.query('SELECT COUNT(*) FROM futures_positions WHERE status=$1', ['open']),
      pool.query('SELECT COUNT(*) FROM futures_liquidations WHERE created_at>NOW()-INTERVAL\'24 hours\''),
    ]);
    const metrics = `<div class="admin-metrics">
      <div class="metric"><div class="metric-val">${esc(users.rows[0].count)}</div><div class="metric-label">Total Users</div></div>
      <div class="metric"><div class="metric-val">${esc(posts.rows[0].count)}</div><div class="metric-label">Total Posts</div></div>
      <div class="metric"><div class="metric-val">${esc(markets.rows[0].count)}</div><div class="metric-label">Active Markets</div></div>
      <div class="metric"><div class="metric-val">${esc(positions.rows[0].count)}</div><div class="metric-label">Open Positions</div></div>
      <div class="metric"><div class="metric-val">${esc(liq.rows[0].count)}</div><div class="metric-label">Liquidations (24h)</div></div>
    </div>`;
    const recentPosts = await pool.query('SELECT * FROM posts ORDER BY created_at DESC LIMIT 5');
    const postsHtml = recentPosts.rows.map(p =>
      `<tr><td>${esc(p.username)}</td><td>${esc(p.content.slice(0,60))}</td><td>${new Date(p.created_at).toLocaleString()}</td>
       <td><form method="POST" action="/admin/posts/${esc(String(p.id))}/remove" style="display:inline"><button class="btn btn-red">Delete</button></form></td></tr>`
    ).join('');
    const body = `${metrics}<div class="card"><h2>Recent Posts</h2>
    <table><thead><tr><th>User</th><th>Content</th><th>Time</th><th>Action</th></tr></thead>
    <tbody>${postsHtml}</tbody></table></div>`;
    res.send(layout('Overview', body, ''));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/users
router.get('/users', async (req, res) => {
  try {
    const search = String(req.query.q || '').trim().slice(0, 64);
    const { rows } = await pool.query(
      search ? `SELECT * FROM user_profiles WHERE username ILIKE $1 ORDER BY created_at DESC LIMIT 50` : `SELECT * FROM user_profiles ORDER BY created_at DESC LIMIT 50`,
      search ? [`%${search}%`] : []
    );
    const rows_html = rows.map(u => `
      <tr>
        <td>${esc(u.username)}</td>
        <td><span class="badge badge-${u.verification_tier}">${['Basic','Social','Premium'][u.verification_tier]||u.verification_tier}</span></td>
        <td>${u.is_admin ? '👑' : ''} ${u.is_banned ? '🚫' : ''} ${u.is_verified ? '✅' : ''}</td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <form method="POST" action="/admin/users/${esc(String(u.user_id))}/ban" style="display:inline"><button class="btn ${u.is_banned?'btn-green':'btn-red'}">${u.is_banned?'Unban':'Ban'}</button></form>
          <form method="POST" action="/admin/users/${esc(String(u.user_id))}/make-admin" style="display:inline;margin-left:4px"><button class="btn btn-blue">${u.is_admin?'Remove Admin':'Make Admin'}</button></form>
        </td>
      </tr>`).join('');
    const body = `<div class="card">
      <form method="GET" style="margin-bottom:16px;display:flex;gap:8px"><input name="q" value="${esc(search)}" placeholder="Search username..." style="max-width:300px"><button type="submit" class="btn btn-blue">Search</button></form>
      <table><thead><tr><th>Username</th><th>Tier</th><th>Flags</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>${rows_html}</tbody></table></div>`;
    res.send(layout('Users', body, 'users'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/content
router.get('/content', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM posts ORDER BY created_at DESC LIMIT 30');
    const rows_html = rows.map(p => `
      <tr><td>${esc(p.username)}</td><td>${esc(p.content.slice(0,80))}</td>
      <td>${new Date(p.created_at).toLocaleString()}</td>
      <td><form method="POST" action="/admin/posts/${esc(String(p.id))}/remove"><button class="btn btn-red">Remove</button></form></td>
      </tr>`).join('');
    const body = `<div class="card"><table><thead><tr><th>User</th><th>Content</th><th>Time</th><th>Action</th></tr></thead><tbody>${rows_html}</tbody></table></div>`;
    res.send(layout('Content Moderation', body, 'content'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/markets
router.get('/markets', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM markets ORDER BY created_at DESC LIMIT 30');
    const rows_html = rows.map(m => `
      <tr><td>${esc(m.question.slice(0,60))}</td>
      <td>${esc(m.status)}</td>
      <td>${Math.round(parseFloat(m.yes_probability)*100)}% YES</td>
      <td>${esc(String(m.volume||0))}</td>
      <td>
        <form method="POST" action="/admin/markets/${esc(String(m.id))}/approve" style="display:inline"><button class="btn btn-green">Approve</button></form>
        <form method="POST" action="/admin/markets/${esc(String(m.id))}/reject" style="display:inline;margin-left:4px"><button class="btn btn-red">Reject</button></form>
        <form method="POST" action="/admin/markets/${esc(String(m.id))}/resolve" style="display:inline;margin-left:4px">
          <select name="outcome" style="width:80px;display:inline"><option value="YES">YES</option><option value="NO">NO</option></select>
          <button class="btn btn-blue" style="margin-left:4px">Resolve</button>
        </form>
      </td></tr>`).join('');
    const body = `<div class="card"><table><thead><tr><th>Question</th><th>Status</th><th>Probability</th><th>Volume</th><th>Actions</th></tr></thead><tbody>${rows_html}</tbody></table></div>`;
    res.send(layout('Prediction Markets', body, 'markets'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/futures
router.get('/futures', async (req, res) => {
  try {
    const positions = await pool.query('SELECT fp.*, up.username FROM futures_positions fp LEFT JOIN user_profiles up ON up.user_id=fp.user_id WHERE fp.status=\'open\' ORDER BY fp.opened_at DESC LIMIT 50');
    const fmkts = await pool.query('SELECT * FROM futures_markets ORDER BY symbol');
    const posHtml = positions.rows.map(p => `
      <tr><td>${esc(p.username)}</td><td>${esc(p.symbol)}</td>
      <td style="color:${p.direction==='long'?'#22c55e':'#ef4444'}">${esc(p.direction)} ${esc(p.leverage)}x</td>
      <td>${esc(String(p.size))}</td>
      <td>${esc(String(parseFloat(p.unrealized_pnl).toFixed(2)))}</td>
      <td>${esc(p.mode)}</td></tr>`).join('');
    const mktHtml = fmkts.rows.map(m => `
      <tr><td>${esc(m.symbol)}</td><td>$${esc(String(parseFloat(m.mark_price).toFixed(2)))}</td>
      <td>${esc(String(m.funding_rate))}</td>
      <td>${m.paused?'<span style="color:red">PAUSED</span>':'Active'}</td>
      <td>
        <form method="POST" action="/admin/futures/${esc(m.symbol)}/${m.paused?'unpause':'pause'}" style="display:inline">
          <button class="btn ${m.paused?'btn-green':'btn-red'}">${m.paused?'Unpause':'Pause'}</button>
        </form>
      </td></tr>`).join('');
    const body = `
      <div class="card">
        <h2>Open Positions (${positions.rows.length})</h2>
        <form method="POST" action="/admin/futures/pause-all" style="margin-bottom:16px">
          <button class="btn btn-red" style="font-size:14px;padding:8px 20px">🚨 Emergency Pause All Futures</button>
        </form>
        <table><thead><tr><th>User</th><th>Symbol</th><th>Direction/Lev</th><th>Size</th><th>uPnL</th><th>Mode</th></tr></thead>
        <tbody>${posHtml}</tbody></table>
      </div>
      <div class="card">
        <h2>Markets</h2>
        <table><thead><tr><th>Symbol</th><th>Mark Price</th><th>Funding Rate</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${mktHtml}</tbody></table>
      </div>`;
    res.send(layout('Futures Admin', body, 'futures'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/ico
router.get('/ico', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM icos ORDER BY starts_at DESC');
    const rows_html = rows.map(i => `
      <tr><td>${esc(i.name)} (${esc(i.symbol)})</td>
      <td>$${esc(String(i.token_price))}</td>
      <td>${esc(String(i.raised))}/${esc(String(i.total_raise))}</td>
      <td>${esc(i.status)}</td>
      <td><form method="POST" action="/admin/ico/${esc(String(i.id))}/cancel"><button class="btn btn-red">Cancel</button></form></td></tr>`).join('');
    const body = `<div class="card"><h2>Create ICO</h2>
    <form method="POST" action="/admin/ico/create" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-row"><label>Name</label><input name="name" required></div>
      <div class="form-row"><label>Symbol</label><input name="symbol" required></div>
      <div class="form-row"><label>Token Price ($)</label><input name="token_price" type="number" step="0.000001" required></div>
      <div class="form-row"><label>Total Raise ($)</label><input name="total_raise" type="number" required></div>
      <div class="form-row"><label>Starts At</label><input name="starts_at" type="datetime-local" required></div>
      <div class="form-row"><label>Ends At</label><input name="ends_at" type="datetime-local" required></div>
      <div style="grid-column:1/-1"><button type="submit" class="btn btn-blue">Create ICO</button></div>
    </form></div>
    <div class="card"><table><thead><tr><th>ICO</th><th>Price</th><th>Raised</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows_html}</tbody></table></div>`;
    res.send(layout('ICO Management', body, 'ico'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/finance
router.get('/finance', async (req, res) => {
  try {
    const [swaps, stakes, lps] = await Promise.all([
      pool.query('SELECT COUNT(*),SUM(quantity*price) AS vol FROM stock_trades'),
      pool.query('SELECT COUNT(*),SUM(amount) AS tvl FROM staking_positions'),
      pool.query('SELECT COUNT(*),SUM(amount_a+amount_b) AS tvl FROM lp_positions'),
    ]);
    const body = `<div class="admin-metrics">
      <div class="metric"><div class="metric-val">${esc(String(swaps.rows[0].count))}</div><div class="metric-label">Stock Trades</div></div>
      <div class="metric"><div class="metric-val">${esc(String(parseInt(swaps.rows[0].vol||0)))}</div><div class="metric-label">Stock Volume</div></div>
      <div class="metric"><div class="metric-val">${esc(String(stakes.rows[0].count))}</div><div class="metric-label">Staking Positions</div></div>
      <div class="metric"><div class="metric-val">${esc(String(parseInt(stakes.rows[0].tvl||0)))}</div><div class="metric-label">Staking TVL</div></div>
      <div class="metric"><div class="metric-val">${esc(String(lps.rows[0].count))}</div><div class="metric-label">LP Positions</div></div>
    </div>`;
    res.send(layout('Finance', body, 'finance'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/verification
router.get('/verification', async (req, res) => {
  try {
    const tiers = await pool.query('SELECT verification_tier, COUNT(*) FROM user_profiles GROUP BY verification_tier ORDER BY verification_tier');
    const tierHtml = tiers.rows.map(r => `<div class="metric"><div class="metric-val">${esc(String(r.count))}</div><div class="metric-label">${['Basic','Social','Premium'][r.verification_tier]||'Unknown'}</div></div>`).join('');
    const body = `<div class="admin-metrics">${tierHtml}</div>
    <div class="card"><h2>Manual Tier Grant</h2>
    <form method="POST" action="/admin/verify/grant" style="display:flex;gap:12px;align-items:flex-end">
      <div class="form-row"><label>Username</label><input name="username" required></div>
      <div class="form-row"><label>Tier</label><select name="tier"><option value="1">Social (1)</option><option value="2">Premium (2)</option></select></div>
      <button type="submit" class="btn btn-blue">Grant Tier</button>
    </form></div>`;
    res.send(layout('Verification', body, 'verification'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/config
router.get('/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM app_config ORDER BY key');
    const fields = rows.map(r => `<div class="form-row"><label>${esc(r.key)}</label><input name="${esc(r.key)}" value="${esc(r.value)}"></div>`).join('');
    const body = `<div class="card"><form method="POST" action="/admin/config">${fields}<button type="submit" class="btn btn-blue" style="margin-top:12px">Save Config</button></form></div>`;
    res.send(layout('App Config', body, 'config'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/security
router.get('/security', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50');
    const rows_html = rows.map(r => `<tr><td>${esc(r.username||r.user_id)}</td><td>${esc(r.action)}</td><td>${esc(r.entity_type||'')}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join('');
    const body = `<div class="card"><h2>Audit Log</h2>
    <table><thead><tr><th>User</th><th>Action</th><th>Entity</th><th>Time</th></tr></thead><tbody>${rows_html}</tbody></table></div>`;
    res.send(layout('Security', body, 'security'));
  } catch (err) { res.status(500).send(err.message); }
});

// GET /admin/notifications
router.get('/notifications', async (req, res) => {
  try {
    const body = `<div class="card"><h2>Broadcast Notification</h2>
    <form method="POST" action="/admin/notifications/broadcast">
      <div class="form-row"><label>Target (leave blank for all users)</label><input name="username" placeholder="username (optional)"></div>
      <div class="form-row"><label>Title</label><input name="title" required></div>
      <div class="form-row"><label>Message</label><textarea name="message" rows="3" required></textarea></div>
      <button type="submit" class="btn btn-blue">Send</button>
    </form></div>`;
    res.send(layout('Notifications', body, 'notifications'));
  } catch (err) { res.status(500).send(err.message); }
});

// POST actions
router.post('/users/:id/ban', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT is_banned FROM user_profiles WHERE user_id=$1', [req.params.id]);
    if (!rows[0]) return res.redirect('/admin/users');
    await pool.query('UPDATE user_profiles SET is_banned=$1 WHERE user_id=$2', [!rows[0].is_banned, req.params.id]);
    await auditLog(req, rows[0].is_banned ? 'unban_user' : 'ban_user', 'user', req.params.id);
    res.redirect('/admin/users');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/users/:id/make-admin', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT is_admin FROM user_profiles WHERE user_id=$1', [req.params.id]);
    if (!rows[0]) return res.redirect('/admin/users');
    await pool.query('UPDATE user_profiles SET is_admin=$1 WHERE user_id=$2', [!rows[0].is_admin, req.params.id]);
    await auditLog(req, rows[0].is_admin ? 'remove_admin' : 'make_admin', 'user', req.params.id);
    res.redirect('/admin/users');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/posts/:id/remove', async (req, res) => {
  try {
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    await auditLog(req, 'delete_post', 'post', req.params.id);
    res.redirect(req.headers.referer || '/admin/content');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/markets/:id/approve', async (req, res) => {
  try {
    await pool.query(`UPDATE markets SET status='active', approved_by_admin=$1 WHERE id=$2`, [req.user.id, req.params.id]);
    await auditLog(req, 'approve_market', 'market', req.params.id);
    res.redirect('/admin/markets');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/markets/:id/reject', async (req, res) => {
  try {
    await pool.query(`UPDATE markets SET status='cancelled' WHERE id=$1`, [req.params.id]);
    await auditLog(req, 'reject_market', 'market', req.params.id);
    res.redirect('/admin/markets');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/markets/:id/resolve', async (req, res) => {
  try {
    const outcome = ['YES','NO','cancelled'].includes(req.body.outcome) ? req.body.outcome : 'cancelled';
    await pool.query(`UPDATE markets SET status='resolved', resolved_outcome=$1, resolved_at=NOW() WHERE id=$2`, [outcome, req.params.id]);
    await auditLog(req, 'resolve_market', 'market', req.params.id, { outcome });
    res.redirect('/admin/markets');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/futures/pause-all', async (req, res) => {
  try {
    await pool.query(`UPDATE futures_markets SET paused=TRUE`);
    await auditLog(req, 'pause_all_futures', 'system', null);
    res.redirect('/admin/futures');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/futures/:symbol/pause', async (req, res) => {
  try {
    await pool.query(`UPDATE futures_markets SET paused=TRUE WHERE symbol=$1`, [req.params.symbol]);
    await auditLog(req, 'pause_futures_market', 'futures_market', req.params.symbol);
    res.redirect('/admin/futures');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/futures/:symbol/unpause', async (req, res) => {
  try {
    await pool.query(`UPDATE futures_markets SET paused=FALSE WHERE symbol=$1`, [req.params.symbol]);
    await auditLog(req, 'unpause_futures_market', 'futures_market', req.params.symbol);
    res.redirect('/admin/futures');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/ico/create', async (req, res) => {
  try {
    const { name, symbol, token_price, total_raise, starts_at, ends_at } = req.body;
    await pool.query(
      `INSERT INTO icos (name,symbol,token_price,total_raise,starts_at,ends_at,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,'upcoming',$7)`,
      [name, symbol, token_price, total_raise, starts_at, ends_at, req.user.id]
    );
    await auditLog(req, 'create_ico', 'ico', null, { name, symbol });
    res.redirect('/admin/ico');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/ico/:id/cancel', async (req, res) => {
  try {
    await pool.query(`UPDATE icos SET status='cancelled' WHERE id=$1`, [req.params.id]);
    await auditLog(req, 'cancel_ico', 'ico', req.params.id);
    res.redirect('/admin/ico');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/config', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      const k = String(key).slice(0, 255);
      const v = String(value).slice(0, 1000);
      await pool.query(`INSERT INTO app_config (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`, [k, v]);
    }
    await auditLog(req, 'update_config', 'system', null);
    res.redirect('/admin/config');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/verify/grant', async (req, res) => {
  try {
    const { username, tier } = req.body;
    const t = parseInt(tier);
    if (![1,2].includes(t)) return res.redirect('/admin/verification');
    await pool.query(`UPDATE user_profiles SET verification_tier=GREATEST(verification_tier,$1) WHERE username=$2`, [t, username]);
    await auditLog(req, 'manual_tier_grant', 'user', username, { tier: t });
    res.redirect('/admin/verification');
  } catch (err) { res.status(500).send(err.message); }
});

router.post('/notifications/broadcast', async (req, res) => {
  try {
    const { title, message, username } = req.body;
    if (username) {
      const u = await pool.query('SELECT user_id FROM user_profiles WHERE username=$1', [username]);
      if (u.rows[0]) await pool.query('INSERT INTO notifications (user_id,type,title,body) VALUES ($1,\'broadcast\',$2,$3)', [u.rows[0].user_id, title, message]);
    } else {
      await pool.query('INSERT INTO broadcast_notifications (title, message, sent_at, created_by) VALUES ($1,$2,NOW(),$3)', [title, message, req.user.id]);
    }
    await auditLog(req, 'broadcast_notification', 'system', null, { title });
    res.redirect('/admin/notifications');
  } catch (err) { res.status(500).send(err.message); }
});

module.exports = router;
