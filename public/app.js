'use strict';

// ── Auth ──────────────────────────────────────────────────────────────────────
const TOKEN = window.__TOKEN__ || '';
const API_HEADERS = TOKEN ? { 'x-usernode-token': TOKEN, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const opts = { method, headers: API_HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ── Router ────────────────────────────────────────────────────────────────────
const root = document.getElementById('root');
let currentPath = '';

function navigate(path) {
  if (path === currentPath) return;
  history.pushState(null, '', path + (TOKEN ? '?token=' + encodeURIComponent(TOKEN) : ''));
  render(path);
}

window.addEventListener('popstate', () => render(window.location.pathname));

function render(path) {
  currentPath = path;
  root.innerHTML = '';

  const parts = path.replace(/^\//, '').split('/');
  const page = parts[0] || 'home';
  const sub = parts[1] || '';

  const shell = document.createElement('div');
  shell.className = 'page-content';

  if (page === 'futures' && sub) {
    renderFuturesChart(shell, sub.toUpperCase());
  } else if (page === 'futures-portfolio') {
    renderFuturesPortfolio(shell);
  } else if (page === 'home' || page === '') {
    renderHome(shell);
  } else if (page === 'trade') {
    renderTrade(shell);
  } else if (page === 'futures') {
    renderFuturesMarkets(shell);
  } else if (page === 'earn') {
    renderEarn(shell);
  } else if (page === 'markets') {
    renderMarkets(shell);
  } else if (page === 'explore') {
    renderExplore(shell);
  } else if (page === 'verify') {
    renderVerify(shell);
  } else if (page === 'profile') {
    renderProfile(shell, sub);
  } else if (page === 'post') {
    renderPost(shell, sub);
  } else if (page === 'market') {
    renderMarketDetail(shell, sub);
  } else if (page === 'token') {
    renderTokenDetail(shell, sub);
  } else if (page === 'nfts') {
    renderNFTs(shell);
  } else if (page === 'opinions') {
    renderExplore(shell);
  } else {
    renderHome(shell);
  }

  root.appendChild(shell);
  root.appendChild(buildNav(page));
  updateActiveNav(page);
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'home',    label: 'Home',    path: '/home',    icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12L12 3l9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/></svg>' },
  { id: 'trade',   label: 'Trade',   path: '/trade',   icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>' },
  { id: 'futures', label: 'Futures', path: '/futures', icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>' },
  { id: 'earn',    label: 'Earn',    path: '/earn',    icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 10v1m-6.364-5h12.728M3.343 9.343a8 8 0 1011.314 11.314A8 8 0 003.343 9.343z"/></svg>' },
  { id: 'markets', label: 'Predict', path: '/markets', icon: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>' },
];

function buildNav(activePage) {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.id = 'bottom-nav';
  NAV_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (item.id === activePage || (activePage === '' && item.id === 'home') ? ' active' : '');
    btn.dataset.navId = item.id;
    btn.innerHTML = item.icon + `<span>${item.label}</span>`;
    btn.addEventListener('click', () => navigate(item.path));
    nav.appendChild(btn);
  });
  return nav;
}

function updateActiveNav(page) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.navId === page || (page === '' && btn.dataset.navId === 'home'));
  });
}

// ── Skeleton helpers ──────────────────────────────────────────────────────────
function skeletonCard(h = 80) {
  return `<div class="skeleton rounded-xl mb-3" style="height:${h}px"></div>`;
}

function pageHeader(title, subtitle, actions = '') {
  return `<div class="flex items-center justify-between px-4 pt-4 pb-2">
    <div><h1 class="text-xl font-bold">${escHtml(title)}</h1>${subtitle ? `<p class="text-gray-400 text-sm">${escHtml(subtitle)}</p>` : ''}</div>
    ${actions}
  </div>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNum(n, dec = 2) {
  const num = parseFloat(n);
  if (isNaN(num)) return '—';
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(dec);
}

function fmtPct(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return '—';
  const sign = num >= 0 ? '+' : '';
  return `<span class="${num >= 0 ? 'price-up' : 'price-down'}">${sign}${num.toFixed(2)}%</span>`;
}

function tierBadge(tier) {
  const labels = ['Basic', 'Social', 'Premium'];
  const icons = ['🟤', '🥈', '🥇'];
  return `<span class="text-xs px-2 py-0.5 rounded-full tier-badge-${tier}">${icons[tier] || ''} ${labels[tier] || 'Basic'}</span>`;
}

// ── Home ──────────────────────────────────────────────────────────────────────
async function renderHome(container) {
  container.innerHTML = `
    <div class="p-4">
      ${skeletonCard(120)}
      ${skeletonCard(60)}
      ${skeletonCard(60)}
      ${skeletonCard(60)}
    </div>`;

  let user = null;
  try {
    const data = await api('GET', '/user/me');
    user = data.user;
  } catch (e) {
    user = { username: 'Anonymous', verification_tier: 0, veya_balance: 0 };
  }

  let tokens = [];
  try {
    const d = await api('GET', '/tokens');
    tokens = (d.tokens || []).slice(0, 8);
  } catch {}

  container.innerHTML = `
    <div class="p-4 space-y-4">
      <div class="wallet-card">
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="text-gray-300 text-sm">Welcome back</div>
            <div class="text-xl font-bold">${escHtml(user.display_name || user.username)}</div>
          </div>
          <div>${tierBadge(user.verification_tier || 0)}</div>
        </div>
        <div class="text-3xl font-bold mb-1">$${fmtNum(user.veya_balance || 0)}</div>
        <div class="text-gray-400 text-sm">VEYA Balance</div>
        <div class="mt-4 flex gap-2">
          <button class="btn btn-primary flex-1" onclick="navigate('/trade')">Swap</button>
          <button class="btn btn-secondary flex-1" onclick="navigate('/earn')">Earn</button>
          <button class="btn btn-secondary flex-1" onclick="navigate('/futures')">Trade</button>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-bold">Markets</h2>
          <button class="text-purple-400 text-sm" onclick="navigate('/trade')">See all</button>
        </div>
        <div class="space-y-2">
          ${tokens.map(t => `
            <div class="card flex items-center justify-between cursor-pointer hover:border-purple-700 transition-colors" onclick="navigate('/token/${escHtml(t.symbol)}')">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-purple-900 flex items-center justify-center text-xs font-bold">${escHtml(t.symbol.slice(0,2))}</div>
                <div>
                  <div class="font-semibold text-sm">${escHtml(t.symbol)}</div>
                  <div class="text-gray-400 text-xs">${escHtml(t.name || '')}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="font-semibold text-sm">$${fmtNum(t.price_usd)}</div>
                <div class="text-xs">${fmtPct(t.change_24h)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-bold">Quick Actions</h2>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button class="card text-left hover:border-purple-700 transition-colors" onclick="navigate('/futures')">
            <div class="text-2xl mb-1">📈</div>
            <div class="font-semibold text-sm">Futures</div>
            <div class="text-gray-400 text-xs">Trade with leverage</div>
          </button>
          <button class="card text-left hover:border-purple-700 transition-colors" onclick="navigate('/markets')">
            <div class="text-2xl mb-1">🎯</div>
            <div class="font-semibold text-sm">Predict</div>
            <div class="text-gray-400 text-xs">Prediction markets</div>
          </button>
          <button class="card text-left hover:border-purple-700 transition-colors" onclick="navigate('/earn')">
            <div class="text-2xl mb-1">💰</div>
            <div class="font-semibold text-sm">Earn</div>
            <div class="text-gray-400 text-xs">Stake & LP</div>
          </button>
          <button class="card text-left hover:border-purple-700 transition-colors" onclick="navigate('/explore')">
            <div class="text-2xl mb-1">💬</div>
            <div class="font-semibold text-sm">Social</div>
            <div class="text-gray-400 text-xs">Posts & polls</div>
          </button>
        </div>
      </div>

      <div class="flex justify-center gap-4 pb-4">
        <button class="text-purple-400 text-sm" onclick="navigate('/verify')">Verify Account</button>
        <button class="text-purple-400 text-sm" onclick="navigate('/nfts')">NFTs</button>
        <button class="text-gray-400 text-sm" onclick="navigate('/profile/')">My Profile</button>
      </div>
    </div>`;
}

// ── Trade ─────────────────────────────────────────────────────────────────────
async function renderTrade(container) {
  container.innerHTML = `<div class="p-4">${skeletonCard(300)}${skeletonCard(200)}</div>`;

  let tokens = [];
  try {
    const d = await api('GET', '/tokens');
    tokens = d.tokens || [];
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load tokens: ${escHtml(e.message)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="p-4 space-y-4">
      ${pageHeader('Trade', 'Swap tokens instantly')}

      <div class="swap-panel">
        <div class="mb-4">
          <label class="text-gray-400 text-xs mb-1 block">From</label>
          <div class="flex gap-2">
            <select id="swap-from" class="flex-1">
              ${tokens.map(t => `<option value="${escHtml(t.symbol)}">${escHtml(t.symbol)}</option>`).join('')}
            </select>
            <input type="number" id="swap-amount" placeholder="0.00" class="w-28 text-right" min="0">
          </div>
        </div>
        <div class="flex justify-center my-2">
          <button onclick="swapTokens()" class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-purple-700 transition-colors text-lg">⇅</button>
        </div>
        <div class="mb-4">
          <label class="text-gray-400 text-xs mb-1 block">To</label>
          <div class="flex gap-2">
            <select id="swap-to" class="flex-1">
              ${tokens.map((t, i) => `<option value="${escHtml(t.symbol)}" ${i === 1 ? 'selected' : ''}>${escHtml(t.symbol)}</option>`).join('')}
            </select>
            <input type="text" id="swap-receive" placeholder="0.00" class="w-28 text-right" readonly>
          </div>
        </div>
        <div id="swap-rate" class="text-gray-400 text-xs mb-4 text-center"></div>
        <button onclick="executeSwap()" class="btn btn-primary w-full text-base py-3">Connect Wallet to Swap</button>
      </div>

      <div>
        <h2 class="font-bold mb-3 px-1">All Tokens</h2>
        <div class="space-y-2">
          ${tokens.map(t => `
            <div class="card flex items-center justify-between cursor-pointer hover:border-purple-700 transition-colors" onclick="navigate('/token/${escHtml(t.symbol)}')">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-purple-900 flex items-center justify-center text-xs font-bold">${escHtml(t.symbol.slice(0,2))}</div>
                <div>
                  <div class="font-semibold">${escHtml(t.symbol)}</div>
                  <div class="text-gray-400 text-sm">${escHtml(t.name || '')}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="font-semibold">$${fmtNum(t.price_usd)}</div>
                <div class="text-xs">${fmtPct(t.change_24h)} &bull; MC $${fmtNum(t.market_cap)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  // Live rate update
  const fromSel = document.getElementById('swap-from');
  const toSel = document.getElementById('swap-to');
  const amountIn = document.getElementById('swap-amount');
  const amountOut = document.getElementById('swap-receive');
  const rateEl = document.getElementById('swap-rate');

  function updateRate() {
    const from = tokens.find(t => t.symbol === fromSel.value);
    const to = tokens.find(t => t.symbol === toSel.value);
    if (!from || !to || !amountIn.value) { amountOut.value = ''; rateEl.textContent = ''; return; }
    const rate = parseFloat(from.price_usd) / parseFloat(to.price_usd);
    const out = parseFloat(amountIn.value) * rate;
    amountOut.value = out.toFixed(6);
    rateEl.textContent = `1 ${from.symbol} ≈ ${rate.toFixed(6)} ${to.symbol}`;
  }
  [fromSel, toSel, amountIn].forEach(el => el.addEventListener('input', updateRate));
  updateRate();
}

window.swapTokens = function() {
  const f = document.getElementById('swap-from');
  const t = document.getElementById('swap-to');
  const fv = f.value; f.value = t.value; t.value = fv;
};

window.executeSwap = async function() {
  const from = document.getElementById('swap-from')?.value;
  const to = document.getElementById('swap-to')?.value;
  const amount = document.getElementById('swap-amount')?.value;
  if (!amount || !from || !to) return toast('Fill in swap details', 'error');
  try {
    toast('Swap submitted (demo mode)', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── Futures Markets ───────────────────────────────────────────────────────────
async function renderFuturesMarkets(container) {
  container.innerHTML = `<div class="p-4">${skeletonCard(60).repeat(6)}</div>`;

  let markets = [];
  try {
    const d = await api('GET', '/futures/markets');
    markets = d.markets || [];
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  container.innerHTML = `
    <div>
      ${pageHeader('Futures', 'Perpetual contracts')}
      <div class="flex gap-2 px-4 mb-3">
        <button class="btn btn-primary text-xs" onclick="navigate('/futures-portfolio')">My Portfolio</button>
        <button class="btn btn-secondary text-xs" onclick="navigate('/futures/leaderboard')">Leaderboard</button>
      </div>
      <div>
        <div class="flex text-gray-500 text-xs px-4 py-2 border-b border-gray-800">
          <span class="flex-1">Market</span>
          <span class="w-24 text-right">Price</span>
          <span class="w-16 text-right">24h</span>
          <span class="w-20 text-right">Volume</span>
        </div>
        ${markets.map(m => `
          <div class="futures-market-row" onclick="navigate('/futures/${escHtml(m.symbol)}')">
            <div class="flex-1">
              <div class="font-semibold text-sm">${escHtml(m.symbol)}</div>
              <div class="text-gray-400 text-xs">${escHtml(m.base_currency || '')} Perp</div>
            </div>
            <div class="w-24 text-right font-mono text-sm">$${fmtNum(m.mark_price)}</div>
            <div class="w-16 text-right text-xs">${fmtPct(m.change_24h)}</div>
            <div class="w-20 text-right text-xs text-gray-400">$${fmtNum(m.volume_24h)}</div>
          </div>`).join('')}
        ${markets.length === 0 ? '<div class="text-center text-gray-400 py-8">No markets available</div>' : ''}
      </div>
    </div>`;
}

// ── Futures Chart ─────────────────────────────────────────────────────────────
async function renderFuturesChart(container, symbol) {
  container.innerHTML = `
    <div>
      ${pageHeader(symbol, 'Perpetual')}
      <div class="px-4 pb-2">
        <div class="skeleton rounded-xl" style="height:260px"></div>
      </div>
      <div class="p-4">${skeletonCard(60).repeat(3)}</div>
    </div>`;

  let market = null, candles = [];
  try {
    const [md, cd] = await Promise.all([
      api('GET', `/futures/markets/${symbol}`),
      api('GET', `/futures/candles/${symbol}?interval=15m&limit=80`),
    ]);
    market = md.market;
    candles = cd.candles || [];
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load ${escHtml(symbol)}: ${escHtml(e.message)}</div>`;
    return;
  }

  const fundingRate = parseFloat(market.funding_rate || 0);
  const maxLev = market.max_leverage || 20;

  container.innerHTML = `
    <div>
      <div class="flex items-center gap-2 px-4 pt-4 pb-2">
        <button onclick="navigate('/futures')" class="text-gray-400 text-lg">←</button>
        <div class="flex-1">
          <h1 class="text-xl font-bold">${escHtml(symbol)}</h1>
          <div class="text-gray-400 text-xs">Perpetual &bull; Max ${maxLev}x</div>
        </div>
        <div class="text-right">
          <div class="text-xl font-bold">$${fmtNum(market.mark_price)}</div>
          <div class="text-xs">${fmtPct(market.change_24h)}</div>
        </div>
      </div>

      <div class="px-4 pb-2 flex gap-4 text-xs text-gray-400">
        <span>Vol: <span class="text-white">$${fmtNum(market.volume_24h)}</span></span>
        <span>OI: <span class="text-white">$${fmtNum(market.open_interest)}</span></span>
        <span>Funding: <span class="${fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}">${(fundingRate * 100).toFixed(4)}%</span></span>
      </div>

      <div class="px-4 pb-3">
        <canvas id="futures-canvas" class="futures-chart" height="220"></canvas>
      </div>

      <div class="px-4 space-y-3">
        <div class="flex gap-2 mb-2">
          <button id="side-long" onclick="setSide('long')" class="btn btn-green flex-1 opacity-100">Long</button>
          <button id="side-short" onclick="setSide('short')" class="btn btn-red flex-1 opacity-50">Short</button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-gray-400 text-xs mb-1 block">Size (USD)</label>
            <input type="number" id="futures-size" placeholder="100" min="1" class="w-full">
          </div>
          <div>
            <label class="text-gray-400 text-xs mb-1 block">Leverage (1-${maxLev}x)</label>
            <input type="number" id="futures-leverage" value="5" min="1" max="${maxLev}" class="w-full">
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <input type="checkbox" id="futures-paper" class="rounded">
          <label for="futures-paper" class="text-gray-400">Paper trade (no real funds)</label>
        </div>
        <div id="futures-margin-info" class="text-xs text-gray-400"></div>
        <button onclick="openFuturesPosition('${escHtml(symbol)}')" class="btn btn-primary w-full py-3 text-base">Open Long Position</button>
        <button onclick="navigate('/futures-portfolio')" class="btn btn-secondary w-full text-sm">View My Portfolio</button>
      </div>
    </div>`;

  drawCandleChart(candles, document.getElementById('futures-canvas'));

  const sizeEl = document.getElementById('futures-size');
  const levEl = document.getElementById('futures-leverage');
  const infoEl = document.getElementById('futures-margin-info');
  function updateMarginInfo() {
    const size = parseFloat(sizeEl.value) || 0;
    const lev = parseFloat(levEl.value) || 1;
    const margin = size / lev;
    const liqDist = (1 / lev) * 0.9 * 100;
    infoEl.textContent = `Margin: $${margin.toFixed(2)} | Liq ~${liqDist.toFixed(1)}% from entry`;
  }
  [sizeEl, levEl].forEach(el => el && el.addEventListener('input', updateMarginInfo));
  updateMarginInfo();
}

let _currentSide = 'long';
window.setSide = function(side) {
  _currentSide = side;
  const btn = document.querySelector('#futures-canvas')?.closest('.page-content');
  document.getElementById('side-long')?.classList.toggle('opacity-100', side === 'long');
  document.getElementById('side-long')?.classList.toggle('opacity-50', side !== 'long');
  document.getElementById('side-short')?.classList.toggle('opacity-100', side === 'short');
  document.getElementById('side-short')?.classList.toggle('opacity-50', side === 'long');
  const openBtn = document.querySelector('#futures-canvas + div .btn-primary, .page-content .btn-primary:last-of-type');
  const label = side === 'long' ? 'Open Long Position' : 'Open Short Position';
  document.querySelectorAll('[onclick*="openFuturesPosition"]').forEach(b => b.textContent = label);
};

window.openFuturesPosition = async function(symbol) {
  const size = parseFloat(document.getElementById('futures-size')?.value);
  const leverage = parseFloat(document.getElementById('futures-leverage')?.value);
  const isPaper = document.getElementById('futures-paper')?.checked || false;
  if (!size || size <= 0) return toast('Enter position size', 'error');
  if (!leverage || leverage < 1) return toast('Enter leverage', 'error');
  try {
    const data = await api('POST', '/futures/order', { symbol, side: _currentSide, size, leverage, is_paper_trade: isPaper });
    toast(`${isPaper ? '[Paper] ' : ''}Opened ${_currentSide} ${symbol} @${fmtNum(data.position.entry_price)} with ${leverage}x`, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── Canvas OHLC Chart ─────────────────────────────────────────────────────────
function drawCandleChart(candles, canvas) {
  if (!canvas || !candles.length) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || canvas.parentElement.offsetWidth || 360;
  const H = 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad = { top: 10, bottom: 30, left: 10, right: 50 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const data = candles.slice(-80);
  const highs = data.map(c => parseFloat(c.high));
  const lows = data.map(c => parseFloat(c.low));
  const minP = Math.min(...lows) * 0.9995;
  const maxP = Math.max(...highs) * 1.0005;
  const range = maxP - minP;

  function toY(price) { return pad.top + chartH - ((price - minP) / range) * chartH; }
  function toX(i) { return pad.left + (i / (data.length - 1)) * chartW; }

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const price = maxP - (i / 4) * range;
    ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillText('$' + fmtNum(price), W - pad.right + 3, y + 3);
  }

  // Candles
  const candleW = Math.max(2, (chartW / data.length) * 0.6);
  data.forEach((c, i) => {
    const x = toX(i);
    const open = parseFloat(c.open), close = parseFloat(c.close);
    const high = parseFloat(c.high), low = parseFloat(c.low);
    const isGreen = close >= open;
    ctx.strokeStyle = isGreen ? '#22c55e' : '#ef4444';
    ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';

    // Wick
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, toY(high));
    ctx.lineTo(x, toY(low));
    ctx.stroke();

    // Body
    const bodyTop = toY(Math.max(open, close));
    const bodyBot = toY(Math.min(open, close));
    const bodyH = Math.max(1, bodyBot - bodyTop);
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  });

  // Last price line
  if (data.length) {
    const lastClose = parseFloat(data[data.length - 1].close);
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(lastClose));
    ctx.lineTo(W - pad.right, toY(lastClose));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ── Futures Portfolio ─────────────────────────────────────────────────────────
async function renderFuturesPortfolio(container) {
  container.innerHTML = `<div class="p-4">${skeletonCard(100).repeat(3)}</div>`;

  let data = {};
  try {
    data = await api('GET', '/futures/portfolio');
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  const { open_positions = [], closed_positions = [], stats = {} } = data;

  container.innerHTML = `
    <div class="futures-portfolio p-4 space-y-4">
      <div class="flex items-center gap-2 mb-2">
        <button onclick="navigate('/futures')" class="text-gray-400 text-lg">←</button>
        <h1 class="text-xl font-bold">My Portfolio</h1>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="card text-center">
          <div class="text-gray-400 text-xs mb-1">Total P&L</div>
          <div class="text-xl font-bold ${parseFloat(stats.total_pnl||0) >= 0 ? 'pnl-positive' : 'pnl-negative'}">
            $${fmtNum(stats.total_pnl || 0)}
          </div>
        </div>
        <div class="card text-center">
          <div class="text-gray-400 text-xs mb-1">Win Rate</div>
          <div class="text-xl font-bold">
            ${stats.total_trades > 0 ? ((stats.winning_trades / stats.total_trades) * 100).toFixed(0) : '—'}%
          </div>
        </div>
        <div class="card text-center">
          <div class="text-gray-400 text-xs mb-1">Total Trades</div>
          <div class="text-xl font-bold">${stats.total_trades || 0}</div>
        </div>
        <div class="card text-center">
          <div class="text-gray-400 text-xs mb-1">Margin Used</div>
          <div class="text-xl font-bold">$${fmtNum(stats.total_margin_used || 0)}</div>
        </div>
      </div>

      <div>
        <h2 class="font-bold mb-2">Open Positions (${open_positions.length})</h2>
        ${open_positions.length === 0 ? '<div class="card text-center text-gray-400 py-4">No open positions</div>' : ''}
        ${open_positions.map(p => `
          <div class="card mb-2">
            <div class="flex items-start justify-between mb-2">
              <div>
                <span class="font-bold">${escHtml(p.market_symbol)}</span>
                <span class="ml-2 text-xs px-2 py-0.5 rounded ${p.side === 'long' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}">${p.side.toUpperCase()} ${p.leverage}x</span>
                ${p.is_paper_trade ? '<span class="ml-1 text-xs text-gray-400">[Paper]</span>' : ''}
              </div>
              <button onclick="closePosition(${p.id})" class="text-xs btn btn-red">Close</button>
            </div>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div><div class="text-gray-400">Entry</div><div>$${fmtNum(p.entry_price)}</div></div>
              <div><div class="text-gray-400">Mark</div><div>$${fmtNum(p.mark_price)}</div></div>
              <div><div class="text-gray-400">Liq</div><div class="text-red-400">$${fmtNum(p.liquidation_price)}</div></div>
              <div><div class="text-gray-400">Size</div><div>${p.size}</div></div>
              <div><div class="text-gray-400">Margin</div><div>$${fmtNum(p.margin)}</div></div>
              <div><div class="text-gray-400">uPnL</div><div class="${parseFloat(p.unrealized_pnl) >= 0 ? 'pnl-positive' : 'pnl-negative'}">$${fmtNum(p.unrealized_pnl)}</div></div>
            </div>
          </div>`).join('')}
      </div>

      <div>
        <h2 class="font-bold mb-2">Recent Closed</h2>
        ${closed_positions.length === 0 ? '<div class="card text-center text-gray-400 py-4">No closed positions</div>' : ''}
        ${closed_positions.slice(0, 10).map(p => `
          <div class="card mb-2 flex justify-between items-center">
            <div>
              <span class="font-bold text-sm">${escHtml(p.market_symbol)}</span>
              <span class="ml-2 text-xs text-gray-400">${p.side} ${p.leverage}x</span>
              ${p.is_paper_trade ? '<span class="ml-1 text-xs text-gray-500">[Paper]</span>' : ''}
            </div>
            <div class="text-right">
              <div class="${parseFloat(p.realized_pnl) >= 0 ? 'pnl-positive' : 'pnl-negative'} font-semibold">
                $${fmtNum(p.realized_pnl)}
              </div>
              <div class="text-gray-400 text-xs">${p.status}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

window.closePosition = async function(posId) {
  if (!confirm('Close this position?')) return;
  try {
    const d = await api('POST', `/futures/close/${posId}`, {});
    const pnl = parseFloat(d.pnl);
    toast(`Closed! P&L: ${pnl >= 0 ? '+' : ''}$${fmtNum(pnl)}`, pnl >= 0 ? 'success' : 'error');
    renderFuturesPortfolio(document.querySelector('.page-content'));
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── Earn ──────────────────────────────────────────────────────────────────────
async function renderEarn(container) {
  container.innerHTML = `<div class="p-4">${skeletonCard(80).repeat(4)}</div>`;

  let stakingPools = [], userPositions = [], lpPools = [], icos = [];
  try {
    const [sd, lpd, icosd] = await Promise.all([
      api('GET', '/staking'),
      api('GET', '/lp'),
      api('GET', '/icos'),
    ]);
    stakingPools = sd.pools || [];
    userPositions = sd.positions || [];
    lpPools = lpd.pools || [];
    icos = icosd.icos || [];
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  let earnTab = 'stake';

  function renderEarnContent() {
    const inner = document.getElementById('earn-inner');
    if (!inner) return;
    if (earnTab === 'stake') {
      inner.innerHTML = `
        <div class="space-y-3">
          ${userPositions.filter(p => p.status === 'active').length > 0 ? `
            <h3 class="font-semibold text-gray-300 text-sm">My Active Stakes</h3>
            ${userPositions.filter(p => p.status === 'active').map(pos => `
              <div class="card">
                <div class="flex justify-between items-start mb-2">
                  <div><div class="font-semibold">${escHtml(pos.pool_name)}</div>
                  <div class="text-xs text-gray-400">${parseFloat(pos.apy).toFixed(1)}% APY</div></div>
                  <button onclick="unstakePosition(${pos.id})" class="text-xs btn btn-secondary">Unstake</button>
                </div>
                <div class="text-xs text-gray-400">Staked: <span class="text-white">${fmtNum(pos.amount_staked)}</span></div>
              </div>`).join('')}
          ` : ''}
          <h3 class="font-semibold text-gray-300 text-sm mt-2">Staking Pools</h3>
          ${stakingPools.map(p => `
            <div class="card">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <div class="font-semibold">${escHtml(p.name)}</div>
                  <div class="text-xs text-gray-400">${escHtml(p.token_symbol)} &bull; TVL: $${fmtNum(p.total_staked)}</div>
                </div>
                <div class="text-right">
                  <div class="text-green-400 font-bold">${parseFloat(p.apy).toFixed(1)}%</div>
                  <div class="text-xs text-gray-400">APY</div>
                </div>
              </div>
              <div class="flex gap-2 mt-2">
                <input type="number" id="stake-amt-${p.id}" placeholder="Amount" class="flex-1">
                <button onclick="stakeInPool(${p.id})" class="btn btn-primary text-sm">Stake</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else if (earnTab === 'lp') {
      inner.innerHTML = `
        <div class="space-y-3">
          ${lpPools.map(p => `
            <div class="card">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <div class="font-semibold">${escHtml(p.name)}</div>
                  <div class="text-xs text-gray-400">TVL: $${fmtNum(p.tvl)} &bull; Fee: ${p.fee_rate}%</div>
                </div>
                <div class="text-right">
                  <div class="text-green-400 font-bold">${parseFloat(p.apy || 0).toFixed(1)}%</div>
                  <div class="text-xs text-gray-400">APY</div>
                </div>
              </div>
              <button onclick="addLiquidity(${p.id})" class="btn btn-primary text-sm w-full">Add Liquidity</button>
            </div>`).join('')}
        </div>`;
    } else if (earnTab === 'icos') {
      inner.innerHTML = `
        <div class="space-y-3">
          ${icos.map(ico => `
            <div class="card">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <div class="font-semibold">${escHtml(ico.name)} <span class="text-xs text-gray-400">(${escHtml(ico.symbol)})</span></div>
                  <div class="text-xs text-gray-400">${escHtml(ico.description || '').slice(0, 80)}</div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded ${ico.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-400'}">${ico.status}</span>
              </div>
              <div class="flex justify-between text-xs text-gray-400 mb-2">
                <span>Price: $${fmtNum(ico.token_price, 4)}</span>
                <span>Raised: $${fmtNum(ico.amount_raised)} / $${fmtNum(ico.hard_cap)}</span>
              </div>
              <div class="w-full bg-gray-800 rounded-full h-1.5 mb-2">
                <div class="bg-purple-500 h-1.5 rounded-full" style="width:${Math.min(100, (ico.amount_raised/ico.hard_cap)*100).toFixed(0)}%"></div>
              </div>
              ${ico.status === 'active' ? `
                <div class="flex gap-2 mt-2">
                  <input type="number" id="ico-amt-${ico.id}" placeholder="Amount (USDC)" class="flex-1">
                  <button onclick="buyICO(${ico.id})" class="btn btn-primary text-sm">Buy</button>
                </div>` : ''}
            </div>`).join('')}
        </div>`;
    }
  }

  container.innerHTML = `
    <div class="earn-section">
      ${pageHeader('Earn', 'Stake, LP & participate in ICOs')}
      <div class="px-4">
        <div class="tab-pills">
          <button class="tab-pill active" onclick="setEarnTab('stake',this)">Staking</button>
          <button class="tab-pill" onclick="setEarnTab('lp',this)">Liquidity</button>
          <button class="tab-pill" onclick="setEarnTab('icos',this)">ICOs</button>
        </div>
        <div id="earn-inner"></div>
      </div>
    </div>`;

  window.setEarnTab = (tab, btn) => {
    earnTab = tab;
    document.querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEarnContent();
  };
  renderEarnContent();
}

window.stakeInPool = async function(poolId) {
  const amt = parseFloat(document.getElementById(`stake-amt-${poolId}`)?.value);
  if (!amt || amt <= 0) return toast('Enter amount', 'error');
  try {
    await api('POST', '/staking/stake', { pool_id: poolId, amount: amt });
    toast(`Staked ${amt} successfully!`, 'success');
    renderEarn(document.querySelector('.page-content'));
  } catch (e) { toast(e.message, 'error'); }
};

window.unstakePosition = async function(posId) {
  if (!confirm('Unstake this position?')) return;
  try {
    const d = await api('POST', `/staking/unstake/${posId}`, {});
    toast(`Unstaked! Rewards: ${fmtNum(d.rewards)}`, 'success');
    renderEarn(document.querySelector('.page-content'));
  } catch (e) { toast(e.message, 'error'); }
};

window.buyICO = async function(icoId) {
  const amt = parseFloat(document.getElementById(`ico-amt-${icoId}`)?.value);
  if (!amt || amt <= 0) return toast('Enter amount', 'error');
  try {
    const d = await api('POST', `/icos/${icoId}/buy`, { amount: amt });
    toast(`Bought ${fmtNum(d.tokens_received)} tokens!`, 'success');
  } catch (e) { toast(e.message, 'error'); }
};

window.addLiquidity = function(poolId) {
  toast('LP functionality coming soon', 'info');
};

// ── Prediction Markets ────────────────────────────────────────────────────────
async function renderMarkets(container) {
  container.innerHTML = `<div class="p-4">${skeletonCard(100).repeat(4)}</div>`;

  let markets = [];
  try {
    const d = await api('GET', '/markets');
    markets = d.markets || [];
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="p-4">
      ${pageHeader('Predict', 'Prediction Markets', `<button onclick="showCreateMarket()" class="btn btn-primary text-sm">+ New</button>`)}
      <div id="create-market-form" class="hidden card mb-4">
        <h3 class="font-bold mb-3">Create Market</h3>
        <div class="space-y-3">
          <div><label class="text-gray-400 text-xs mb-1 block">Question</label><input type="text" id="mkt-question" placeholder="Will BTC reach $100k by end of year?" class="w-full"></div>
          <div><label class="text-gray-400 text-xs mb-1 block">Closes At</label><input type="date" id="mkt-closes" class="w-full"></div>
          <button onclick="createMarket()" class="btn btn-primary w-full">Create</button>
          <button onclick="hideCreateMarket()" class="btn btn-secondary w-full text-sm">Cancel</button>
        </div>
      </div>
      <div class="space-y-3">
        ${markets.map(m => `
          <div class="market-card" onclick="navigate('/market/${m.id}')">
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1 pr-2">
                <div class="font-semibold text-sm leading-tight">${escHtml(String(m.question || '').slice(0, 120))}</div>
                <div class="text-gray-400 text-xs mt-1">by ${escHtml(m.creator_username || 'anonymous')}</div>
              </div>
              <span class="text-xs px-2 py-0.5 rounded ${m.status === 'open' ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-400'}">${m.status}</span>
            </div>
            <div class="flex gap-4 text-xs">
              <div class="flex-1">
                <div class="flex justify-between mb-1"><span class="text-green-400">YES ${parseFloat(m.yes_price * 100 || 50).toFixed(0)}%</span><span class="text-red-400">NO ${parseFloat(m.no_price * 100 || 50).toFixed(0)}%</span></div>
                <div class="w-full bg-gray-800 rounded-full h-2">
                  <div class="bg-gradient-to-r from-green-500 to-red-500 h-2 rounded-full" style="background: linear-gradient(90deg, #22c55e ${parseFloat(m.yes_price * 100 || 50).toFixed(0)}%, #ef4444 ${parseFloat(m.yes_price * 100 || 50).toFixed(0)}%)"></div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-gray-400">Vol: $${fmtNum(m.liquidity || 0)}</div>
                <div class="text-gray-500">Closes ${new Date(m.closes_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>`).join('')}
        ${markets.length === 0 ? '<div class="card text-center text-gray-400 py-6">No prediction markets yet</div>' : ''}
      </div>
    </div>`;
}

window.showCreateMarket = () => document.getElementById('create-market-form')?.classList.remove('hidden');
window.hideCreateMarket = () => document.getElementById('create-market-form')?.classList.add('hidden');
window.createMarket = async function() {
  const q = document.getElementById('mkt-question')?.value?.trim();
  const closes = document.getElementById('mkt-closes')?.value;
  if (!q || !closes) return toast('Fill in all fields', 'error');
  try {
    await api('POST', '/markets', { question: q, closes_at: closes + 'T23:59:59Z' });
    toast('Market created!', 'success');
    navigate('/markets');
  } catch (e) { toast(e.message, 'error'); }
};

// ── Market Detail ─────────────────────────────────────────────────────────────
async function renderMarketDetail(container, id) {
  container.innerHTML = `<div class="p-4">${skeletonCard(200)}${skeletonCard(100)}</div>`;

  let data = {};
  try {
    data = await api('GET', `/markets/${id}`);
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  const { market: m, price_history = [], comments = [], user_position = null } = data;
  if (!m) return;

  container.innerHTML = `
    <div class="p-4 space-y-4">
      <div class="flex items-center gap-2">
        <button onclick="navigate('/markets')" class="text-gray-400 text-lg">←</button>
        <h1 class="text-lg font-bold leading-tight">${escHtml(String(m.question || '').slice(0, 200))}</h1>
      </div>
      <div class="flex gap-3 text-xs text-gray-400">
        <span>Status: <span class="${m.status === 'open' ? 'text-green-400' : 'text-gray-300'}">${m.status}</span></span>
        <span>Liquidity: $${fmtNum(m.liquidity)}</span>
        <span>Closes: ${new Date(m.closes_at).toLocaleDateString()}</span>
      </div>
      ${m.status === 'open' ? `
        <div class="card">
          <h3 class="font-bold mb-3">Trade</h3>
          <div class="flex gap-2 mb-3">
            <button id="outcome-yes" onclick="setOutcome('yes')" class="btn btn-green flex-1">YES ${parseFloat(m.yes_price * 100 || 50).toFixed(0)}¢</button>
            <button id="outcome-no" onclick="setOutcome('no')" class="btn btn-red flex-1 opacity-50">NO ${parseFloat(m.no_price * 100 || 50).toFixed(0)}¢</button>
          </div>
          <div class="flex gap-2">
            <input type="number" id="mkt-shares" placeholder="Shares" min="1" class="flex-1">
            <button onclick="tradeMarket(${m.id})" class="btn btn-primary">Buy</button>
          </div>
          ${user_position ? `<div class="mt-2 text-xs text-gray-400">Your position: ${fmtNum(user_position.yes_shares)} YES / ${fmtNum(user_position.no_shares)} NO</div>` : ''}
        </div>` : m.status === 'resolved' ? `<div class="card text-center py-4"><div class="text-gray-400 text-sm">Resolved: <span class="text-white font-bold">${m.resolved_outcome?.toUpperCase()}</span></div></div>` : ''}
      <div class="card">
        <h3 class="font-bold mb-3 text-sm">Discussion</h3>
        <div class="space-y-2 mb-3">
          ${comments.map(c => `
            <div class="border-b border-gray-800 pb-2">
              <div class="text-xs text-gray-400 mb-0.5">${escHtml(c.username)}</div>
              <div class="text-sm">${escHtml(c.content)}</div>
            </div>`).join('')}
          ${comments.length === 0 ? '<div class="text-gray-400 text-sm">No comments yet</div>' : ''}
        </div>
        <div class="flex gap-2">
          <input type="text" id="mkt-comment" placeholder="Add a comment..." class="flex-1">
          <button onclick="postMarketComment(${m.id})" class="btn btn-secondary text-sm">Post</button>
        </div>
      </div>
    </div>`;
}

let _currentOutcome = 'yes';
window.setOutcome = (o) => {
  _currentOutcome = o;
  document.getElementById('outcome-yes')?.classList.toggle('opacity-50', o !== 'yes');
  document.getElementById('outcome-no')?.classList.toggle('opacity-50', o === 'yes');
};
window.tradeMarket = async function(mktId) {
  const shares = parseFloat(document.getElementById('mkt-shares')?.value);
  if (!shares || shares <= 0) return toast('Enter shares', 'error');
  try {
    await api('POST', `/markets/${mktId}/trade`, { outcome: _currentOutcome, shares });
    toast(`Bought ${shares} ${_currentOutcome.toUpperCase()} shares!`, 'success');
  } catch (e) { toast(e.message, 'error'); }
};
window.postMarketComment = async function(mktId) {
  const content = document.getElementById('mkt-comment')?.value?.trim();
  if (!content) return;
  try {
    await api('POST', `/markets/${mktId}/comment`, { content });
    toast('Comment posted!', 'success');
    renderMarketDetail(document.querySelector('.page-content'), mktId);
  } catch (e) { toast(e.message, 'error'); }
};

// ── Explore (Social) ──────────────────────────────────────────────────────────
async function renderExplore(container) {
  container.innerHTML = `<div>${skeletonCard(80).repeat(5)}</div>`;

  let posts = [];
  try {
    const d = await api('GET', '/posts');
    posts = d.posts || [];
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  container.innerHTML = `
    <div>
      ${pageHeader('Social', 'Explore & discuss', `<button onclick="showNewPost()" class="btn btn-primary text-sm">Post</button>`)}
      <div id="new-post-form" class="hidden px-4 mb-3">
        <div class="card">
          <textarea id="post-content" placeholder="What's happening in crypto?" class="w-full mb-2" rows="3"></textarea>
          <div class="flex justify-end gap-2">
            <button onclick="hideNewPost()" class="btn btn-secondary text-sm">Cancel</button>
            <button onclick="submitPost()" class="btn btn-primary text-sm">Post</button>
          </div>
        </div>
      </div>
      <div class="tab-pills mx-4 mb-0">
        <button class="tab-pill active" onclick="loadPosts('global', this)">Global</button>
        <button class="tab-pill" onclick="loadPosts('following', this)">Following</button>
      </div>
      <div id="posts-list">
        ${renderPostCards(posts)}
      </div>
    </div>`;
}

function renderPostCards(posts) {
  if (posts.length === 0) return '<div class="text-center text-gray-400 py-8">No posts yet</div>';
  return posts.map(p => `
    <div class="post-card" onclick="navigate('/post/${p.id}')">
      <div class="flex items-start gap-2 mb-2">
        <div class="w-8 h-8 rounded-full bg-purple-900 flex items-center justify-center text-xs font-bold flex-shrink-0">
          ${escHtml((p.username || '?').slice(0, 1).toUpperCase())}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">${escHtml(p.username)}</div>
          <div class="text-gray-400 text-xs">${new Date(p.created_at).toLocaleString()}</div>
        </div>
      </div>
      <div class="text-sm mb-2">${escHtml(p.content)}</div>
      <div class="flex gap-4 text-gray-500 text-xs">
        <button onclick="event.stopPropagation(); reactPost(${p.id})" class="hover:text-white">❤️ ${p.reaction_count || 0}</button>
        <span>💬 ${p.reply_count || 0}</span>
      </div>
    </div>`).join('');
}

window.showNewPost = () => document.getElementById('new-post-form')?.classList.remove('hidden');
window.hideNewPost = () => document.getElementById('new-post-form')?.classList.add('hidden');
window.submitPost = async function() {
  const content = document.getElementById('post-content')?.value?.trim();
  if (!content) return toast('Write something!', 'error');
  try {
    await api('POST', '/posts', { content });
    toast('Posted!', 'success');
    renderExplore(document.querySelector('.page-content'));
  } catch (e) { toast(e.message, 'error'); }
};
window.loadPosts = async function(mode, btn) {
  document.querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  try {
    const d = await api('GET', `/posts?mode=${mode}`);
    document.getElementById('posts-list').innerHTML = renderPostCards(d.posts || []);
  } catch (e) { toast(e.message, 'error'); }
};
window.reactPost = async function(postId) {
  try {
    await api('POST', `/posts/${postId}/react`, { type: 'like' });
  } catch (e) { toast(e.message, 'error'); }
};

// ── Post Detail ───────────────────────────────────────────────────────────────
async function renderPost(container, id) {
  container.innerHTML = `<div class="p-4">${skeletonCard(120)}${skeletonCard(80).repeat(3)}</div>`;

  let data = {};
  try {
    data = await api('GET', `/posts/${id}`);
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  const { post: p, replies = [] } = data;
  if (!p) return;

  container.innerHTML = `
    <div>
      <div class="flex items-center gap-2 p-4">
        <button onclick="navigate('/explore')" class="text-gray-400 text-lg">←</button>
        <h1 class="font-bold">Post</h1>
      </div>
      <div class="post-card">
        <div class="flex items-start gap-2 mb-2">
          <div class="w-9 h-9 rounded-full bg-purple-900 flex items-center justify-center text-sm font-bold flex-shrink-0">
            ${escHtml((p.username || '?').slice(0,1).toUpperCase())}
          </div>
          <div>
            <div class="font-semibold">${escHtml(p.username)}</div>
            <div class="text-gray-400 text-xs">${new Date(p.created_at).toLocaleString()}</div>
          </div>
        </div>
        <div class="text-base mb-3">${escHtml(p.content)}</div>
        <div class="flex gap-4 text-gray-500 text-sm">
          <button onclick="reactPost(${p.id})" class="hover:text-white">❤️ ${p.reaction_count || 0}</button>
          <span>💬 ${p.reply_count || 0}</span>
        </div>
      </div>
      <div class="p-4 border-t border-gray-800">
        <div class="flex gap-2 mb-4">
          <input type="text" id="reply-input" placeholder="Reply..." class="flex-1">
          <button onclick="submitReply(${p.id})" class="btn btn-primary text-sm">Reply</button>
        </div>
        ${replies.map(r => `
          <div class="border-b border-gray-800 py-3">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs">${escHtml((r.username||'?').slice(0,1).toUpperCase())}</div>
              <span class="font-semibold text-sm">${escHtml(r.username)}</span>
              <span class="text-gray-400 text-xs">${new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div class="text-sm ml-8">${escHtml(r.content)}</div>
          </div>`).join('')}
        ${replies.length === 0 ? '<div class="text-center text-gray-400 text-sm py-4">No replies yet</div>' : ''}
      </div>
    </div>`;
}

window.submitReply = async function(postId) {
  const content = document.getElementById('reply-input')?.value?.trim();
  if (!content) return;
  try {
    await api('POST', `/posts/${postId}/reply`, { content });
    toast('Replied!', 'success');
    renderPost(document.querySelector('.page-content'), postId);
  } catch (e) { toast(e.message, 'error'); }
};

// ── Verify ────────────────────────────────────────────────────────────────────
async function renderVerify(container) {
  container.innerHTML = `<div class="p-4">${skeletonCard(120).repeat(2)}</div>`;

  let status = { tier: 0 };
  try {
    const d = await api('GET', '/verify/status');
    status = d;
  } catch {}

  const tier = status.tier || 0;
  const tiers = [
    {
      level: 0, title: 'Basic — Wallet Connected', icon: '🟤',
      perks: ['Access to all social features', 'Paper trading', 'Basic market data'],
      current: tier >= 0,
    },
    {
      level: 1, title: 'Social — Base Verified', icon: '🥈',
      perks: ['Live futures trading', 'ICO participation', 'LP pools', 'Higher rate limits'],
      current: tier >= 1,
      action: tier < 1 ? 'startSocialVerify' : null,
      actionLabel: 'Verify with Base',
      available: status.base_verify_available,
    },
    {
      level: 2, title: 'Premium — zkPassport', icon: '🥇',
      perks: ['All Social perks', 'Premium analytics', 'Higher leverage', 'Exclusive pools'],
      current: tier >= 2,
      action: tier < 2 ? 'startPassportVerify' : null,
      actionLabel: 'Verify Passport',
      available: status.zkpassport_available,
    },
  ];

  container.innerHTML = `
    <div class="p-4 space-y-4">
      ${pageHeader('Verify Identity', 'Unlock more features')}
      <div class="card text-center mb-2">
        <div class="text-4xl mb-2">${['🟤','🥈','🥇'][tier] || '🟤'}</div>
        <div class="font-bold text-lg">${['Basic','Social','Premium'][tier] || 'Basic'}</div>
        <div class="text-gray-400 text-sm">Current verification level</div>
      </div>
      ${tiers.map(t => `
        <div class="verify-tier ${t.current && tier === t.level ? 'border-purple-700' : ''}">
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-2xl">${t.icon}</span>
              <div>
                <div class="font-semibold">${escHtml(t.title)}</div>
                ${t.current ? '<div class="text-green-400 text-xs">✓ Unlocked</div>' : ''}
              </div>
            </div>
            ${t.action && !t.current ? `
              <button onclick="window.${t.action}()" class="btn btn-primary text-xs" ${!t.available ? 'disabled' : ''}>
                ${t.available ? escHtml(t.actionLabel) : 'Coming Soon'}
              </button>` : ''}
          </div>
          <ul class="text-gray-400 text-sm space-y-1">
            ${t.perks.map(p => `<li class="flex items-center gap-1.5"><span class="${t.current ? 'text-green-400' : 'text-gray-600'}">✓</span>${escHtml(p)}</li>`).join('')}
          </ul>
        </div>`).join('')}
    </div>`;
}

window.startSocialVerify = async function() {
  try {
    const d = await api('POST', '/verify/social/start', {});
    if (d.url) {
      toast('Redirecting to Base Verify...', 'info');
    } else if (d.coming_soon) {
      toast('Base Verify coming soon!', 'info');
    }
  } catch (e) {
    if (e.message.includes('coming soon') || e.message.includes('not configured')) toast('Coming soon!', 'info');
    else toast(e.message, 'error');
  }
};

window.startPassportVerify = async function() {
  try {
    const d = await api('POST', '/verify/passport/start', {});
    if (d.url) toast('Redirecting to zkPassport...', 'info');
    else if (d.coming_soon) toast('zkPassport coming soon!', 'info');
  } catch (e) {
    if (e.message.includes('coming soon') || e.message.includes('not configured') || e.message.includes('not installed')) toast('Coming soon!', 'info');
    else toast(e.message, 'error');
  }
};

// ── Profile ───────────────────────────────────────────────────────────────────
async function renderProfile(container, username) {
  container.innerHTML = `<div class="p-4">${skeletonCard(160)}${skeletonCard(60).repeat(3)}</div>`;

  let user = null, posts = [];
  try {
    if (username) {
      const d = await api('GET', `/user/profile/${username}`);
      user = d.user;
    } else {
      const d = await api('GET', '/user/me');
      user = d.user;
    }
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">User not found</div>`;
    return;
  }

  try {
    const d = await api('GET', '/posts');
    posts = (d.posts || []).filter(p => p.user_id === user.user_id || p.username === user.username).slice(0, 10);
  } catch {}

  const isSelf = !username;

  container.innerHTML = `
    <div class="p-4 space-y-4">
      <div class="card text-center">
        <div class="w-16 h-16 rounded-full bg-purple-900 flex items-center justify-center text-2xl font-bold mx-auto mb-3">
          ${escHtml((user.username || '?').slice(0,1).toUpperCase())}
        </div>
        <div class="font-bold text-xl mb-1">${escHtml(user.display_name || user.username)}</div>
        <div class="text-gray-400 text-sm mb-2">@${escHtml(user.username)}</div>
        <div class="flex justify-center mb-3">${tierBadge(user.verification_tier || 0)}</div>
        ${user.bio ? `<div class="text-gray-300 text-sm mb-3">${escHtml(user.bio)}</div>` : ''}
        <div class="flex justify-center gap-6 text-sm">
          <div class="text-center"><div class="font-bold">${user.follower_count || 0}</div><div class="text-gray-400 text-xs">Followers</div></div>
          <div class="text-center"><div class="font-bold">${user.following_count || 0}</div><div class="text-gray-400 text-xs">Following</div></div>
          <div class="text-center"><div class="font-bold">${user.post_count || 0}</div><div class="text-gray-400 text-xs">Posts</div></div>
        </div>
        ${isSelf ? `
          <div class="mt-4 space-y-2">
            <input type="text" id="prof-name" placeholder="Display name" value="${escHtml(user.display_name || '')}" class="w-full text-sm">
            <textarea id="prof-bio" placeholder="Bio" rows="2" class="w-full text-sm">${escHtml(user.bio || '')}</textarea>
            <button onclick="saveProfile()" class="btn btn-primary w-full text-sm">Save Profile</button>
            <button onclick="navigate('/verify')" class="btn btn-outline w-full text-sm">Verify Account</button>
          </div>` : `
          <div class="mt-4">
            <button onclick="followUser('${escHtml(user.username)}')" class="btn btn-primary w-full text-sm">Follow</button>
          </div>`}
      </div>
      <div>
        <h2 class="font-bold mb-2">Posts</h2>
        ${renderPostCards(posts)}
      </div>
    </div>`;
}

window.saveProfile = async function() {
  const display_name = document.getElementById('prof-name')?.value?.trim();
  const bio = document.getElementById('prof-bio')?.value?.trim();
  try {
    await api('POST', '/user/profile', { display_name, bio });
    toast('Profile updated!', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

window.followUser = async function(username) {
  try {
    await api('POST', '/follow', { username });
    toast(`Following @${username}!`, 'success');
  } catch (e) { toast(e.message, 'error'); }
};

// ── Token Detail ──────────────────────────────────────────────────────────────
async function renderTokenDetail(container, symbol) {
  container.innerHTML = `<div class="p-4">${skeletonCard(200)}</div>`;

  let token = null;
  try {
    const d = await api('GET', `/tokens/${symbol}`);
    token = d.token;
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Token not found</div>`;
    return;
  }

  container.innerHTML = `
    <div class="p-4 space-y-4">
      <div class="flex items-center gap-2">
        <button onclick="navigate('/trade')" class="text-gray-400 text-lg">←</button>
        <div class="w-10 h-10 rounded-full bg-purple-900 flex items-center justify-center font-bold">${escHtml(token.symbol.slice(0,2))}</div>
        <div>
          <div class="font-bold text-lg">${escHtml(token.symbol)}</div>
          <div class="text-gray-400 text-sm">${escHtml(token.name || '')}</div>
        </div>
      </div>
      <div class="card">
        <div class="text-3xl font-bold mb-1">$${fmtNum(token.price_usd)}</div>
        <div>${fmtPct(token.change_24h)} (24h)</div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="card"><div class="text-gray-400 text-xs">Market Cap</div><div class="font-semibold">$${fmtNum(token.market_cap)}</div></div>
        <div class="card"><div class="text-gray-400 text-xs">24h Volume</div><div class="font-semibold">$${fmtNum(token.volume_24h)}</div></div>
        <div class="card"><div class="text-gray-400 text-xs">24h High</div><div class="font-semibold text-green-400">$${fmtNum(token.high_24h)}</div></div>
        <div class="card"><div class="text-gray-400 text-xs">24h Low</div><div class="font-semibold text-red-400">$${fmtNum(token.low_24h)}</div></div>
      </div>
      <button onclick="navigate('/trade')" class="btn btn-primary w-full">Trade ${escHtml(token.symbol)}</button>
    </div>`;
}

// ── NFTs ──────────────────────────────────────────────────────────────────────
async function renderNFTs(container) {
  container.innerHTML = `<div class="p-4">${skeletonCard(160).repeat(4)}</div>`;

  let nfts = [];
  try {
    const d = await api('GET', '/nfts');
    nfts = d.nfts || [];
  } catch (e) {
    container.innerHTML = `<div class="p-4 text-center text-gray-400">Failed to load NFTs</div>`;
    return;
  }

  container.innerHTML = `
    <div class="p-4">
      ${pageHeader('NFTs', 'Mint & collect', `<button onclick="showMintNFT()" class="btn btn-primary text-sm">Mint</button>`)}
      <div id="mint-form" class="hidden card mb-4">
        <h3 class="font-bold mb-3">Mint NFT</h3>
        <div class="space-y-2">
          <input type="text" id="nft-name" placeholder="NFT Name" class="w-full">
          <textarea id="nft-desc" placeholder="Description" rows="2" class="w-full"></textarea>
          <input type="number" id="nft-price" placeholder="List price (USD)" min="0" class="w-full">
          <button onclick="mintNFT()" class="btn btn-primary w-full">Mint</button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${nfts.map(n => `
          <div class="nft-card">
            <div class="bg-gradient-to-br from-purple-900 to-blue-900 h-28 flex items-center justify-center text-4xl">
              🎨
            </div>
            <div class="p-3">
              <div class="font-semibold text-sm truncate">${escHtml(n.name)}</div>
              <div class="text-gray-400 text-xs mb-2">by ${escHtml(n.owner_username || 'unknown')}</div>
              <div class="flex items-center justify-between">
                <div class="text-xs text-purple-400">$${fmtNum(n.price || 0)}</div>
                <button onclick="buyNFT(${n.id})" class="text-xs btn btn-primary py-1 px-2">Buy</button>
              </div>
            </div>
          </div>`).join('')}
        ${nfts.length === 0 ? '<div class="col-span-2 text-center text-gray-400 py-8">No NFTs yet</div>' : ''}
      </div>
    </div>`;
}

window.showMintNFT = () => document.getElementById('mint-form')?.classList.remove('hidden');
window.mintNFT = async function() {
  const name = document.getElementById('nft-name')?.value?.trim();
  const description = document.getElementById('nft-desc')?.value?.trim();
  const price = parseFloat(document.getElementById('nft-price')?.value) || 0;
  if (!name) return toast('Enter a name', 'error');
  try {
    await api('POST', '/nfts/mint', { name, description, price });
    toast('NFT minted!', 'success');
    renderNFTs(document.querySelector('.page-content'));
  } catch (e) { toast(e.message, 'error'); }
};
window.buyNFT = async function(nftId) {
  if (!confirm('Buy this NFT?')) return;
  try {
    await api('POST', '/nfts/buy', { nft_id: nftId });
    toast('NFT purchased!', 'success');
    renderNFTs(document.querySelector('.page-content'));
  } catch (e) { toast(e.message, 'error'); }
};

// ── Init ──────────────────────────────────────────────────────────────────────
window.navigate = navigate;

const initPath = window.location.pathname;
render(initPath && initPath !== '/' ? initPath : '/home');
