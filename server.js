'use strict';
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { pool } = require('./lib/db');

const app = express();
const IS_STAGING = process.env.USERNODE_ENV === 'staging';
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ frameguard: false, crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: 'https://social-vibecoding.usernodelabs.org' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ── Rate limiters ────────────────────────────────────────────────────────────
const rl = (max) => rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => String(req.user?.id || req.ip) });
const globalLimiter = rl(100);
const financialLimiter = rl(10);
const postLimiter = rl(5);
const verifyLimiter = rl(3);
app.use(globalLimiter);

// ── Auth middleware ──────────────────────────────────────────────────────────
const PUBLIC_API_PATHS = new Set(['/health']);
const PUBLIC_PREFIXES = ['/explorer-api/'];

app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_SECRET) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (PUBLIC_PREFIXES.some(p => req.path.startsWith(p))) return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

// ── Profile upsert on every auth'd request ───────────────────────────────────
app.use(async (req, res, next) => {
  if (!req.user) return next();
  try {
    await pool.query(
      `INSERT INTO user_profiles (user_id, username, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, updated_at = NOW()`,
      [req.user.id, req.user.username]
    );
  } catch {}
  next();
});

// ── Static files (before routes so /public serves index.html) ────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ───────────────────────────────────────────────────────────────────
const apiRouter = express.Router();
apiRouter.use('/user', require('./routes/user'));
apiRouter.use('/', require('./routes/social'));
apiRouter.use('/', require('./routes/verify'));
apiRouter.use('/', require('./routes/trade'));
apiRouter.use('/', require('./routes/futures'));
apiRouter.use('/', require('./routes/earn'));
apiRouter.use('/', require('./routes/markets'));
apiRouter.use('/', require('./routes/nfts'));

// Rate limit financial paths
apiRouter.use(['/swap', '/staking', '/lp', '/ico', '/markets/:id/trade', '/nfts/mint', '/nfts/buy', '/stocks/trade'], financialLimiter);
apiRouter.use('/futures/orders', financialLimiter);
apiRouter.use('/futures/positions', financialLimiter);
apiRouter.use((req, res, next) => {
  if (req.method === 'POST' && (req.path === '/posts' || req.path.match(/^\/posts\/\d+\/reply$/))) {
    return postLimiter(req, res, next);
  }
  if (req.path.startsWith('/verify')) return verifyLimiter(req, res, next);
  next();
});

app.use('/api', apiRouter);
app.use('/admin', require('./routes/admin'));

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Explorer API proxy pass-through ──────────────────────────────────────────
app.use('/explorer-api/', (req, res) => res.status(502).json({ error: 'Explorer not available' }));

// ── SPA catch-all ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.user) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.status(401).send(`<!DOCTYPE html><html><head><title>Veya</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;background:#0f0f0f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:2rem}.logo{font-size:2.5rem;font-weight:900;color:#3b82f6;letter-spacing:-1px}
p{color:#9ca3af;margin:1rem 0}a{color:#3b82f6;text-decoration:none;font-weight:600}</style></head>
<body><div class="box"><div class="logo">Veya</div>
<p>Wallet-first onchain social + DeFi + futures trading.</p>
<a href="https://social-vibecoding.usernodelabs.org">Open in Usernode →</a></div></body></html>`);
});

// ── DB Schema ────────────────────────────────────────────────────────────────
async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      bio TEXT,
      avatar_url VARCHAR(512),
      verification_tier SMALLINT DEFAULT 0,
      is_admin BOOLEAN DEFAULT FALSE,
      is_banned BOOLEAN DEFAULT FALSE,
      is_verified BOOLEAN DEFAULT FALSE,
      veya_balance NUMERIC(20,8) DEFAULT 0,
      follower_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_verifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      anti_sybil_token VARCHAR(512) UNIQUE,
      social_provider VARCHAR(64),
      social_verified_at TIMESTAMPTZ,
      zkpassport_identifier VARCHAR(512) UNIQUE,
      zkpassport_age_verified BOOLEAN DEFAULT FALSE,
      zkpassport_verified_at TIMESTAMPTZ,
      admin_granted_by INTEGER,
      admin_granted_at TIMESTAMPTZ
    );
    COMMENT ON TABLE user_verifications IS 'staging:private';

    CREATE TABLE IF NOT EXISTS zkpassport_requests (
      request_id VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL,
      status VARCHAR(32) DEFAULT 'pending',
      result_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE zkpassport_requests IS 'staging:private';

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(255),
      action VARCHAR(255) NOT NULL,
      entity_type VARCHAR(128),
      entity_id VARCHAR(255),
      metadata JSONB,
      ip_addr VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE audit_logs IS 'staging:private';

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key VARCHAR(255) PRIMARY KEY,
      user_id INTEGER NOT NULL,
      result JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idempotency_created_idx ON idempotency_keys(created_at);
    COMMENT ON TABLE idempotency_keys IS 'staging:private';

    CREATE TABLE IF NOT EXISTS app_config (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS broadcast_notifications (
      id SERIAL PRIMARY KEY,
      target_user_id INTEGER,
      title VARCHAR(255),
      message TEXT,
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255) NOT NULL,
      content VARCHAR(320) NOT NULL,
      reply_to_id INTEGER,
      poll_id INTEGER,
      market_id INTEGER,
      reaction_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, user_id, type)
    );

    CREATE TABLE IF NOT EXISTS replies (
      id SERIAL PRIMARY KEY,
      parent_post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username VARCHAR(255) NOT NULL,
      content VARCHAR(320) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type VARCHAR(64),
      title VARCHAR(255),
      body TEXT,
      read BOOLEAN DEFAULT FALSE,
      entity_type VARCHAR(64),
      entity_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(255),
      question VARCHAR(320),
      options JSONB NOT NULL,
      total_votes INTEGER DEFAULT 0,
      closes_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id SERIAL PRIMARY KEY,
      poll_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(poll_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS token_prices (
      symbol VARCHAR(32) PRIMARY KEY,
      name VARCHAR(128),
      price_usd NUMERIC(20,8),
      price_change_24h NUMERIC(10,4),
      volume_24h NUMERIC(20,2),
      market_cap NUMERIC(20,2),
      is_stock BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS nfts (
      id SERIAL PRIMARY KEY,
      token_id VARCHAR(255) UNIQUE,
      owner_id INTEGER NOT NULL,
      owner_username VARCHAR(255),
      name VARCHAR(255),
      description TEXT,
      image_url VARCHAR(512),
      price NUMERIC(20,8),
      tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS staking_positions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      pool_id VARCHAR(64) NOT NULL,
      amount NUMERIC(20,8) NOT NULL,
      rewards_claimed NUMERIC(20,8) DEFAULT 0,
      unstake_requested_at TIMESTAMPTZ,
      tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE staking_positions IS 'staging:private';

    CREATE TABLE IF NOT EXISTS lp_positions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      pool_id VARCHAR(64) NOT NULL,
      token_a VARCHAR(32),
      token_b VARCHAR(32),
      amount_a NUMERIC(20,8),
      amount_b NUMERIC(20,8),
      lp_tokens NUMERIC(20,8),
      tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE lp_positions IS 'staging:private';

    CREATE TABLE IF NOT EXISTS icos (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      symbol VARCHAR(32),
      token_price NUMERIC(20,8),
      total_raise NUMERIC(20,2),
      raised NUMERIC(20,2) DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      basic_cap NUMERIC(20,8),
      social_cap NUMERIC(20,8),
      premium_cap NUMERIC(20,8),
      description TEXT,
      status VARCHAR(32) DEFAULT 'upcoming',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ico_participations (
      id SERIAL PRIMARY KEY,
      ico_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      amount NUMERIC(20,8),
      tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(ico_id, user_id)
    );
    COMMENT ON TABLE ico_participations IS 'staging:private';

    CREATE TABLE IF NOT EXISTS stock_positions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      symbol VARCHAR(32),
      quantity NUMERIC(20,8),
      avg_entry_price NUMERIC(20,8),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE stock_positions IS 'staging:private';

    CREATE TABLE IF NOT EXISTS stock_trades (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      symbol VARCHAR(32),
      direction VARCHAR(8),
      quantity NUMERIC(20,8),
      price NUMERIC(20,8),
      tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE stock_trades IS 'staging:private';

    CREATE TABLE IF NOT EXISTS markets (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL,
      creator_username VARCHAR(255),
      question VARCHAR(512) NOT NULL,
      description TEXT,
      category VARCHAR(64) DEFAULT 'general',
      yes_probability NUMERIC(5,4) DEFAULT 0.5,
      yes_pool NUMERIC(20,8) DEFAULT 100,
      no_pool NUMERIC(20,8) DEFAULT 100,
      volume NUMERIC(20,8) DEFAULT 0,
      liquidity NUMERIC(20,8) DEFAULT 200,
      status VARCHAR(32) DEFAULT 'pending',
      resolved_outcome VARCHAR(16),
      approved_by_admin INTEGER,
      circuit_breaker_until TIMESTAMPTZ,
      closes_at TIMESTAMPTZ NOT NULL,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS market_positions (
      id SERIAL PRIMARY KEY,
      market_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      side VARCHAR(4) NOT NULL,
      shares NUMERIC(20,8) DEFAULT 0,
      avg_price NUMERIC(10,6) DEFAULT 0,
      realized_pnl NUMERIC(20,8) DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(market_id, user_id, side)
    );
    COMMENT ON TABLE market_positions IS 'staging:private';

    CREATE TABLE IF NOT EXISTS market_trades (
      id SERIAL PRIMARY KEY,
      market_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      side VARCHAR(4),
      shares NUMERIC(20,8),
      price NUMERIC(10,6),
      amount NUMERIC(20,8),
      tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE market_trades IS 'staging:private';

    CREATE TABLE IF NOT EXISTS market_comments (
      id SERIAL PRIMARY KEY,
      market_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      content VARCHAR(512),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS market_price_history (
      id SERIAL PRIMARY KEY,
      market_id INTEGER NOT NULL,
      yes_probability NUMERIC(5,4),
      volume NUMERIC(20,8),
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS futures_markets (
      symbol VARCHAR(32) PRIMARY KEY,
      name VARCHAR(128),
      mark_price NUMERIC(20,8),
      index_price NUMERIC(20,8),
      funding_rate NUMERIC(10,8) DEFAULT 0,
      funding_interval_hours INTEGER DEFAULT 8,
      open_interest NUMERIC(20,8) DEFAULT 0,
      volume_24h NUMERIC(20,8) DEFAULT 0,
      change_24h NUMERIC(10,4) DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      base_currency VARCHAR(32),
      max_leverage INTEGER DEFAULT 50,
      paused BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS futures_candles (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(32) NOT NULL,
      timeframe VARCHAR(8) NOT NULL,
      open_time TIMESTAMPTZ,
      open NUMERIC(20,8),
      high NUMERIC(20,8),
      low NUMERIC(20,8),
      close NUMERIC(20,8),
      volume NUMERIC(20,8)
    );
    CREATE INDEX IF NOT EXISTS futures_candles_idx ON futures_candles(symbol, timeframe, open_time);

    CREATE TABLE IF NOT EXISTS futures_positions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      symbol VARCHAR(32) NOT NULL,
      direction VARCHAR(8) NOT NULL,
      size NUMERIC(20,8),
      entry_price NUMERIC(20,8),
      mark_price NUMERIC(20,8),
      leverage INTEGER,
      margin_mode VARCHAR(16) DEFAULT 'cross',
      margin NUMERIC(20,8),
      liquidation_price NUMERIC(20,8),
      take_profit NUMERIC(20,8),
      stop_loss NUMERIC(20,8),
      unrealized_pnl NUMERIC(20,8) DEFAULT 0,
      realized_pnl NUMERIC(20,8) DEFAULT 0,
      status VARCHAR(16) DEFAULT 'open',
      mode VARCHAR(8) NOT NULL DEFAULT 'paper',
      tx_hash VARCHAR(255) UNIQUE,
      opened_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );
    COMMENT ON TABLE futures_positions IS 'staging:private';

    CREATE TABLE IF NOT EXISTS futures_orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      symbol VARCHAR(32),
      type VARCHAR(16),
      direction VARCHAR(8),
      size NUMERIC(20,8),
      price NUMERIC(20,8),
      trigger_price NUMERIC(20,8),
      status VARCHAR(16) DEFAULT 'pending',
      mode VARCHAR(8),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE futures_orders IS 'staging:private';

    CREATE TABLE IF NOT EXISTS futures_trades (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255),
      symbol VARCHAR(32),
      direction VARCHAR(8),
      size NUMERIC(20,8),
      entry_price NUMERIC(20,8),
      exit_price NUMERIC(20,8),
      realized_pnl NUMERIC(20,8),
      fees NUMERIC(20,8),
      mode VARCHAR(8),
      tx_hash VARCHAR(255) UNIQUE,
      opened_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE futures_trades IS 'staging:private';

    CREATE TABLE IF NOT EXISTS futures_liquidations (
      id SERIAL PRIMARY KEY,
      position_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      symbol VARCHAR(32),
      size NUMERIC(20,8),
      entry_price NUMERIC(20,8),
      liquidation_price NUMERIC(20,8),
      loss NUMERIC(20,8),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE futures_liquidations IS 'staging:private';

    CREATE TABLE IF NOT EXISTS futures_funding_payments (
      id SERIAL PRIMARY KEY,
      position_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      symbol VARCHAR(32),
      rate NUMERIC(10,8),
      payment NUMERIC(20,8),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    COMMENT ON TABLE futures_funding_payments IS 'staging:private';
  `);
}

// ── App config seed ───────────────────────────────────────────────────────────
async function initAppConfig() {
  const configs = [
    ['futures_paper_enabled', 'true'],
    ['futures_live_enabled', 'true'],
    ['base_verify_enabled', 'true'],
    ['zkpassport_enabled', 'true'],
    ['ico_enabled', 'true'],
    ['nft_enabled', 'true'],
    ['stocks_enabled', 'true'],
    ['circuit_breaker_threshold', '0.20'],
    ['futures_liquidation_threshold', '0.05'],
    ['futures_warning_threshold', '0.10'],
    ['futures_position_cap_per_user_per_market', '100000'],
  ];
  for (const [key, value] of configs) {
    await pool.query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
}

// ── Staging seed data ─────────────────────────────────────────────────────────
async function seedStaging() {
  if (!IS_STAGING) return;

  // Demo users
  for (const [id, username, display_name, tier, is_admin, is_verified] of [
    [-1001, 'staging-demo-basic', 'Demo Basic User', 0, false, false],
    [-1002, 'staging-demo-social', 'Demo Social User', 1, false, false],
    [-1003, 'staging-demo-premium', 'Demo Premium User', 2, false, true],
    [-1004, 'staging-demo-admin', 'Demo Admin User', 2, true, true],
  ]) {
    await pool.query(
      `INSERT INTO user_profiles (user_id, username, display_name, verification_tier, is_admin, is_verified, veya_balance)
       VALUES ($1,$2,$3,$4,$5,$6,5000) ON CONFLICT (user_id) DO NOTHING`,
      [id, username, display_name, tier, is_admin, is_verified]
    );
  }

  // Token prices
  for (const [sym, name, price, chg, vol, cap, stock] of [
    ['BTC','Bitcoin',65420,2.34,28000000000,1290000000000,false],
    ['ETH','Ethereum',3180,1.56,14000000000,382000000000,false],
    ['SOL','Solana',142,-0.82,4500000000,64000000000,false],
    ['AVAX','Avalanche',37.5,3.21,800000000,15000000000,false],
    ['ARB','Arbitrum',1.12,-1.45,600000000,4500000000,false],
    ['MATIC','Polygon',0.87,0.91,500000000,8000000000,false],
    ['DOGE','Dogecoin',0.148,4.32,2000000000,21000000000,false],
    ['UTK','Utrust',0.045,1.23,20000000,45000000,false],
    ['VEYA','Veya',1.00,0.00,5000000,100000000,false],
    ['USDC','USD Coin',1.00,0.01,8000000000,43000000000,false],
    ['AAPL','Apple Inc',189.5,0.82,5000000000,2930000000000,true],
    ['TSLA','Tesla Inc',248.3,-1.24,2100000000,790000000000,true],
    ['GOOGL','Alphabet Inc',175.8,0.45,1800000000,2180000000000,true],
    ['AMZN','Amazon Inc',186.4,1.02,2200000000,1940000000000,true],
    ['MSFT','Microsoft Corp',420.6,0.68,1900000000,3120000000000,true],
    ['NVDA','NVIDIA Corp',875.4,2.14,3400000000,2150000000000,true],
  ]) {
    await pool.query(
      `INSERT INTO token_prices (symbol, name, price_usd, price_change_24h, volume_24h, market_cap, is_stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (symbol) DO NOTHING`,
      [sym, name, price, chg, vol, cap, stock]
    );
  }

  // Futures markets
  for (const [sym, name, mark, idx, rate, vol, oi, chg, base, maxlev] of [
    ['BTC-PERP','Bitcoin Perpetual',65420,65400,0.0001,28000000,500000000,2.34,'BTC',50],
    ['ETH-PERP','Ethereum Perpetual',3180,3175,-0.0002,14000000,200000000,1.56,'ETH',50],
    ['SOL-PERP','Solana Perpetual',142,141.8,0.0003,4500000,80000000,-0.82,'SOL',50],
    ['AVAX-PERP','Avalanche Perpetual',37.5,37.4,-0.0001,800000,15000000,3.21,'AVAX',20],
    ['ARB-PERP','Arbitrum Perpetual',1.12,1.11,0.0002,600000,8000000,-1.45,'ARB',20],
    ['MATIC-PERP','Polygon Perpetual',0.87,0.868,0.0001,500000,6000000,0.91,'MATIC',20],
    ['DOGE-PERP','Dogecoin Perpetual',0.148,0.147,-0.0003,2000000,12000000,4.32,'DOGE',20],
    ['VEYA-PERP','Veya Perpetual',1.00,1.00,0.0001,500000,2000000,0.00,'VEYA',10],
  ]) {
    await pool.query(
      `INSERT INTO futures_markets (symbol, name, mark_price, index_price, funding_rate, volume_24h, open_interest, change_24h, base_currency, max_leverage, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) ON CONFLICT (symbol) DO NOTHING`,
      [sym, name, mark, idx, rate, vol, oi, chg, base, maxlev]
    );
  }

  // Futures candles (30 per market, 1h)
  const futsMarkets = [
    ['BTC-PERP', 65420], ['ETH-PERP', 3180], ['SOL-PERP', 142], ['AVAX-PERP', 37.5],
    ['ARB-PERP', 1.12], ['MATIC-PERP', 0.87], ['DOGE-PERP', 0.148], ['VEYA-PERP', 1.00],
  ];
  for (const [sym, basePrice] of futsMarkets) {
    const existing = await pool.query('SELECT COUNT(*) FROM futures_candles WHERE symbol=$1 AND timeframe=$2', [sym, '1h']);
    if (parseInt(existing.rows[0].count) > 0) continue;
    let price = basePrice * 0.97;
    for (let i = 29; i >= 0; i--) {
      const openTime = new Date(Date.now() - i * 3600000);
      const chg = (Math.random() - 0.48) * basePrice * 0.015;
      const o = price;
      price += chg;
      const c = price;
      const h = Math.max(o, c) * (1 + Math.random() * 0.005);
      const l = Math.min(o, c) * (1 - Math.random() * 0.005);
      const v = basePrice * (50 + Math.random() * 200);
      await pool.query(
        `INSERT INTO futures_candles (symbol, timeframe, open_time, open, high, low, close, volume)
         VALUES ($1,'1h',$2,$3,$4,$5,$6,$7)`,
        [sym, openTime, o.toFixed(8), h.toFixed(8), l.toFixed(8), c.toFixed(8), v.toFixed(2)]
      );
    }
  }

  // Posts
  for (const [uid, uname, content] of [
    [-1001, 'staging-demo-basic', 'Staging demo: Just verified my wallet on Veya! Paper trading BTC-PERP futures — already up 23%. Who else is trading perps here? 🚀'],
    [-1002, 'staging-demo-social', 'Staging demo: Prediction market just opened — will ETH break $4k before month end? YES at 62%. I\'m buying YES! #DeFi'],
    [-1003, 'staging-demo-premium', 'Staging demo: zkPassport verified — 50x leverage unlocked on live futures. Just opened a 10x ETH-PERP long. Set your stop loss! 🥇'],
    [-1004, 'staging-demo-admin', 'Staging demo: Welcome to Veya! We combine social, DeFi, and futures trading in one platform. Paper trade first, go live when ready.'],
    [-1002, 'staging-demo-social', 'Staging demo: Staking pools are live! VEYA at 8% APY, USDC at 5%. Staked 1000 VEYA. Compound those gains! 💰'],
  ]) {
    await pool.query(
      `INSERT INTO posts (user_id, username, content) VALUES ($1,$2,$3)`,
      [uid, uname, content]
    );
  }

  // Follows
  await pool.query(`INSERT INTO follows (follower_id, following_id) VALUES (-1001,-1002) ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO follows (follower_id, following_id) VALUES (-1001,-1003) ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO follows (follower_id, following_id) VALUES (-1002,-1003) ON CONFLICT DO NOTHING`);

  // NFTs
  for (const [tid, name, desc, price, tx] of [
    ['staging-nft-001','Staging NFT #1','A rare staging collectible',0.5,'0xstagingnft001'],
    ['staging-nft-002','Staging NFT #2','Genesis Veya NFT',1.0,'0xstagingnft002'],
  ]) {
    await pool.query(
      `INSERT INTO nfts (token_id, owner_id, owner_username, name, description, price, tx_hash)
       VALUES ($1,-1003,'staging-demo-premium',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [tid, name, desc, price, tx]
    );
  }

  // Staking
  await pool.query(`INSERT INTO staking_positions (user_id,username,pool_id,amount,tx_hash) VALUES (-1003,'staging-demo-premium','veya-pool',1000,'0xstake001') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO staking_positions (user_id,username,pool_id,amount,tx_hash) VALUES (-1003,'staging-demo-premium','usdc-pool',500,'0xstake002') ON CONFLICT DO NOTHING`);

  // ICOs
  for (const [name, sym, price, total, raised, status, desc, bc, sc, pc, starts, ends] of [
    ['Staging Demo Token A','SDTA',0.05,500000,375000,'active','Staging active ICO — DeFi protocol',1000,5000,10000,new Date(Date.now()-7*86400000),new Date(Date.now()+14*86400000)],
    ['Staging Demo Token B','SDTB',0.10,200000,0,'upcoming','Staging upcoming ICO — NFT marketplace',500,2000,5000,new Date(Date.now()+7*86400000),new Date(Date.now()+30*86400000)],
    ['Staging Demo Token C','SDTC',0.02,100000,100000,'completed','Staging completed ICO — Social rewards',200,1000,2000,new Date(Date.now()-30*86400000),new Date(Date.now()-7*86400000)],
  ]) {
    await pool.query(
      `INSERT INTO icos (name,symbol,token_price,total_raise,raised,status,description,basic_cap,social_cap,premium_cap,starts_at,ends_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,-1004) ON CONFLICT DO NOTHING`,
      [name,sym,price,total,raised,status,desc,bc,sc,pc,starts,ends]
    );
  }

  // Polls
  for (const [uid, uname, q, opts, total] of [
    [-1002,'staging-demo-social','Which chain will dominate DeFi in 2025?',JSON.stringify([{id:1,text:'Ethereum',vote_count:45},{id:2,text:'Solana',vote_count:32},{id:3,text:'Base',vote_count:18}]),95],
    [-1002,'staging-demo-social','Best futures market to trade?',JSON.stringify([{id:1,text:'BTC-PERP',vote_count:67},{id:2,text:'ETH-PERP',vote_count:41},{id:3,text:'SOL-PERP',vote_count:29}]),137],
    [-1003,'staging-demo-premium','Paper trading before going live?',JSON.stringify([{id:1,text:'Always',vote_count:88},{id:2,text:'Sometimes',vote_count:34},{id:3,text:'Never',vote_count:12}]),134],
  ]) {
    await pool.query(
      `INSERT INTO polls (user_id,username,question,options,total_votes,closes_at)
       VALUES ($1,$2,$3,$4,$5,NOW()+INTERVAL'7 days')`,
      [uid,uname,q,opts,total]
    );
  }

  // Prediction markets
  for (const [question, prob, ypool, npool, vol, closes] of [
    ['Will BTC hit $100k before end of 2025?',0.62,6200,3800,1000,new Date(Date.now()+90*86400000)],
    ['Will ETH surpass BTC market cap in 2025?',0.28,2800,7200,500,new Date(Date.now()+120*86400000)],
    ['Will SOL reach $500 this cycle?',0.45,4500,5500,750,new Date(Date.now()+60*86400000)],
    ['Will a major exchange get hacked in Q3 2025?',0.18,1800,8200,300,new Date(Date.now()+30*86400000)],
    ['Will Ethereum ETF outperform BTC ETF in 2025?',0.41,4100,5900,600,new Date(Date.now()+45*86400000)],
  ]) {
    const { rows } = await pool.query(
      `INSERT INTO markets (creator_id,creator_username,question,yes_probability,yes_pool,no_pool,volume,status,approved_by_admin,closes_at)
       VALUES (-1004,'staging-demo-admin',$1,$2,$3,$4,$5,'active',-1004,$6) RETURNING id`,
      [question, prob, ypool, npool, vol, closes]
    );
    if (!rows[0]) continue;
    const mid = rows[0].id;
    let p = prob;
    for (let i = 29; i >= 0; i--) {
      const t = new Date(Date.now() - i * 7200000);
      p = Math.max(0.05, Math.min(0.95, p + (Math.random()-0.5)*0.05));
      await pool.query(`INSERT INTO market_price_history (market_id,yes_probability,volume,recorded_at) VALUES ($1,$2,$3,$4)`, [mid, p.toFixed(4), vol*Math.random(), t]);
    }
    await pool.query(`INSERT INTO market_positions (market_id,user_id,username,side,shares,avg_price) VALUES ($1,-1001,'staging-demo-basic','YES',100,$2) ON CONFLICT DO NOTHING`, [mid, prob.toFixed(6)]);
    await pool.query(`INSERT INTO market_positions (market_id,user_id,username,side,shares,avg_price) VALUES ($1,-1002,'staging-demo-social','NO',50,$2) ON CONFLICT DO NOTHING`, [mid, (1-prob).toFixed(6)]);
  }

  // Futures positions (paper)
  for (const [uid, uname, sym, dir, size, entry, lev, mmode, mode] of [
    [-1001,'staging-demo-basic','BTC-PERP','long',0.1,64000,5,'cross','paper'],
    [-1002,'staging-demo-social','ETH-PERP','short',1.0,3250,10,'cross','paper'],
    [-1003,'staging-demo-premium','SOL-PERP','long',10,138,3,'isolated','paper'],
  ]) {
    const mrow = await pool.query('SELECT mark_price FROM futures_markets WHERE symbol=$1', [sym]);
    const mark = parseFloat(mrow.rows[0]?.mark_price || entry);
    const margin = (size * entry) / lev;
    const liqP = dir === 'long' ? entry * (1 - 0.9/lev) : entry * (1 + 0.9/lev);
    const upnl = dir === 'long' ? (mark - entry)*size : (entry - mark)*size;
    await pool.query(
      `INSERT INTO futures_positions (user_id,username,symbol,direction,size,entry_price,mark_price,leverage,margin_mode,margin,liquidation_price,unrealized_pnl,status,mode,opened_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13,NOW()-INTERVAL'2 hours'
       WHERE NOT EXISTS (SELECT 1 FROM futures_positions WHERE user_id=$1 AND symbol=$3 AND mode=$13 AND status='open')`,
      [uid,uname,sym,dir,size,entry,mark,lev,mmode,margin.toFixed(8),liqP.toFixed(8),upnl.toFixed(8),mode]
    );
  }

  // Futures closed trades
  for (const [uid, uname, sym, dir, size, ep, xp, pnl, fees, mode] of [
    [-1001,'staging-demo-basic','BTC-PERP','long',0.1,62000,65000,300,65,'paper'],
    [-1002,'staging-demo-social','ETH-PERP','short',1.0,3400,3180,220,32,'paper'],
    [-1003,'staging-demo-premium','SOL-PERP','long',10,120,142,220,14,'paper'],
    [-1002,'staging-demo-social','BTC-PERP','long',0.05,61000,64000,150,32,'live'],
    [-1003,'staging-demo-premium','ETH-PERP','short',0.5,3500,3180,160,16,'live'],
  ]) {
    await pool.query(
      `INSERT INTO futures_trades (user_id,username,symbol,direction,size,entry_price,exit_price,realized_pnl,fees,mode,opened_at,closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()-INTERVAL'1 day',NOW()-INTERVAL'12 hours') ON CONFLICT DO NOTHING`,
      [uid,uname,sym,dir,size,ep,xp,pnl,fees,mode]
    );
  }

  console.log('[seed] Staging seed data applied');
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  await createSchema();
  await initAppConfig();
  await seedStaging();
  require('./jobs').start(pool);
  app.listen(PORT, () => console.log(`[veya] Listening on :${PORT} (env=${process.env.USERNODE_ENV || 'development'})`));
}

start().catch(err => { console.error('[startup]', err); process.exit(1); });
