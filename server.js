// Veya — Main Server
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { pool } = require('./lib/db');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const IS_STAGING = process.env.USERNODE_ENV === 'staging';

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(helmet({ frameguard: false, crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: ['https://social-vibecoding.usernodelabs.org', /localhost/], credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.set('trust proxy', 1);

const mkLimiter = (max) => rateLimit({
  windowMs: 60000, max,
  keyGenerator: (req) => String(req.user ? req.user.id : req.ip),
  standardHeaders: true, legacyHeaders: false,
});

app.use(mkLimiter(100));
const financialLimiter = mkLimiter(10);
const postLimiter = mkLimiter(5);
const verifyLimiter = mkLimiter(3);

// ─── Auth Middleware ──────────────────────────────────────────────────────────

const PUBLIC_API_PATHS = new Set(['/health']);
const PUBLIC_PREFIXES = ['/explorer-api/'];

app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_SECRET) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (PUBLIC_PREFIXES.some((p) => req.path.startsWith(p))) return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

app.use(async (req, res, next) => {
  if (req.user) {
    try {
      await pool.query(
        `INSERT INTO user_profiles (user_id, username, created_at, updated_at)
         VALUES ($1,$2,NOW(),NOW()) ON CONFLICT (user_id) DO UPDATE SET username=EXCLUDED.username, updated_at=NOW()`,
        [req.user.id, req.user.username]
      );
    } catch {}
  }
  next();
});

// ─── Rate limiters on app.locals for routes ───────────────────────────────────
app.locals.financialLimiter = financialLimiter;
app.locals.postLimiter = postLimiter;
app.locals.verifyLimiter = verifyLimiter;

// ─── Health & Static ─────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'veya' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ──────────────────────────────────────────────────────────────

app.use('/api', require('./routes/user'));
app.use('/api', require('./routes/social'));
app.use('/api', require('./routes/verify'));
app.use('/api', require('./routes/trade'));
app.use('/api', require('./routes/futures'));
app.use('/api', require('./routes/earn'));
app.use('/api', require('./routes/markets'));
app.use('/api', require('./routes/nfts'));

// ─── Admin ────────────────────────────────────────────────────────────────────

app.use('/admin', require('./routes/admin'));

// ─── SPA Catch-all ───────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  if (!req.user) {
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Usernode</title>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Usernode</h1>
    <p style="color:#a1a1aa;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="https://social-vibecoding.usernodelabs.org" style="display:inline-block;padding:0.5rem 1rem;background:#7c3aed;color:white;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Go to Usernode</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Database Schema ─────────────────────────────────────────────────────────

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY, username VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255), bio TEXT, avatar_url VARCHAR(512),
      verification_tier SMALLINT DEFAULT 0, is_admin BOOLEAN DEFAULT FALSE,
      is_banned BOOLEAN DEFAULT FALSE, is_verified BOOLEAN DEFAULT FALSE,
      veya_balance NUMERIC(20,8) DEFAULT 0,
      follower_count INTEGER DEFAULT 0, following_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_verifications (
      id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL,
      anti_sybil_token VARCHAR(512) UNIQUE, social_provider VARCHAR(64),
      social_verified_at TIMESTAMPTZ, zkpassport_identifier VARCHAR(512) UNIQUE,
      zkpassport_age_verified BOOLEAN DEFAULT FALSE, zkpassport_verified_at TIMESTAMPTZ,
      admin_granted_by INTEGER, admin_granted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS zkpassport_requests (
      request_id VARCHAR(255) PRIMARY KEY, user_id INTEGER NOT NULL,
      status VARCHAR(32) DEFAULT 'pending', result_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY, user_id INTEGER, username VARCHAR(255),
      action VARCHAR(255) NOT NULL, entity_type VARCHAR(128), entity_id VARCHAR(255),
      metadata JSONB, ip_addr VARCHAR(64), created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key VARCHAR(255) PRIMARY KEY, user_id INTEGER NOT NULL,
      result JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_config (
      key VARCHAR(255) PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS broadcast_notifications (
      id SERIAL PRIMARY KEY, target_user_id INTEGER, title VARCHAR(255), message TEXT,
      scheduled_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, username VARCHAR(255) NOT NULL,
      content VARCHAR(320) NOT NULL, reply_to_id INTEGER, poll_id INTEGER, market_id INTEGER,
      reaction_count INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reactions (
      id SERIAL PRIMARY KEY, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      type VARCHAR(32) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, user_id, type)
    );
    CREATE TABLE IF NOT EXISTS replies (
      id SERIAL PRIMARY KEY, parent_post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL, username VARCHAR(255) NOT NULL,
      content VARCHAR(320) NOT NULL, reaction_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY, follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL,
      follower_username VARCHAR(255), following_username VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(follower_id, following_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, type VARCHAR(64),
      title VARCHAR(255), body TEXT, read BOOLEAN DEFAULT FALSE,
      entity_type VARCHAR(64), entity_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY, user_id INTEGER, username VARCHAR(255),
      question VARCHAR(320), options JSONB NOT NULL, total_votes INTEGER DEFAULT 0,
      closes_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS poll_votes (
      id SERIAL PRIMARY KEY, poll_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(poll_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS token_prices (
      symbol VARCHAR(32) PRIMARY KEY, name VARCHAR(128), price_usd NUMERIC(20,8),
      change_24h NUMERIC(10,4), high_24h NUMERIC(20,8), low_24h NUMERIC(20,8),
      volume_24h NUMERIC(20,2), market_cap NUMERIC(20,2),
      is_stock BOOLEAN DEFAULT FALSE, updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS nfts (
      id SERIAL PRIMARY KEY, token_id VARCHAR(255) UNIQUE, owner_id INTEGER NOT NULL,
      owner_username VARCHAR(255), name VARCHAR(255), description TEXT,
      image_url VARCHAR(512), price NUMERIC(20,8), tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS staking_pools (
      id SERIAL PRIMARY KEY, name VARCHAR(128) NOT NULL, token_symbol VARCHAR(32),
      apy NUMERIC(10,4) DEFAULT 0, total_staked NUMERIC(20,8) DEFAULT 0,
      min_stake NUMERIC(20,8) DEFAULT 1, lock_days INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS staking_positions (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, pool_id INTEGER NOT NULL,
      pool_name VARCHAR(128), amount_staked NUMERIC(20,8) NOT NULL,
      apy NUMERIC(10,4) DEFAULT 0, rewards_earned NUMERIC(20,8) DEFAULT 0,
      status VARCHAR(32) DEFAULT 'active', tx_hash VARCHAR(255) UNIQUE,
      unstaked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lp_pools (
      id SERIAL PRIMARY KEY, name VARCHAR(128) NOT NULL,
      token_a VARCHAR(32), token_b VARCHAR(32),
      tvl NUMERIC(20,2) DEFAULT 0, apy NUMERIC(10,4) DEFAULT 0,
      fee_rate NUMERIC(6,4) DEFAULT 0.3, total_lp_tokens NUMERIC(20,8) DEFAULT 1000,
      is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lp_positions (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, pool_id INTEGER NOT NULL,
      pool_name VARCHAR(128), lp_tokens NUMERIC(20,8) DEFAULT 0,
      amount_token_a NUMERIC(20,8), amount_token_b NUMERIC(20,8),
      tx_hash VARCHAR(255) UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS icos (
      id SERIAL PRIMARY KEY, name VARCHAR(255), symbol VARCHAR(32),
      description TEXT, token_price NUMERIC(20,8),
      hard_cap NUMERIC(20,2), amount_raised NUMERIC(20,2) DEFAULT 0,
      starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
      basic_cap NUMERIC(20,8), social_cap NUMERIC(20,8), premium_cap NUMERIC(20,8),
      status VARCHAR(32) DEFAULT 'upcoming', created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ico_participations (
      id SERIAL PRIMARY KEY, ico_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      username VARCHAR(255), amount NUMERIC(20,8), tx_hash VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(ico_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS stock_positions (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, symbol VARCHAR(32),
      quantity NUMERIC(20,8) DEFAULT 0, avg_entry_price NUMERIC(20,8),
      updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, symbol)
    );
    CREATE TABLE IF NOT EXISTS stock_trades (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, username VARCHAR(255),
      symbol VARCHAR(32), direction VARCHAR(8), quantity NUMERIC(20,8),
      price NUMERIC(20,8), tx_hash VARCHAR(255) UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS prediction_markets (
      id SERIAL PRIMARY KEY, creator_id INTEGER NOT NULL, creator_username VARCHAR(255),
      question VARCHAR(512) NOT NULL, description TEXT, category VARCHAR(64) DEFAULT 'general',
      yes_price NUMERIC(5,4) DEFAULT 0.5, no_price NUMERIC(5,4) DEFAULT 0.5,
      liquidity NUMERIC(20,8) DEFAULT 0,
      status VARCHAR(32) DEFAULT 'open', resolved_outcome VARCHAR(16),
      closes_at TIMESTAMPTZ NOT NULL, resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS market_positions (
      id SERIAL PRIMARY KEY, market_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      username VARCHAR(255), outcome VARCHAR(4) NOT NULL,
      yes_shares NUMERIC(20,8) DEFAULT 0, no_shares NUMERIC(20,8) DEFAULT 0,
      avg_cost NUMERIC(20,8) DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(market_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS market_comments (
      id SERIAL PRIMARY KEY, market_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      username VARCHAR(255), content VARCHAR(512), created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS market_price_history (
      id SERIAL PRIMARY KEY, market_id INTEGER NOT NULL, yes_probability NUMERIC(5,4),
      volume NUMERIC(20,8), recorded_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS futures_markets (
      symbol VARCHAR(32) PRIMARY KEY, name VARCHAR(128), base_currency VARCHAR(32),
      mark_price NUMERIC(20,8), index_price NUMERIC(20,8), change_24h NUMERIC(10,4) DEFAULT 0,
      funding_rate NUMERIC(10,8) DEFAULT 0.0001, funding_interval_hours INTEGER DEFAULT 8,
      open_interest NUMERIC(20,8) DEFAULT 0, volume_24h NUMERIC(20,8) DEFAULT 0,
      max_leverage INTEGER DEFAULT 20, is_active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS futures_candles (
      id SERIAL PRIMARY KEY, market_symbol VARCHAR(32) NOT NULL, interval VARCHAR(8) NOT NULL,
      time TIMESTAMPTZ, open NUMERIC(20,8), high NUMERIC(20,8),
      low NUMERIC(20,8), close NUMERIC(20,8), volume NUMERIC(20,8) DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_futures_candles ON futures_candles(market_symbol, interval, time);
    CREATE TABLE IF NOT EXISTS futures_positions (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, username VARCHAR(255),
      market_symbol VARCHAR(32) NOT NULL, side VARCHAR(8) NOT NULL, size NUMERIC(20,8),
      entry_price NUMERIC(20,8), mark_price NUMERIC(20,8), leverage INTEGER DEFAULT 1,
      margin NUMERIC(20,8), liquidation_price NUMERIC(20,8),
      unrealized_pnl NUMERIC(20,8) DEFAULT 0, realized_pnl NUMERIC(20,8) DEFAULT 0,
      status VARCHAR(16) DEFAULT 'open', order_type VARCHAR(16) DEFAULT 'market',
      is_paper_trade BOOLEAN DEFAULT TRUE,
      opened_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS futures_orders (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, username VARCHAR(255),
      market_symbol VARCHAR(32), order_type VARCHAR(16), side VARCHAR(8), size NUMERIC(20,8),
      price NUMERIC(20,8), trigger_price NUMERIC(20,8), status VARCHAR(16) DEFAULT 'pending',
      is_paper_trade BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS futures_trades (
      id SERIAL PRIMARY KEY, position_id INTEGER, user_id INTEGER NOT NULL,
      market_symbol VARCHAR(32), side VARCHAR(32), size NUMERIC(20,8),
      price NUMERIC(20,8), fee NUMERIC(20,8) DEFAULT 0,
      realized_pnl NUMERIC(20,8) DEFAULT 0, is_paper_trade BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS futures_funding_payments (
      id SERIAL PRIMARY KEY, position_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      market_symbol VARCHAR(32), rate NUMERIC(10,8), payment NUMERIC(20,8),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const privateTables = ['user_verifications','zkpassport_requests','audit_logs','idempotency_keys',
    'staking_positions','lp_positions','ico_participations','stock_positions','stock_trades',
    'market_positions','futures_positions','futures_orders','futures_trades','futures_funding_payments'];
  for (const t of privateTables) {
    await pool.query(`COMMENT ON TABLE ${t} IS 'staging:private'`).catch(() => {});
  }
}

// ─── App Config Init ─────────────────────────────────────────────────────────

async function initAppConfig() {
  const defaults = {
    futures_paper_enabled:'true', futures_live_enabled:'true',
    base_verify_enabled:'true', zkpassport_enabled:'true',
    ico_enabled:'true', nft_enabled:'true', stocks_enabled:'true',
    circuit_breaker_threshold:'0.20', futures_liquidation_threshold:'0.05',
    futures_warning_threshold:'0.10', futures_position_cap_per_user_per_market:'100000',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await pool.query(
      `INSERT INTO app_config (key,value,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }
}

// ─── Staging Seed Data ───────────────────────────────────────────────────────

async function seedStaging() {
  if (!IS_STAGING) return;
  console.log('Seeding staging data...');

  const users = [
    [-1001,'staging-demo-basic','Staging Demo Basic',0,false,false],
    [-1002,'staging-demo-social','Staging Demo Social',1,false,false],
    [-1003,'staging-demo-premium','Staging Demo Premium',2,false,true],
    [-1004,'staging-demo-admin','Staging Demo Admin',2,true,true],
  ];
  for (const [uid,uname,dname,tier,is_admin,is_verified] of users) {
    await pool.query(
      `INSERT INTO user_profiles (user_id,username,display_name,verification_tier,is_admin,is_verified,veya_balance,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,5000,NOW(),NOW()) ON CONFLICT (user_id) DO NOTHING`,
      [uid,uname,dname,tier,is_admin,is_verified]
    );
  }

  const tokens = [
    ['BTC','Bitcoin',67250,2.3,69000,65000,28000000000,1320000000000,false],
    ['ETH','Ethereum',3540,1.8,3620,3490,14000000000,425000000000,false],
    ['SOL','Solana',185,4.1,192,178,3200000000,80000000000,false],
    ['AVAX','Avalanche',38,-1.2,39.5,37,800000000,15000000000,false],
    ['ARB','Arbitrum',1.15,3.5,1.2,1.1,500000000,1500000000,false],
    ['MATIC','Polygon',0.92,-0.8,0.95,0.89,600000000,9000000000,false],
    ['DOGE','Dogecoin',0.18,5.2,0.19,0.17,1200000000,25000000000,false],
    ['UTK','Utrust',0.085,1.5,0.088,0.082,12000000,85000000,false],
    ['VEYA','Veya Token',1.0,0,1.02,0.98,500000,100000000,false],
    ['USDC','USD Coin',1.0,0.01,1.001,0.999,5000000000,32000000000,false],
    ['AAPL','Apple Inc.',189.5,0.8,191,187,0,0,true],
    ['TSLA','Tesla Inc.',245.3,-1.2,250,242,0,0,true],
    ['GOOGL','Alphabet Inc.',175.8,1.1,177,173,0,0,true],
    ['AMZN','Amazon Inc.',198.4,2.3,201,195,0,0,true],
    ['MSFT','Microsoft Corp.',415.2,0.5,417,413,0,0,true],
    ['NVDA','NVIDIA Corp.',875.6,3.7,890,855,0,0,true],
  ];
  for (const [symbol,name,price,change,high,low,volume,cap,is_stock] of tokens) {
    await pool.query(
      `INSERT INTO token_prices (symbol,name,price_usd,change_24h,high_24h,low_24h,volume_24h,market_cap,is_stock,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT (symbol) DO NOTHING`,
      [symbol,name,price,change,high,low,volume,cap,is_stock]
    );
  }

  const fmarkets = [
    ['BTC-PERP','Bitcoin Perpetual','BTC',67250,67200,2.3,0.0001,1200000000,800000000,100],
    ['ETH-PERP','Ethereum Perpetual','ETH',3540,3535,1.8,0.00015,650000000,420000000,50],
    ['SOL-PERP','Solana Perpetual','SOL',185,184.5,4.1,0.0002,180000000,95000000,20],
    ['AVAX-PERP','Avalanche Perpetual','AVAX',38,37.9,-1.2,-0.00005,45000000,28000000,20],
    ['ARB-PERP','Arbitrum Perpetual','ARB',1.15,1.148,3.5,0.0003,22000000,15000000,20],
    ['MATIC-PERP','Polygon Perpetual','MATIC',0.92,0.919,-0.8,-0.0001,18000000,12000000,20],
    ['DOGE-PERP','Dogecoin Perpetual','DOGE',0.18,0.1798,5.2,0.00025,35000000,22000000,10],
    ['VEYA-PERP','Veya Perpetual','VEYA',1.0,1.0,0.0,0.0001,5000000,3000000,10],
  ];
  for (const [sym,name,base,mark,idx,chg,rate,oi,vol,maxlev] of fmarkets) {
    await pool.query(
      `INSERT INTO futures_markets (symbol,name,base_currency,mark_price,index_price,change_24h,funding_rate,open_interest,volume_24h,max_leverage,is_active,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW()) ON CONFLICT (symbol) DO NOTHING`,
      [sym,name,base,mark,idx,chg,rate,oi,vol,maxlev]
    );
  }

  // Candles for each futures market
  const basePrices = {'BTC-PERP':67250,'ETH-PERP':3540,'SOL-PERP':185,'AVAX-PERP':38,'ARB-PERP':1.15,'MATIC-PERP':0.92,'DOGE-PERP':0.18,'VEYA-PERP':1.0};
  for (const [sym, base] of Object.entries(basePrices)) {
    const existing = await pool.query('SELECT COUNT(*) FROM futures_candles WHERE market_symbol=$1 AND interval=$2',[sym,'15m']);
    if (parseInt(existing.rows[0].count) >= 30) continue;
    let p = base * 0.97;
    for (let i = 29; i >= 0; i--) {
      const chg = (Math.random()-0.48)*0.015;
      const o = p, c = p*(1+chg);
      const h = Math.max(o,c)*(1+Math.random()*0.005);
      const l = Math.min(o,c)*(1-Math.random()*0.005);
      const t = new Date(Date.now()-i*900000).toISOString();
      await pool.query(
        `INSERT INTO futures_candles (market_symbol,interval,time,open,high,low,close,volume)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sym,'15m',t,o.toFixed(4),h.toFixed(4),l.toFixed(4),c.toFixed(4),(Math.random()*1000+100).toFixed(2)]
      );
      p = c;
    }
  }

  const postRows = [
    [90001,-1001,'staging-demo-basic','Staging demo post: Just opened a 5x BTC-PERP long position! The funding rate is very favorable right now 🚀'],
    [90002,-1002,'staging-demo-social','Staging demo post: The VEYA prediction market "Will ETH hit $5k?" just hit 70% YES probability. Great entry point!'],
    [90003,-1003,'staging-demo-premium','Staging demo post: Staking VEYA at 8% APY while trading futures — passive income stacking up 💰'],
    [90004,-1002,'staging-demo-social','Staging demo post: Paper trading is the best way to practice futures before going live. Start there!'],
    [90005,-1003,'staging-demo-premium','Staging demo post: New ICO launching next week — SDEMO token at $0.01. Premium allocation is 2000 tokens!'],
  ];
  for (const [id,uid,uname,content] of postRows) {
    await pool.query(
      `INSERT INTO posts (id,user_id,username,content,created_at) VALUES ($1,$2,$3,$4,NOW()-INTERVAL '${id-90000} hours') ON CONFLICT (id) DO NOTHING`,
      [id,uid,uname,content]
    );
  }

  await pool.query(
    `INSERT INTO follows (follower_id,following_id,follower_username,following_username)
     VALUES (-1001,-1002,'staging-demo-basic','staging-demo-social'),
            (-1001,-1003,'staging-demo-basic','staging-demo-premium'),
            (-1002,-1003,'staging-demo-social','staging-demo-premium')
     ON CONFLICT (follower_id,following_id) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO nfts (id,token_id,owner_id,owner_username,name,description,price,tx_hash,created_at)
     VALUES (90001,'staging-nft-001',-1003,'staging-demo-premium','Staging Demo NFT #1','A beautiful staging demo collectible',0.5,'0xstagingnft001',NOW()),
            (90002,'staging-nft-002',-1003,'staging-demo-premium','Staging Demo NFT #2','Rare staging demo artwork',1.2,'0xstagingnft002',NOW())
     ON CONFLICT (id) DO NOTHING`
  );

  // Staking pools
  await pool.query(
    `INSERT INTO staking_pools (id,name,token_symbol,apy,total_staked,min_stake,lock_days,is_active)
     VALUES (90001,'VEYA Staking Pool','VEYA',8.5,50000,10,0,TRUE),
            (90002,'USDC Stable Yield','USDC',5.2,200000,100,7,TRUE),
            (90003,'ETH Liquid Staking','ETH',4.1,500,0.01,0,TRUE)
     ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO staking_positions (id,user_id,pool_id,pool_name,amount_staked,apy,status,tx_hash,created_at)
     VALUES (90001,-1003,90001,'VEYA Staking Pool',1000,8.5,'active','0xstake001',NOW()-INTERVAL '10 days'),
            (90002,-1003,90002,'USDC Stable Yield',500,5.2,'active','0xstake002',NOW()-INTERVAL '5 days')
     ON CONFLICT (id) DO NOTHING`
  );

  // LP pools
  await pool.query(
    `INSERT INTO lp_pools (id,name,token_a,token_b,tvl,apy,fee_rate,total_lp_tokens,is_active)
     VALUES (90001,'ETH/USDC Pool','ETH','USDC',1200000,12.3,0.3,100000,TRUE),
            (90002,'BTC/ETH Pool','BTC','ETH',800000,8.7,0.3,50000,TRUE),
            (90003,'VEYA/USDC Pool','VEYA','USDC',50000,25.0,1.0,10000,TRUE)
     ON CONFLICT (id) DO NOTHING`
  );

  const now = new Date();
  await pool.query(
    `INSERT INTO icos (id,name,symbol,description,token_price,hard_cap,amount_raised,starts_at,ends_at,basic_cap,social_cap,premium_cap,status,created_by)
     VALUES (90001,'Staging Demo ICO Active','SDEMO','Staging demo — a next-gen DeFi protocol',0.01,500000,125000,$1,$2,100,500,2000,'active',-1004),
            (90002,'Staging Demo ICO Upcoming','SFUT','Staging demo — synthetic futures token',0.05,200000,0,$3,$4,50,250,1000,'upcoming',-1004),
            (90003,'Staging Demo ICO Completed','SOLD','Staging demo — completed sale',0.001,100000,100000,$5,$6,200,1000,5000,'completed',-1004)
     ON CONFLICT (id) DO NOTHING`,
    [
      new Date(now-7*86400000).toISOString(), new Date(now+7*86400000).toISOString(),
      new Date(now+7*86400000).toISOString(), new Date(now+21*86400000).toISOString(),
      new Date(now-30*86400000).toISOString(), new Date(now-2*86400000).toISOString(),
    ]
  );

  await pool.query(
    `INSERT INTO polls (id,user_id,username,question,options,total_votes,closes_at,created_at)
     VALUES
       (90001,-1002,'staging-demo-social','Staging demo: Which chain will outperform in Q4?','[{"id":1,"text":"Ethereum","vote_count":45},{"id":2,"text":"Solana","vote_count":32},{"id":3,"text":"Base","vote_count":23}]',100,NOW()+INTERVAL '7 days',NOW()),
       (90002,-1002,'staging-demo-social','Staging demo: Best futures leverage for beginners?','[{"id":1,"text":"2x","vote_count":60},{"id":2,"text":"5x","vote_count":28},{"id":3,"text":"10x","vote_count":12}]',100,NOW()+INTERVAL '3 days',NOW()),
       (90003,-1003,'staging-demo-premium','Staging demo: Will BTC break $75k in 2024?','[{"id":1,"text":"Yes","vote_count":72},{"id":2,"text":"No","vote_count":28}]',100,NOW()+INTERVAL '14 days',NOW())
     ON CONFLICT (id) DO NOTHING`
  );

  const mqs = [
    [90001,'Staging demo: Will BTC reach $100k by end of 2024?',0.62],
    [90002,'Staging demo: Will ETH flip BTC by market cap in 2025?',0.35],
    [90003,'Staging demo: Will the Fed cut rates in Q4 2024?',0.48],
    [90004,'Staging demo: Will Solana overtake Ethereum in daily DEX volume?',0.41],
    [90005,'Staging demo: Will VEYA token hit $5 within 6 months?',0.57],
  ];
  for (const [id,q,prob] of mqs) {
    const liquidity = (100+Math.random()*400*2).toFixed(2);
    await pool.query(
      `INSERT INTO prediction_markets (id,creator_id,creator_username,question,yes_price,no_price,liquidity,status,closes_at,created_at)
       VALUES ($1,-1002,'staging-demo-social',$2,$3,$4,$5,'open',NOW()+INTERVAL '30 days',NOW()-INTERVAL '${id-90000} days') ON CONFLICT (id) DO NOTHING`,
      [id,q,prob.toFixed(4),(1-prob).toFixed(4),liquidity]
    );
  }

  for (const [mid,,baseProb] of mqs) {
    const existing = await pool.query('SELECT COUNT(*) FROM market_price_history WHERE market_id=$1',[mid]);
    if (parseInt(existing.rows[0].count) >= 30) continue;
    let prob = baseProb-0.15;
    for (let i=29; i>=0; i--) {
      prob = Math.max(0.05,Math.min(0.95,prob+(Math.random()-0.48)*0.02));
      await pool.query(
        `INSERT INTO market_price_history (market_id,yes_probability,volume,recorded_at) VALUES ($1,$2,$3,NOW()-INTERVAL '${i} hours')`,
        [mid,prob.toFixed(4),(Math.random()*100+10).toFixed(2)]
      );
    }
  }

  await pool.query(
    `INSERT INTO market_positions (id,market_id,user_id,username,outcome,yes_shares,no_shares,avg_cost)
     VALUES (90001,90001,-1002,'staging-demo-social','yes',100,0,62),
            (90002,90001,-1003,'staging-demo-premium','no',0,80,30.4)
     ON CONFLICT (id) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO futures_positions (id,user_id,market_symbol,side,size,entry_price,mark_price,leverage,margin,liquidation_price,unrealized_pnl,status,is_paper_trade,opened_at)
     VALUES
       (90001,-1001,'BTC-PERP','long',0.1,66800,67250,5,1336,59920,45,'open',TRUE,NOW()-INTERVAL '2 hours'),
       (90002,-1002,'ETH-PERP','short',1,3600,3540,10,360,3960,-60,'open',TRUE,NOW()-INTERVAL '1 hour'),
       (90003,-1003,'SOL-PERP','long',10,178,185,20,89,169.1,70,'open',TRUE,NOW()-INTERVAL '30 minutes'),
       (90004,-1002,'BTC-PERP','long',0.05,65000,67250,10,325,58500,112.5,'open',FALSE,NOW()-INTERVAL '5 hours'),
       (90005,-1003,'ETH-PERP','long',2,3400,3540,25,272,3264,280,'open',FALSE,NOW()-INTERVAL '3 hours')
     ON CONFLICT (id) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO futures_trades (id,user_id,market_symbol,side,size,price,fee,realized_pnl,is_paper_trade,created_at)
     VALUES
       (90001,-1002,'BTC-PERP','close_long',0.2,67000,6,600,TRUE,NOW()-INTERVAL '1 day'),
       (90002,-1003,'ETH-PERP','close_short',1,3540,7,260,TRUE,NOW()-INTERVAL '2 days'),
       (90003,-1001,'SOL-PERP','close_long',5,185,4,75,TRUE,NOW()-INTERVAL '12 hours'),
       (90004,-1002,'DOGE-PERP','close_long',1000,0.18,2,30,TRUE,NOW()-INTERVAL '3 days'),
       (90005,-1003,'AVAX-PERP','close_short',10,38,5,40,TRUE,NOW()-INTERVAL '2 days')
     ON CONFLICT (id) DO NOTHING`
  );

  console.log('Staging data seeded.');
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  await createSchema();
  await initAppConfig();
  await seedStaging();
  require('./jobs').start(pool);
  app.listen(port, () => console.log(`Veya listening on :${port}`));
}

start().catch(err => { console.error(err); process.exit(1); });
