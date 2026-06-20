const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireAdmin, auditLog } = require('../lib/middleware');
const router = Router();

// All admin routes require admin
router.use(requireAdmin);

// Admin overview page
router.get('/', async (req, res) => {
  try {
    const [users, posts, futures, markets, trades] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM user_profiles'),
      pool.query('SELECT COUNT(*) FROM posts'),
      pool.query('SELECT COUNT(*) FROM futures_positions'),
      pool.query('SELECT COUNT(*) FROM prediction_markets'),
      pool.query('SELECT COUNT(*) FROM futures_trades'),
    ]);
    const revenue = await pool.query('SELECT COALESCE(SUM(fee),0) as total FROM futures_trades WHERE is_paper_trade=FALSE');
    const banned = await pool.query('SELECT COUNT(*) FROM user_profiles WHERE is_banned=TRUE');
    const recentUsers = await pool.query('SELECT user_id,username,verification_tier,is_admin,is_banned,created_at FROM user_profiles ORDER BY created_at DESC LIMIT 10');
    const recentPosts = await pool.query('SELECT id,username,content,created_at FROM posts ORDER BY created_at DESC LIMIT 10');
    const openPositions = await pool.query('SELECT COUNT(*),SUM(margin) FROM futures_positions WHERE status=\'open\' AND is_paper_trade=FALSE');

    res.send(`<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Veya Admin</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white min-h-screen p-6">
<div class="admin-metrics max-w-6xl mx-auto">
  <h1 class="text-3xl font-bold mb-6 text-purple-400">Veya Admin Panel</h1>
  <nav class="flex gap-4 mb-8 text-sm">
    <a href="/admin" class="text-purple-300 hover:text-white">Overview</a>
    <a href="/admin/users" class="text-purple-300 hover:text-white">Users</a>
    <a href="/admin/posts" class="text-purple-300 hover:text-white">Posts</a>
    <a href="/admin/futures" class="text-purple-300 hover:text-white">Futures</a>
    <a href="/admin/markets" class="text-purple-300 hover:text-white">Markets</a>
    <a href="/admin/config" class="text-purple-300 hover:text-white">Config</a>
  </nav>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Total Users</div><div class="text-2xl font-bold">${users.rows[0].count}</div></div>
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Banned</div><div class="text-2xl font-bold text-red-400">${banned.rows[0].count}</div></div>
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Total Posts</div><div class="text-2xl font-bold">${posts.rows[0].count}</div></div>
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Futures Positions</div><div class="text-2xl font-bold">${futures.rows[0].count}</div></div>
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Prediction Markets</div><div class="text-2xl font-bold">${markets.rows[0].count}</div></div>
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Total Trades</div><div class="text-2xl font-bold">${trades.rows[0].count}</div></div>
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Protocol Revenue</div><div class="text-2xl font-bold text-green-400">$${parseFloat(revenue.rows[0].total).toFixed(2)}</div></div>
    <div class="bg-gray-900 rounded-xl p-4"><div class="text-gray-400 text-xs">Open Margin (Live)</div><div class="text-2xl font-bold text-yellow-400">$${parseFloat(openPositions.rows[0].sum||0).toFixed(2)}</div></div>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="bg-gray-900 rounded-xl p-4">
      <h2 class="font-bold mb-3 text-purple-300">Recent Users</h2>
      <table class="w-full text-sm"><thead><tr class="text-gray-500"><th class="text-left py-1">User</th><th class="text-left py-1">Tier</th><th class="text-left py-1">Status</th></tr></thead>
      <tbody>${recentUsers.rows.map(u => `<tr><td class="py-1">${escHtml(u.username)}</td><td>${u.verification_tier}</td><td>${u.is_banned ? '<span class="text-red-400">Banned</span>' : u.is_admin ? '<span class="text-yellow-400">Admin</span>' : '<span class="text-green-400">OK</span>'}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="bg-gray-900 rounded-xl p-4">
      <h2 class="font-bold mb-3 text-purple-300">Recent Posts</h2>
      <table class="w-full text-sm"><thead><tr class="text-gray-500"><th class="text-left py-1">User</th><th class="text-left py-1">Content</th></tr></thead>
      <tbody>${recentPosts.rows.map(p => `<tr><td class="py-1 pr-2 text-gray-400">${escHtml(p.username)}</td><td class="truncate max-w-xs">${escHtml(String(p.content||'').slice(0,60))}</td></tr>`).join('')}</tbody></table>
    </div>
  </div>
</div>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const { rows } = await pool.query(
      'SELECT * FROM user_profiles WHERE username ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [search, limit, offset]
    );
    const total = await pool.query('SELECT COUNT(*) FROM user_profiles WHERE username ILIKE $1', [search]);

    res.send(`<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Admin - Users</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white min-h-screen p-6">
<div class="admin-users max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-4 text-purple-400">Users (${total.rows[0].count})</h1>
  <nav class="flex gap-4 mb-6 text-sm"><a href="/admin" class="text-purple-300">Overview</a> <a href="/admin/users" class="text-white font-bold">Users</a> <a href="/admin/posts" class="text-purple-300">Posts</a></nav>
  <form class="mb-4"><input type="text" name="search" value="${escHtml(req.query.search||'')}" placeholder="Search username..." class="bg-gray-800 px-3 py-2 rounded text-white"><button class="ml-2 bg-purple-600 px-4 py-2 rounded">Search</button></form>
  <table class="w-full text-sm">
    <thead><tr class="text-gray-500 border-b border-gray-800"><th class="text-left py-2">ID</th><th class="text-left py-2">Username</th><th class="text-left py-2">Tier</th><th class="text-left py-2">Joined</th><th class="text-left py-2">Actions</th></tr></thead>
    <tbody>${rows.map(u => `<tr class="border-b border-gray-900 hover:bg-gray-900">
      <td class="py-2 text-gray-500">${u.user_id}</td>
      <td class="py-2">${escHtml(u.username)}</td>
      <td class="py-2">${u.verification_tier} ${u.is_admin ? '👑' : ''} ${u.is_banned ? '🚫' : ''}</td>
      <td class="py-2 text-gray-400">${new Date(u.created_at).toLocaleDateString()}</td>
      <td class="py-2 flex gap-2">
        ${u.is_banned
          ? `<button onclick="adminAction('/admin/users/${u.user_id}/unban','Unban ${escAttr(u.username)}?')" class="text-xs bg-green-700 px-2 py-1 rounded">Unban</button>`
          : `<button onclick="adminAction('/admin/users/${u.user_id}/ban','Ban ${escAttr(u.username)}?')" class="text-xs bg-red-700 px-2 py-1 rounded">Ban</button>`}
        ${u.is_admin
          ? `<button onclick="adminAction('/admin/users/${u.user_id}/remove-admin','Remove admin ${escAttr(u.username)}?')" class="text-xs bg-yellow-700 px-2 py-1 rounded">Remove Admin</button>`
          : `<button onclick="adminAction('/admin/users/${u.user_id}/make-admin','Make admin ${escAttr(u.username)}?')" class="text-xs bg-blue-700 px-2 py-1 rounded">Make Admin</button>`}
      </td></tr>`).join('')}
    </tbody>
  </table>
  <div class="mt-4 flex gap-2">${page > 1 ? `<a href="?page=${page-1}&search=${encodeURIComponent(req.query.search||'')}" class="bg-gray-800 px-3 py-1 rounded">Prev</a>` : ''}
  <span class="px-3 py-1">Page ${page}</span>
  ${rows.length === limit ? `<a href="?page=${page+1}&search=${encodeURIComponent(req.query.search||'')}" class="bg-gray-800 px-3 py-1 rounded">Next</a>` : ''}</div>
</div>
<script>
function adminAction(url, msg) {
  if (!confirm(msg)) return;
  fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}})
    .then(r=>r.json()).then(d=>{ if(d.ok) location.reload(); else alert(d.error||'Error'); });
}
</script>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

router.get('/posts', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;
    const { rows } = await pool.query('SELECT * FROM posts ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    const total = await pool.query('SELECT COUNT(*) FROM posts');

    res.send(`<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Admin - Posts</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white min-h-screen p-6">
<div class="admin-posts max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-4 text-purple-400">Posts (${total.rows[0].count})</h1>
  <nav class="flex gap-4 mb-6 text-sm"><a href="/admin" class="text-purple-300">Overview</a> <a href="/admin/users" class="text-purple-300">Users</a> <a href="/admin/posts" class="text-white font-bold">Posts</a></nav>
  <table class="w-full text-sm">
    <thead><tr class="text-gray-500 border-b border-gray-800"><th class="text-left py-2">ID</th><th class="text-left py-2">User</th><th class="text-left py-2">Content</th><th class="text-left py-2">Date</th><th class="text-left py-2">Actions</th></tr></thead>
    <tbody>${rows.map(p => `<tr class="border-b border-gray-900">
      <td class="py-2 text-gray-500">${p.id}</td>
      <td class="py-2 text-blue-400">${escHtml(p.username)}</td>
      <td class="py-2 max-w-sm truncate">${escHtml(String(p.content||'').slice(0,100))}</td>
      <td class="py-2 text-gray-400">${new Date(p.created_at).toLocaleDateString()}</td>
      <td class="py-2"><button onclick="deletePost(${p.id})" class="text-xs bg-red-700 px-2 py-1 rounded">Delete</button></td>
    </tr>`).join('')}
    </tbody>
  </table>
</div>
<script>
function deletePost(id) {
  if (!confirm('Delete post #'+id+'?')) return;
  fetch('/admin/posts/'+id, {method:'DELETE'}).then(r=>r.json()).then(d=>{ if(d.ok) location.reload(); else alert(d.error||'Error'); });
}
</script>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

router.get('/futures', async (req, res) => {
  try {
    const markets = await pool.query('SELECT * FROM futures_markets ORDER BY volume_24h DESC');
    const openPos = await pool.query('SELECT * FROM futures_positions WHERE status=\'open\' ORDER BY opened_at DESC LIMIT 50');
    res.send(`<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Admin - Futures</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white min-h-screen p-6">
<div class="admin-futures max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-4 text-purple-400">Futures Markets</h1>
  <nav class="flex gap-4 mb-6 text-sm"><a href="/admin" class="text-purple-300">Overview</a> <a href="/admin/futures" class="text-white font-bold">Futures</a></nav>
  <h2 class="text-lg font-bold mb-3">Markets</h2>
  <table class="w-full text-sm mb-8">
    <thead><tr class="text-gray-500 border-b border-gray-800"><th class="text-left py-2">Symbol</th><th class="text-left py-2">Mark Price</th><th class="text-left py-2">24h Vol</th><th class="text-left py-2">OI</th><th class="text-left py-2">Active</th></tr></thead>
    <tbody>${markets.rows.map(m=>`<tr class="border-b border-gray-900"><td class="py-2 font-mono">${escHtml(m.symbol)}</td><td>$${parseFloat(m.mark_price).toLocaleString()}</td><td>$${parseFloat(m.volume_24h||0).toLocaleString()}</td><td>$${parseFloat(m.open_interest||0).toLocaleString()}</td><td>${m.is_active?'✅':'❌'}</td></tr>`).join('')}
    </tbody>
  </table>
  <h2 class="text-lg font-bold mb-3">Open Positions (Top 50)</h2>
  <table class="w-full text-sm">
    <thead><tr class="text-gray-500 border-b border-gray-800"><th class="text-left py-2">User</th><th class="text-left py-2">Symbol</th><th class="text-left py-2">Side</th><th class="text-left py-2">Size</th><th class="text-left py-2">Leverage</th><th class="text-left py-2">Entry</th><th class="text-left py-2">Paper</th></tr></thead>
    <tbody>${openPos.rows.map(p=>`<tr class="border-b border-gray-900"><td class="py-2">${escHtml(p.username||p.user_id)}</td><td class="font-mono">${escHtml(p.market_symbol)}</td><td class="${p.side==='long'?'text-green-400':'text-red-400'}">${p.side}</td><td>${p.size}</td><td>${p.leverage}x</td><td>$${parseFloat(p.entry_price).toLocaleString()}</td><td>${p.is_paper_trade?'📄':''}</td></tr>`).join('')}
    </tbody>
  </table>
</div>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

router.get('/markets', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM prediction_markets ORDER BY created_at DESC LIMIT 100');
    res.send(`<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Admin - Prediction Markets</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white min-h-screen p-6">
<div class="admin-mkts max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-4 text-purple-400">Prediction Markets</h1>
  <nav class="flex gap-4 mb-6 text-sm"><a href="/admin" class="text-purple-300">Overview</a> <a href="/admin/markets" class="text-white font-bold">Markets</a></nav>
  <table class="w-full text-sm">
    <thead><tr class="text-gray-500 border-b border-gray-800"><th class="text-left py-2">ID</th><th class="text-left py-2">Question</th><th class="text-left py-2">Status</th><th class="text-left py-2">Liquidity</th><th class="text-left py-2">Closes</th></tr></thead>
    <tbody>${rows.map(m=>`<tr class="border-b border-gray-900">
      <td class="py-2 text-gray-500">${m.id}</td>
      <td class="py-2 max-w-xs truncate">${escHtml(String(m.question||'').slice(0,80))}</td>
      <td class="py-2 ${m.status==='open'?'text-green-400':m.status==='resolved'?'text-blue-400':'text-gray-400'}">${m.status}</td>
      <td class="py-2">$${parseFloat(m.liquidity||0).toFixed(2)}</td>
      <td class="py-2 text-gray-400">${new Date(m.closes_at).toLocaleDateString()}</td>
    </tr>`).join('')}
    </tbody>
  </table>
</div>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

router.get('/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM app_config ORDER BY key ASC');
    res.send(`<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Admin - Config</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white min-h-screen p-6">
<div class="admin-config max-w-3xl mx-auto">
  <h1 class="text-2xl font-bold mb-4 text-purple-400">App Config</h1>
  <nav class="flex gap-4 mb-6 text-sm"><a href="/admin" class="text-purple-300">Overview</a> <a href="/admin/config" class="text-white font-bold">Config</a></nav>
  <table class="w-full text-sm">
    <thead><tr class="text-gray-500 border-b border-gray-800"><th class="text-left py-2">Key</th><th class="text-left py-2">Value</th></tr></thead>
    <tbody>${rows.map(r=>`<tr class="border-b border-gray-900">
      <td class="py-2 font-mono text-purple-300">${escHtml(r.key)}</td>
      <td class="py-2">
        <form onsubmit="updateConfig(event,'${escAttr(r.key)}')">
          <input type="text" name="value" value="${escAttr(r.value||'')}" class="bg-gray-800 px-2 py-1 rounded w-64 text-sm">
          <button type="submit" class="ml-2 bg-purple-700 px-3 py-1 rounded text-xs">Save</button>
        </form>
      </td>
    </tr>`).join('')}
    </tbody>
  </table>
</div>
<script>
function updateConfig(e, key) {
  e.preventDefault();
  const value = e.target.value.value;
  fetch('/admin/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({key, value})})
    .then(r=>r.json()).then(d=>{ if(d.ok) alert('Saved!'); else alert(d.error||'Error'); });
}
</script>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>Error: ${err.message}</pre>`);
  }
});

// API action endpoints
router.post('/users/:userId/ban', async (req, res) => {
  try {
    await pool.query('UPDATE user_profiles SET is_banned=TRUE WHERE user_id=$1', [req.params.userId]);
    await auditLog(req, 'ban_user', 'user', req.params.userId, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:userId/unban', async (req, res) => {
  try {
    await pool.query('UPDATE user_profiles SET is_banned=FALSE WHERE user_id=$1', [req.params.userId]);
    await auditLog(req, 'unban_user', 'user', req.params.userId, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:userId/make-admin', async (req, res) => {
  try {
    await pool.query('UPDATE user_profiles SET is_admin=TRUE WHERE user_id=$1', [req.params.userId]);
    await auditLog(req, 'make_admin', 'user', req.params.userId, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:userId/remove-admin', async (req, res) => {
  try {
    await pool.query('UPDATE user_profiles SET is_admin=FALSE WHERE user_id=$1', [req.params.userId]);
    await auditLog(req, 'remove_admin', 'user', req.params.userId, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    await auditLog(req, 'delete_post', 'post', req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await pool.query('UPDATE app_config SET value=$1, updated_at=NOW() WHERE key=$2', [String(value), String(key)]);
    await auditLog(req, 'update_config', 'config', null, { key, value });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/audit-log', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ logs: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

module.exports = router;
