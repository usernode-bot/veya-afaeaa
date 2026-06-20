'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const TOKEN = window.__TOKEN__ || '';
const APP = document.getElementById('app');

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['x-usernode-token'] = TOKEN;
  const opts = { method, headers };
  if (body != null) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function navigate(path) {
  history.pushState(null, '', path);
  render();
}

function fmt(n, d = 2) {
  const v = parseFloat(n);
  if (isNaN(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(d);
}

function pct(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return '<span>—</span>';
  const cls = v >= 0 ? 'price-up' : 'price-down';
  return `<span class="${cls}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
}

function tierBadge(tier, isAdmin) {
  if (isAdmin) return `<span class="tier-badge tier-admin">Admin</span>`;
  const map = { 0: ['tier-0','Basic'], 1: ['tier-1','Social'], 2: ['tier-2','Premium'] };
  const [cls, label] = map[tier] || map[0];
  return `<span class="tier-badge ${cls}">${label}</span>`;
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function skel(h, w = '100%', mb = '8px') {
  return `<div class="skeleton" style="height:${h}px;width:${w};margin-bottom:${mb}"></div>`;
}

// ── Bottom nav ─────────────────────────────────────────────────────────────────
const NAV = [
  { id:'home',    label:'Home',    path:'/home' },
  { id:'trade',   label:'Trade',   path:'/trade' },
  { id:'futures', label:'Futures', path:'/futures' },
  { id:'earn',    label:'Earn',    path:'/earn' },
  { id:'markets', label:'Predict', path:'/markets' },
  { id:'explore', label:'Explore', path:'/explore' },
];

const NAV_ICONS = {
  home:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/></svg>',
  trade:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4"/></svg>',
  futures: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8-8 8-4-4-6 6"/></svg>',
  earn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8v-1m0 10v1"/></svg>',
  markets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>',
  explore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M14.828 9.172l-5.657 5.657m5.657-5.657L9.171 9.17"/></svg>',
};

function bottomNav(active) {
  return `<nav class="bottom-nav">${NAV.map(n => `
    <button class="nav-btn${n.id===active?' active':''}" onclick="navigate('${n.path}')">${NAV_ICONS[n.id]}<span>${n.label}</span></button>
  `).join('')}</nav>`;
}

// ── Home ───────────────────────────────────────────────────────────────────────
async function renderHome() {
  APP.innerHTML = `
    <div class="page-content">
      <div class="wallet-card">
        ${skel(11,'45%','6px')}
        ${skel(36,'50%','6px')}
        ${skel(11,'35%','16px')}
        <div style="display:flex;gap:8px">${skel(30,'23%','0')}${skel(30,'23%','0')}${skel(30,'23%','0')}${skel(30,'23%','0')}</div>
      </div>
      <div class="section-title">Markets</div>
      <div style="padding:0 12px">${skel(48,'100%','8px')}${skel(48,'100%','8px')}${skel(48,'100%','8px')}</div>
    </div>
    ${bottomNav('home')}`;

  let user = { username: 'User', verification_tier: 0, veya_balance: '0', is_admin: false };
  let tokens = [];
  try { const d = await api('GET', '/user/me'); user = d.user || user; } catch {}
  try { const d = await api('GET', '/tokens'); tokens = (d.tokens || []).slice(0, 6); } catch {}

  APP.innerHTML = `
    <div class="page-content">
      <div class="wallet-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div class="address">${esc(user.wallet_address || '@' + user.username)}</div>
            <div class="balance">$${fmt(user.veya_balance || 0)}</div>
            <div class="balance-usd">VEYA Balance</div>
          </div>
          ${tierBadge(user.verification_tier || 0, user.is_admin)}
        </div>
        <div class="quick-actions">
          <button class="quick-btn" onclick="navigate('/trade')">${NAV_ICONS.trade}Trade</button>
          <button class="quick-btn" onclick="navigate('/earn')">${NAV_ICONS.earn}Earn</button>
          <button class="quick-btn" onclick="navigate('/futures')">${NAV_ICONS.futures}Futures</button>
          <button class="quick-btn" onclick="navigate('/verify')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>Verify</button>
        </div>
      </div>
      <div class="section-title">Markets</div>
      <div>
        ${tokens.map(t => `
          <div class="stat-row" style="padding:10px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigate('/trade')">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${esc(t.symbol.slice(0,2))}</div>
              <div><div style="font-weight:600;font-size:13px">${esc(t.symbol)}</div><div class="stat-label">${esc(t.name||'')}</div></div>
            </div>
            <div style="text-align:right"><div style="font-weight:600;font-size:13px">$${fmt(t.price_usd)}</div><div style="font-size:11px">${pct(t.change_24h)}</div></div>
          </div>`).join('') || '<div class="empty-state">No tokens</div>'}
      </div>
      <div style="padding:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="navigate('/markets')">Predict Markets</button>
        <button class="btn btn-secondary btn-sm" onclick="navigate('/explore')">Explore</button>
        <button class="btn btn-secondary btn-sm" onclick="navigate('/nfts')">NFTs</button>
        ${user.is_admin ? `<button class="btn btn-secondary btn-sm" onclick="window.location='/admin'">Admin</button>` : ''}
      </div>
    </div>
    ${bottomNav('home')}`;
}

// ── Trade ──────────────────────────────────────────────────────────────────────
async function renderTrade() {
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Trade</h2></div>
      <div style="padding:16px">
        <div class="swap-panel">
          <div style="margin-bottom:12px">
            <div class="input-label">From</div>
            <div class="swap-token">${skel(16,'60%','0')}</div>
          </div>
          <div class="swap-arrow">↓</div>
          <div style="margin-bottom:16px">
            <div class="input-label">To</div>
            <div class="swap-token">${skel(16,'60%','0')}</div>
          </div>
          <button class="btn btn-primary btn-full" disabled>Loading...</button>
        </div>
      </div>
    </div>
    ${bottomNav('trade')}`;

  let tokens = [];
  try { const d = await api('GET', '/tokens'); tokens = d.tokens || []; } catch {}

  const mkSel = (id, selIdx) => `<select id="${id}" style="background:transparent;border:none;color:var(--text);font-size:14px;font-weight:600;outline:none;flex:1">
    ${tokens.map((t, i) => `<option value="${esc(t.symbol)}" ${i===selIdx?'selected':''}>${esc(t.symbol)} — $${fmt(t.price_usd)}</option>`).join('')}
  </select>`;

  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Trade</h2></div>
      <div style="padding:16px">
        <div class="swap-panel">
          <div style="margin-bottom:12px">
            <div class="input-label">From</div>
            <div class="swap-token">${mkSel('sw-from',0)}<input type="number" id="sw-amt" placeholder="0.00" min="0" style="width:100px;text-align:right;background:transparent;border:none;color:var(--text);font-size:16px;font-weight:700;outline:none"></div>
          </div>
          <div class="swap-arrow"><button onclick="swapOrder()" class="btn btn-secondary btn-sm" style="border-radius:50%;width:32px;height:32px;padding:0">⇅</button></div>
          <div style="margin-bottom:16px">
            <div class="input-label">To</div>
            <div class="swap-token">${mkSel('sw-to',1)}<input type="text" id="sw-recv" placeholder="0.00" readonly style="width:100px;text-align:right;background:transparent;border:none;color:var(--text);font-size:16px;font-weight:700;outline:none"></div>
          </div>
          <div id="sw-rate" class="stat-label" style="text-align:center;margin-bottom:12px;font-size:12px"></div>
          <button onclick="doSwap()" class="btn btn-primary btn-full btn-lg">Swap</button>
        </div>
        <div class="section-title" style="margin-top:16px">All Tokens</div>
        <div>
          ${tokens.map(t => `
            <div class="stat-row" style="padding:10px 16px;border-bottom:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${esc(t.symbol.slice(0,2))}</div>
                <div><div style="font-weight:600">${esc(t.symbol)}</div><div class="stat-label">${esc(t.name||'')}</div></div>
              </div>
              <div style="text-align:right"><div style="font-weight:600">$${fmt(t.price_usd)}</div><div style="font-size:11px">${pct(t.change_24h)}</div></div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    ${bottomNav('trade')}`;

  const updateRate = () => {
    const from = tokens.find(t => t.symbol === document.getElementById('sw-from')?.value);
    const to = tokens.find(t => t.symbol === document.getElementById('sw-to')?.value);
    const rateEl = document.getElementById('sw-rate');
    if (from && to && rateEl) {
      const r = parseFloat(to.price_usd) > 0 ? parseFloat(from.price_usd) / parseFloat(to.price_usd) : 0;
      rateEl.textContent = `1 ${from.symbol} ≈ ${r.toFixed(6)} ${to.symbol}`;
    }
    const amt = parseFloat(document.getElementById('sw-amt')?.value);
    const recv = document.getElementById('sw-recv');
    if (recv && !isNaN(amt) && from && to && parseFloat(to.price_usd) > 0) {
      recv.value = (amt * parseFloat(from.price_usd) / parseFloat(to.price_usd)).toFixed(6);
    }
  };

  document.getElementById('sw-from')?.addEventListener('change', updateRate);
  document.getElementById('sw-to')?.addEventListener('change', updateRate);
  document.getElementById('sw-amt')?.addEventListener('input', updateRate);
  updateRate();

  window.swapOrder = () => {
    const f = document.getElementById('sw-from'), t = document.getElementById('sw-to');
    if (f && t) { const tmp = f.value; f.value = t.value; t.value = tmp; updateRate(); }
  };

  window.doSwap = async () => {
    const from_token = document.getElementById('sw-from')?.value;
    const to_token = document.getElementById('sw-to')?.value;
    const amount = parseFloat(document.getElementById('sw-amt')?.value);
    if (!from_token || !to_token || !amount || amount <= 0) return toast('Enter an amount', 'error');
    if (from_token === to_token) return toast('Select different tokens', 'error');
    try {
      const d = await api('POST', '/swap', { from_token, to_token, amount });
      toast(`Swapped! Received ${fmt(d.received)} ${to_token}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ── Futures markets ────────────────────────────────────────────────────────────
async function renderFutures() {
  const skelRows = Array.from({length:6}, () => `
    <div class="futures-market-row">
      <div>${skel(16,'90px','4px')}${skel(12,'60px','0')}</div>
      <div style="text-align:right">${skel(16,'80px','4px')}${skel(12,'55px','0')}</div>
    </div>`).join('');
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Futures</h2></div>
      ${skelRows}
    </div>
    ${bottomNav('futures')}`;

  let markets = [];
  try { const d = await api('GET', '/futures/markets'); markets = d.markets || []; } catch {}

  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header">
        <h2>Futures</h2>
        <button class="btn btn-sm btn-secondary" onclick="navigate('/futures-portfolio')">Portfolio</button>
      </div>
      <div class="disclaimer">Perpetual futures — up to 50× leverage. Simulated trading available for all users.</div>
      ${markets.length ? markets.map(m => `
        <div class="futures-market-row" onclick="navigate('/futures/${esc(m.symbol)}')">
          <div>
            <div class="symbol">${esc(m.symbol)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${(parseFloat(m.funding_rate||0)*100).toFixed(4)}% funding</div>
          </div>
          <div style="text-align:right">
            <div class="price">$${fmt(m.mark_price)}</div>
            <div style="font-size:12px">${pct(m.change_24h)} <span class="chip">OI $${fmt(m.open_interest)}</span></div>
          </div>
        </div>`).join('') : '<div class="empty-state">No markets available</div>'}
    </div>
    ${bottomNav('futures')}`;
}

// ── Futures chart ──────────────────────────────────────────────────────────────
async function renderFuturesChart(symbol) {
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header">
        <button class="btn btn-sm btn-secondary" onclick="navigate('/futures')">← Back</button>
        <h2>${esc(symbol)}</h2>
        <button class="btn btn-sm btn-secondary" onclick="navigate('/futures-portfolio')">Portfolio</button>
      </div>
      <canvas id="ohlc" class="futures-chart" height="240"></canvas>
      <div style="padding:16px">
        <div class="tab-pills" style="margin-bottom:16px">
          <button class="tab-pill active" id="dir-long" onclick="setDir('long')">Long</button>
          <button class="tab-pill" id="dir-short" onclick="setDir('short')">Short</button>
        </div>
        <div style="margin-bottom:12px">
          <div class="input-label">Leverage: <span id="lev-val">10×</span></div>
          <input type="range" id="lev" min="1" max="50" value="10" style="width:100%" oninput="document.getElementById('lev-val').textContent=this.value+'×'">
        </div>
        <div style="margin-bottom:12px">
          <div class="input-label">Margin (VEYA)</div>
          <input type="number" id="order-amt" placeholder="100" min="1" style="width:100%">
        </div>
        <div style="margin-bottom:12px">
          <div class="input-label">Mode</div>
          <select id="order-mode" style="width:100%">
            <option value="simulated">Simulated (risk-free)</option>
            <option value="live">Live (real VEYA)</option>
          </select>
        </div>
        <button id="place-btn" class="btn btn-green btn-full">Place Long Order</button>
        <div id="pos-section" style="margin-top:16px"></div>
      </div>
    </div>
    ${bottomNav('futures')}`;

  let direction = 'long';
  window.setDir = (dir) => {
    direction = dir;
    document.getElementById('dir-long')?.classList.toggle('active', dir==='long');
    document.getElementById('dir-short')?.classList.toggle('active', dir==='short');
    const b = document.getElementById('place-btn');
    if (b) { b.textContent = `Place ${dir.charAt(0).toUpperCase()+dir.slice(1)} Order`; b.className = `btn btn-full ${dir==='long'?'btn-green':'btn-red'}`; }
  };

  document.getElementById('place-btn')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('order-amt')?.value);
    const leverage = parseInt(document.getElementById('lev')?.value);
    const mode = document.getElementById('order-mode')?.value;
    if (!amount || amount <= 0) return toast('Enter an amount', 'error');
    try {
      await api('POST', '/futures/orders', { symbol, direction, amount, leverage, mode, order_type: 'market' });
      toast('Order placed!', 'success');
      loadPositions();
    } catch (e) { toast(e.message, 'error'); }
  });

  window.closePosition = async (id) => {
    try { await api('POST', `/futures/positions/${id}/close`, {}); toast('Position closed', 'success'); loadPositions(); }
    catch (e) { toast(e.message, 'error'); }
  };

  async function loadPositions() {
    const sec = document.getElementById('pos-section');
    if (!sec) return;
    try {
      const d = await api('GET', '/futures/positions');
      const mine = (d.positions||[]).filter(p => p.symbol===symbol && p.status==='open');
      if (!mine.length) { sec.innerHTML = ''; return; }
      sec.innerHTML = `<div class="section-title">Open Positions</div>` + mine.map(p => `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span class="${p.direction==='long'?'price-up':'price-down'}">${p.direction.toUpperCase()}</span>
            <span class="leverage-badge">${p.leverage}×</span>
            <span class="${parseFloat(p.unrealized_pnl)>=0?'pnl-pos':'pnl-neg'}">${parseFloat(p.unrealized_pnl)>=0?'+':''}$${fmt(p.unrealized_pnl)}</span>
          </div>
          <div class="stat-row"><span class="stat-label">Entry</span><span>$${fmt(p.entry_price)}</span></div>
          <div class="stat-row"><span class="stat-label">Mark</span><span>$${fmt(p.mark_price)}</span></div>
          <div class="stat-row"><span class="stat-label">Margin</span><span>$${fmt(p.margin)} (${p.mode})</span></div>
          <button class="btn btn-red btn-sm btn-full" style="margin-top:8px" onclick="closePosition('${p.id}')">Close</button>
        </div>`).join('');
    } catch {}
  }

  try {
    const d = await api('GET', `/futures/markets/${symbol}/candles`);
    const c = d.candles || [];
    if (c.length) drawOHLC(document.getElementById('ohlc'), c);
  } catch {}

  loadPositions();
}

// ── OHLC canvas chart ──────────────────────────────────────────────────────────
function drawOHLC(canvas, candles) {
  if (!canvas || !candles.length) return;
  canvas.width = canvas.offsetWidth || window.innerWidth;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = { top: 20, right: 20, bottom: 30, left: 56 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const highs = candles.map(c => parseFloat(c.high));
  const lows  = candles.map(c => parseFloat(c.low));
  const maxP = Math.max(...highs), minP = Math.min(...lows);
  const range = maxP - minP || 1;
  const toY = p => pad.top + cH - ((p - minP) / range) * cH;
  const barW = Math.max(1, Math.floor(cW / candles.length) - 1);

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (cH * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const price = maxP - (range * i / 4);
    ctx.fillStyle = '#6b7280'; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
    ctx.fillText('$' + price.toFixed(0), pad.left - 4, y + 3);
  }

  candles.forEach((c, i) => {
    const x = pad.left + ((i + 0.5) / candles.length) * cW;
    const o = parseFloat(c.open), cl = parseFloat(c.close);
    const hi = parseFloat(c.high), lo = parseFloat(c.low);
    const bull = cl >= o;
    ctx.strokeStyle = ctx.fillStyle = bull ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, toY(hi)); ctx.lineTo(x, toY(lo)); ctx.stroke();
    const top = toY(Math.max(o, cl)), bh = Math.max(1, Math.abs(toY(o) - toY(cl)));
    ctx.fillRect(x - barW/2, top, barW, bh);
  });
}

// ── Futures portfolio ──────────────────────────────────────────────────────────
async function renderFuturesPortfolio() {
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header">
        <button class="btn btn-sm btn-secondary" onclick="navigate('/futures')">← Back</button>
        <h2>Portfolio</h2>
      </div>
      <div class="futures-portfolio">
        ${skel(100,'auto','')}
        <div style="margin:12px">${skel(80,'100%','8px')}${skel(80,'100%','8px')}</div>
      </div>
    </div>
    ${bottomNav('futures')}`;

  let positions = [];
  try { const d = await api('GET', '/futures/positions'); positions = d.positions || []; } catch {}

  const open = positions.filter(p => p.status === 'open');
  const closed = positions.filter(p => p.status !== 'open');
  const totalPnl = open.reduce((s, p) => s + parseFloat(p.unrealized_pnl || 0), 0);

  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header">
        <button class="btn btn-sm btn-secondary" onclick="navigate('/futures')">← Back</button>
        <h2>Portfolio</h2>
      </div>
      <div class="futures-portfolio">
        <div class="card" style="margin:12px;text-align:center">
          <div class="stat-label">Unrealized PnL</div>
          <div style="font-size:28px;font-weight:800" class="${totalPnl>=0?'pnl-pos':'pnl-neg'}">${totalPnl>=0?'+':''}$${fmt(totalPnl)}</div>
          <div class="stat-label">${open.length} open position${open.length!==1?'s':''}</div>
        </div>
        ${open.length ? `<div class="section-title">Open Positions</div>` + open.map(p => `
          <div class="card" style="margin:0 12px 8px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span><strong>${esc(p.symbol)}</strong> <span class="${p.direction==='long'?'price-up':'price-down'}">${p.direction.toUpperCase()}</span> <span class="leverage-badge">${p.leverage}×</span></span>
              <span class="${parseFloat(p.unrealized_pnl)>=0?'pnl-pos':'pnl-neg'}">${parseFloat(p.unrealized_pnl)>=0?'+':''}$${fmt(p.unrealized_pnl)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted)">Entry $${fmt(p.entry_price)} · Mark $${fmt(p.mark_price)} · Margin $${fmt(p.margin)}</div>
            <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="navigate('/futures/${esc(p.symbol)}')">Manage →</button>
          </div>`).join('') : '<div class="empty-state">No open positions</div>'}
        ${closed.length ? `<div class="section-title">History</div>` + closed.slice(0,10).map(p => `
          <div class="stat-row" style="padding:10px 16px;border-bottom:1px solid var(--border)">
            <div><strong>${esc(p.symbol)}</strong> <span class="stat-label">${p.direction} ${p.leverage}×</span></div>
            <div style="text-align:right">
              <div class="${parseFloat(p.realized_pnl||0)>=0?'pnl-pos':'pnl-neg'}">${parseFloat(p.realized_pnl||0)>=0?'+':''}$${fmt(p.realized_pnl)}</div>
              <div class="stat-label">${p.status}</div>
            </div>
          </div>`).join('') : ''}
      </div>
    </div>
    ${bottomNav('futures')}`;
}

// ── Earn ───────────────────────────────────────────────────────────────────────
async function renderEarn() {
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Earn</h2></div>
      <div class="earn-section">
        <div class="tab-pills" style="margin-bottom:12px">
          <button class="tab-pill active">Staking</button>
          <button class="tab-pill">LP</button>
          <button class="tab-pill">ICO</button>
          <button class="tab-pill">Stocks</button>
        </div>
        ${skel(80,'100%','8px')}${skel(80,'100%','8px')}${skel(80,'100%','8px')}
      </div>
    </div>
    ${bottomNav('earn')}`;

  const TABS = ['staking','lp','ico','stocks'];

  const pills = (active) => `<div class="tab-pills" style="margin-bottom:12px">
    ${TABS.map(t => `<button class="tab-pill${t===active?' active':''}" onclick="loadEarnTab('${t}')">${t.toUpperCase()}</button>`).join('')}
  </div>`;

  const sec = () => APP.querySelector('.earn-section');

  window.loadEarnTab = async (tab) => {
    const el = sec();
    if (!el) return;
    el.innerHTML = pills(tab) + skel(80,'100%','8px');
    try {
      if (tab === 'staking') {
        const d = await api('GET', '/staking/pools');
        el.innerHTML = pills(tab) + ((d.pools||[]).map(p => `
          <div class="pool-card">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <strong>${esc(p.name)}</strong> <span class="apy-badge">${fmt(p.apy_rate*100)}% APY</span>
            </div>
            <div class="stat-label" style="margin-bottom:8px">Min stake: ${fmt(p.min_stake)} VEYA · Lock: ${p.lock_days||0}d</div>
            <div style="display:flex;gap:8px">
              <input type="number" id="s-${esc(p.id)}" placeholder="Amount" min="${p.min_stake}" style="flex:1">
              <button class="btn btn-primary btn-sm" onclick="doStake('${esc(p.id)}')">Stake</button>
            </div>
          </div>`).join('') || '<div class="empty-state">No staking pools</div>');
      } else if (tab === 'lp') {
        const d = await api('GET', '/lp/pools');
        el.innerHTML = pills(tab) + ((d.pools||[]).map(p => `
          <div class="pool-card">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <strong>${esc(p.token_a)}/${esc(p.token_b)}</strong> <span class="apy-badge">${fmt(p.fee_rate*100)}% fee</span>
            </div>
            <div class="stat-label" style="margin-bottom:8px">TVL $${fmt(p.tvl)}</div>
            <div style="display:flex;gap:8px">
              <input type="number" id="la-${esc(p.id)}" placeholder="${esc(p.token_a)}" style="flex:1">
              <input type="number" id="lb-${esc(p.id)}" placeholder="${esc(p.token_b)}" style="flex:1">
              <button class="btn btn-primary btn-sm" onclick="doLP('${esc(p.id)}','${esc(p.token_a)}','${esc(p.token_b)}')">Add</button>
            </div>
          </div>`).join('') || '<div class="empty-state">No LP pools</div>');
      } else if (tab === 'ico') {
        const d = await api('GET', '/ico');
        el.innerHTML = pills(tab) + ((d.icos||[]).map(ico => `
          <div class="pool-card">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <strong>${esc(ico.name)}</strong> <span class="${ico.status==='active'?'price-up':'stat-label'}">${esc(ico.status)}</span>
            </div>
            <div class="stat-label" style="margin-bottom:6px">Price: $${fmt(ico.token_price)} · Raised: $${fmt(ico.raised)}/$${fmt(ico.hard_cap)}</div>
            ${ico.status==='active' ? `<div style="display:flex;gap:8px">
              <input type="number" id="ico-${esc(ico.id)}" placeholder="Amount" style="flex:1">
              <button class="btn btn-primary btn-sm" onclick="doICO('${esc(ico.id)}')">Participate</button>
            </div>` : ''}
          </div>`).join('') || '<div class="empty-state">No active ICOs</div>');
      } else {
        const d = await api('GET', '/stocks');
        el.innerHTML = pills(tab) + ((d.stocks||[]).map(s => `
          <div class="pool-card">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <div><strong>${esc(s.symbol)}</strong> <span class="stat-label">${esc(s.name)}</span></div>
              <div><span style="font-weight:600">$${fmt(s.price)}</span> ${pct(s.change_pct)}</div>
            </div>
            <div style="display:flex;gap:8px">
              <input type="number" id="st-${esc(s.symbol)}" placeholder="Shares" style="flex:1" min="1">
              <button class="btn btn-green btn-sm" onclick="doStock('${esc(s.symbol)}','buy')">Buy</button>
              <button class="btn btn-red btn-sm" onclick="doStock('${esc(s.symbol)}','sell')">Sell</button>
            </div>
          </div>`).join('') || '<div class="empty-state">No stocks available</div>');
      }
    } catch (e) { const el2 = sec(); if (el2) el2.innerHTML = pills(tab) + `<div class="empty-state">${esc(e.message)}</div>`; }
  };

  window.doStake = async (poolId) => {
    const amt = parseFloat(document.getElementById(`s-${poolId}`)?.value);
    if (!amt) return toast('Enter amount','error');
    try { await api('POST','/staking/stake',{pool_id:poolId,amount:amt}); toast('Staked!','success'); window.loadEarnTab('staking'); }
    catch(e) { toast(e.message,'error'); }
  };
  window.doLP = async (id, tokenA, tokenB) => {
    const a=parseFloat(document.getElementById(`la-${id}`)?.value), b=parseFloat(document.getElementById(`lb-${id}`)?.value);
    if (!a||!b) return toast('Enter amounts','error');
    try { await api('POST','/lp/add',{pool_id:id,amount_a:a,amount_b:b}); toast('Liquidity added!','success'); window.loadEarnTab('lp'); }
    catch(e) { toast(e.message,'error'); }
  };
  window.doICO = async (id) => {
    const amt=parseFloat(document.getElementById(`ico-${id}`)?.value);
    if (!amt) return toast('Enter amount','error');
    try { await api('POST',`/ico/${id}/participate`,{amount:amt}); toast('Participated!','success'); window.loadEarnTab('ico'); }
    catch(e) { toast(e.message,'error'); }
  };
  window.doStock = async (sym, side) => {
    const shares=parseInt(document.getElementById(`st-${sym}`)?.value);
    if (!shares) return toast('Enter shares','error');
    try { await api('POST','/stocks/trade',{symbol:sym,side,shares}); toast(`${side} filled!`,'success'); window.loadEarnTab('stocks'); }
    catch(e) { toast(e.message,'error'); }
  };

  window.loadEarnTab('staking');
}

// ── Predict markets ────────────────────────────────────────────────────────────
async function renderMarkets() {
  const skelCards = Array.from({length:4}, () => `
    <div class="market-card">
      ${skel(18,'70%','8px')}
      <div class="prob-bar"><div class="prob-bar-yes" style="width:50%"></div></div>
      <div style="display:flex;justify-content:space-between">${skel(12,'40%','0')}${skel(12,'30%','0')}</div>
    </div>`).join('');
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Predict</h2></div>
      <div style="padding:12px">${skelCards}</div>
    </div>
    ${bottomNav('markets')}`;

  let markets = [];
  try { const d = await api('GET', '/markets'); markets = d.markets || []; } catch {}

  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Predict</h2></div>
      <div style="padding:12px">
        ${markets.length ? markets.map(m => {
          const yesProb = m.yes_probability ? parseFloat(m.yes_probability)*100 : 50;
          return `
            <div class="market-card">
              <div style="font-weight:600;margin-bottom:6px">${esc(m.question)}</div>
              <div class="prob-bar"><div class="prob-bar-yes" style="width:${yesProb.toFixed(0)}%"></div></div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:4px">
                <span>YES ${yesProb.toFixed(0)}%</span><span>Vol $${fmt(m.total_volume)} · ${esc(m.status)}</span>
              </div>
              ${m.status==='open'?`<div style="display:flex;gap:8px;margin-top:10px">
                <button class="btn btn-green btn-sm" style="flex:1" onclick="tradePredictYes('${m.id}')">YES</button>
                <button class="btn btn-red btn-sm" style="flex:1" onclick="tradePredictNo('${m.id}')">NO</button>
              </div>`:''}
            </div>`;
        }).join('') : '<div class="empty-state">No prediction markets</div>'}
      </div>
    </div>
    ${bottomNav('markets')}`;

  window.tradePredictYes = async (id) => {
    try { await api('POST',`/markets/${id}/trade`,{side:'YES',shares:10}); toast('Bought YES shares','success'); }
    catch(e) { toast(e.message,'error'); }
  };
  window.tradePredictNo = async (id) => {
    try { await api('POST',`/markets/${id}/trade`,{side:'NO',shares:10}); toast('Bought NO shares','success'); }
    catch(e) { toast(e.message,'error'); }
  };
}

// ── Explore ────────────────────────────────────────────────────────────────────
async function renderExplore() {
  const skelPosts = Array.from({length:4}, () => `
    <div class="post-card">
      <div style="display:flex;gap:12px">
        <div class="skeleton" style="width:36px;height:36px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1">${skel(13,'120px','6px')}${skel(14,'100%','4px')}${skel(14,'80%','0')}</div>
      </div>
    </div>`).join('');
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Explore</h2></div>
      <div style="padding:12px;border-bottom:1px solid var(--border)">
        <textarea id="post-text" placeholder="What's happening?" rows="2" style="margin-bottom:8px"></textarea>
        <button class="btn btn-primary btn-sm" onclick="submitPost()">Post</button>
      </div>
      ${skelPosts}
    </div>
    ${bottomNav('explore')}`;

  let posts = [];
  try { const d = await api('GET', '/posts'); posts = d.posts || []; } catch {}

  const postsHtml = posts.length ? posts.map(p => `
    <div class="post-card">
      <div style="display:flex;gap:12px">
        <div class="post-avatar">${esc((p.username||'?')[0].toUpperCase())}</div>
        <div class="post-content">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="post-username">${esc(p.username)}</span>
            ${tierBadge(p.verification_tier||0, p.is_admin)}
            <span class="post-time">${timeAgo(p.created_at)}</span>
          </div>
          <div class="post-text">${esc(p.content)}</div>
          <div class="post-actions">
            <button class="post-action" onclick="reactPost('${p.id}','like')">♥ ${p.like_count||0}</button>
            <button class="post-action" onclick="replyTo('${p.id}')">💬 ${p.reply_count||0}</button>
            <button class="post-action" onclick="reactPost('${p.id}','boost')">⚡ ${p.boost_count||0}</button>
          </div>
        </div>
      </div>
    </div>`).join('') : '<div class="empty-state">No posts yet — be the first!</div>';

  const pc = APP.querySelector('.page-content');
  if (pc) pc.innerHTML = `
    <div class="page-header"><h2>Explore</h2></div>
    <div style="padding:12px;border-bottom:1px solid var(--border)">
      <textarea id="post-text" placeholder="What's happening?" rows="2" style="margin-bottom:8px"></textarea>
      <button class="btn btn-primary btn-sm" onclick="submitPost()">Post</button>
    </div>
    ${postsHtml}`;

  window.submitPost = async () => {
    const content = document.getElementById('post-text')?.value?.trim();
    if (!content) return toast('Write something first','error');
    try { await api('POST','/posts',{content}); toast('Posted!','success'); renderExplore(); }
    catch(e) { toast(e.message,'error'); }
  };
  window.reactPost = async (id, type) => {
    try { await api('POST',`/posts/${id}/react`,{type}); renderExplore(); }
    catch(e) { toast(e.message,'error'); }
  };
  window.replyTo = async (id) => {
    const content = prompt('Reply:');
    if (!content) return;
    try { await api('POST',`/posts/${id}/reply`,{content}); toast('Replied!','success'); renderExplore(); }
    catch(e) { toast(e.message,'error'); }
  };
}

// ── Verify ─────────────────────────────────────────────────────────────────────
async function renderVerify() {
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Verify</h2></div>
      <div style="padding:16px">
        <div class="verify-tier">${skel(20,'60%','8px')}${skel(14,'80%','0')}</div>
        <div class="verify-tier locked">${skel(20,'50%','8px')}${skel(14,'70%','0')}</div>
        <div class="verify-tier locked">${skel(20,'40%','8px')}${skel(14,'60%','0')}</div>
      </div>
    </div>
    ${bottomNav('verify')}`;

  let tier = 0;
  try { const d = await api('GET', '/verify/status'); tier = d.verification_tier || 0; } catch {}

  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><h2>Verify Identity</h2></div>
      <div style="padding:16px">
        <div class="verify-tier done">
          <div class="verify-step">
            <div class="verify-step-icon" style="background:#064e3b">✓</div>
            <div><div style="font-weight:700">Tier 0 — Basic</div><div class="stat-label">Create an account · Free</div></div>
          </div>
          <div class="stat-label">Access: Simulated trading, posting, prediction markets</div>
        </div>

        <div class="verify-tier ${tier>=1?'done':''}">
          <div class="verify-step">
            <div class="verify-step-icon" style="background:${tier>=1?'#064e3b':'var(--bg3)'}">${tier>=1?'✓':'1'}</div>
            <div><div style="font-weight:700">Tier 1 — Social</div><div class="stat-label">Phone/email verification · Free</div></div>
          </div>
          <div class="stat-label" style="margin-bottom:10px">Access: Real futures trading, ICO participation (10× leverage)</div>
          ${tier<1 ? `
            <div style="margin-bottom:8px"><div class="input-label">Phone Number</div><input type="text" id="t1-phone" placeholder="+1234567890"></div>
            <button class="btn btn-primary btn-sm" onclick="doTier1()">Verify Phone</button>
          ` : '<div class="chip" style="color:var(--green);background:#064e3b">✓ Verified</div>'}
        </div>

        <div class="verify-tier ${tier>=2?'done':''} ${tier<1?'locked':''}">
          <div class="verify-step">
            <div class="verify-step-icon" style="background:${tier>=2?'#064e3b':'var(--bg3)'}">${tier>=2?'✓':'2'}</div>
            <div><div style="font-weight:700">Tier 2 — zkPassport</div><div class="stat-label">Zero-knowledge passport proof · Free</div></div>
          </div>
          <div class="stat-label" style="margin-bottom:10px">Access: LP pool creation, 50× leverage, advanced features</div>
          ${tier>=2 ? '<div class="chip" style="color:var(--green);background:#064e3b">✓ Verified</div>'
            : tier>=1 ? '<button class="btn btn-primary btn-sm" onclick="doTier2()">Start zkPassport</button>'
            : '<div class="stat-label">Complete Tier 1 first</div>'}
        </div>
      </div>
    </div>
    ${bottomNav('verify')}`;

  window.doTier1 = async () => {
    const phone = document.getElementById('t1-phone')?.value;
    if (!phone) return toast('Enter phone number','error');
    try { await api('POST','/verify/tier1',{method:'phone',value:phone}); toast('Submitted!','success'); renderVerify(); }
    catch(e) { toast(e.message,'error'); }
  };
  window.doTier2 = async () => {
    try {
      const d = await api('POST','/verify/tier2/init',{});
      if (d.redirect_url) window.location = d.redirect_url;
      else toast('ZK verification initiated','info');
    } catch(e) { toast(e.message,'error'); }
  };
}

// ── Profile ────────────────────────────────────────────────────────────────────
async function renderProfile(username) {
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><button class="btn btn-sm btn-secondary" onclick="history.back()">← Back</button><h2>Profile</h2></div>
      ${skel(200,'100%','0')}
    </div>
    ${bottomNav('')}`;

  try {
    const path = username ? `/user/profile/${username}` : '/user/me';
    const d = await api('GET', path);
    const u = d.user || d;
    APP.innerHTML = `
      <div class="page-content">
        <div class="page-header"><button class="btn btn-sm btn-secondary" onclick="history.back()">← Back</button><h2>${esc(u.username)}</h2></div>
        <div style="padding:20px;text-align:center;border-bottom:1px solid var(--border)">
          <div class="post-avatar" style="width:64px;height:64px;font-size:24px;margin:0 auto 12px">${esc((u.username||'?')[0].toUpperCase())}</div>
          <div style="font-size:18px;font-weight:700">${esc(u.display_name||u.username)}</div>
          <div class="stat-label">@${esc(u.username)}</div>
          <div style="margin-top:8px">${tierBadge(u.verification_tier||0,u.is_admin)}</div>
          ${u.bio ? `<div style="margin-top:8px;font-size:13px;color:var(--text-muted)">${esc(u.bio)}</div>` : ''}
          <div style="display:flex;justify-content:center;gap:24px;margin-top:16px">
            <div><div style="font-weight:700">${u.post_count||0}</div><div class="stat-label">Posts</div></div>
            <div><div style="font-weight:700">${u.follower_count||0}</div><div class="stat-label">Followers</div></div>
            <div><div style="font-weight:700">${u.following_count||0}</div><div class="stat-label">Following</div></div>
          </div>
        </div>
      </div>
      ${bottomNav('')}`;
  } catch(e) {
    APP.innerHTML = `<div class="page-content"><div class="empty-state">${esc(e.message)}</div></div>${bottomNav('')}`;
  }
}

// ── NFTs ───────────────────────────────────────────────────────────────────────
async function renderNFTs() {
  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><button class="btn btn-sm btn-secondary" onclick="navigate('/home')">← Back</button><h2>NFTs</h2><button class="btn btn-sm btn-primary" onclick="doMint()">Mint</button></div>
      <div style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${Array.from({length:4},()=>`<div class="nft-card"><div class="nft-image">${skel(80,'100%','0')}</div><div class="nft-info">${skel(14,'70%','4px')}${skel(12,'40%','0')}</div></div>`).join('')}
      </div>
    </div>
    ${bottomNav('')}`;

  let nfts = [];
  try { const d = await api('GET', '/nfts'); nfts = d.nfts || []; } catch {}

  APP.innerHTML = `
    <div class="page-content">
      <div class="page-header"><button class="btn btn-sm btn-secondary" onclick="navigate('/home')">← Back</button><h2>NFTs</h2><button class="btn btn-sm btn-primary" onclick="doMint()">Mint</button></div>
      <div style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${nfts.length ? nfts.map(n => `
          <div class="nft-card">
            <div class="nft-image">${esc(n.metadata?.emoji||'🎨')}</div>
            <div class="nft-info">
              <div style="font-weight:600;font-size:13px">${esc(n.name||'NFT')}</div>
              <div class="stat-label">#${n.token_id}</div>
              ${n.is_listed ? `<div style="margin-top:4px"><span style="font-weight:600;font-size:12px">$${fmt(n.list_price)}</span> <button class="btn btn-primary btn-sm" onclick="buyNFT('${n.id}')">Buy</button></div>` : ''}
            </div>
          </div>`).join('') : '<div class="empty-state" style="grid-column:1/-1">No NFTs found</div>'}
      </div>
    </div>
    ${bottomNav('')}`;

  window.doMint = async () => {
    const name = prompt('NFT name:');
    if (!name) return;
    try { await api('POST','/nfts/mint',{name,metadata:{emoji:'🎨'}}); toast('Minted!','success'); renderNFTs(); }
    catch(e) { toast(e.message,'error'); }
  };
  window.buyNFT = async (id) => {
    try { await api('POST','/nfts/buy',{nft_id:id}); toast('Purchased!','success'); renderNFTs(); }
    catch(e) { toast(e.message,'error'); }
  };
}

// ── Router ─────────────────────────────────────────────────────────────────────
function render() {
  const parts = window.location.pathname.replace(/^\//, '').split('/');
  const page = parts[0] || 'home';
  const sub  = parts[1] || '';

  if      (page === 'futures' && sub)   renderFuturesChart(sub.toUpperCase());
  else if (page === 'futures-portfolio') renderFuturesPortfolio();
  else if (page === 'home' || page === '') renderHome();
  else if (page === 'trade')            renderTrade();
  else if (page === 'futures')          renderFutures();
  else if (page === 'earn')             renderEarn();
  else if (page === 'markets')          renderMarkets();
  else if (page === 'explore')          renderExplore();
  else if (page === 'verify')           renderVerify();
  else if (page === 'profile')          renderProfile(sub);
  else if (page === 'nfts')             renderNFTs();
  else                                  renderHome();
}

window.addEventListener('popstate', render);
render();

// ── UTK Wallet Gate ────────────────────────────────────────────────────────────
(async function utkGate() {
  // Decode JWT to check admin status without an API call
  let isAdmin = false;
  if (TOKEN) {
    try {
      const payload = JSON.parse(atob(TOKEN.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      isAdmin = !!payload.is_admin;
    } catch {}
  }
  if (isAdmin) return;

  // Wait up to 5s for the bridge
  let walletAddr = '';
  for (let i = 0; i < 50; i++) {
    if (window.usernode && typeof window.usernode.getNodeAddress === 'function') break;
    await new Promise(r => setTimeout(r, 100));
  }
  try { walletAddr = await window.usernode.getNodeAddress(); } catch {}

  // Check UTK balance via explorer proxy
  let hasUtk = false;
  if (walletAddr) {
    try {
      const r = await fetch(`/explorer-api/address/${encodeURIComponent(walletAddr)}/balances`);
      if (r.ok) {
        const data = await r.json();
        const utk = (data.balances || data.tokens || []).find(b => (b.symbol || b.token) === 'UTK');
        if (utk && parseFloat(utk.balance || utk.amount || 0) > 0) hasUtk = true;
      }
    } catch {}
  }

  if (hasUtk) return;

  const overlay = document.createElement('div');
  overlay.id = 'utk-gate';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,12,18,0.97);display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="text-align:center;max-width:320px;padding:32px 24px">
      <div style="font-size:32px;font-weight:800;letter-spacing:-1px;margin-bottom:4px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">VEYA</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:20px">Wallet-first onchain social</div>
      <div style="width:40px;height:2px;background:#3b82f6;margin:0 auto 20px"></div>
      <div style="font-size:16px;font-weight:600;margin-bottom:10px;color:#f9fafb">You need UTK tokens to use Veya</div>
      <div style="font-size:13px;color:#9ca3af;margin-bottom:28px;line-height:1.6">UTK is the utility token of the Usernode ecosystem. Hold UTK in your wallet to access the full Veya experience.</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <a href="https://app.utktoken.io" target="_blank" rel="noopener noreferrer" style="display:block;background:#3b82f6;color:#fff;border-radius:10px;padding:13px 24px;font-size:14px;font-weight:600;text-decoration:none">Get UTK</a>
        <button id="utk-gate-dismiss" style="background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:10px;padding:13px 24px;font-size:13px;cursor:pointer">Continue Anyway</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('utk-gate-dismiss').addEventListener('click', () => overlay.remove());
})();
