'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireTier } = require('../lib/middleware');
const router = Router();

const ALLOWED_SYMBOLS = new Set(['BTC-PERP','ETH-PERP','SOL-PERP','AVAX-PERP','ARB-PERP','MATIC-PERP','DOGE-PERP','VEYA-PERP']);

router.get('/futures/markets', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM futures_markets WHERE is_active=TRUE ORDER BY volume_24h DESC NULLS LAST');
    res.json({ markets: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures/markets/:symbol', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM futures_markets WHERE symbol=$1', [req.params.symbol.toUpperCase()]);
    if (!rows[0]) return res.status(404).json({ error: 'Market not found' });
    res.json({ market: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures/markets/:symbol/candles', async (req, res) => {
  try {
    const sym = req.params.symbol.toUpperCase();
    const tf = ['1m','5m','15m','1h','4h','1d'].includes(req.query.timeframe) ? req.query.timeframe : '1h';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { rows } = await pool.query(
      `SELECT * FROM futures_candles WHERE symbol=$1 AND timeframe=$2 ORDER BY open_time DESC LIMIT $3`,
      [sym, tf, limit]
    );
    res.json({ candles: rows.reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures/positions', async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const { rows } = await pool.query(
      'SELECT * FROM futures_positions WHERE user_id=$1 AND status=$2 ORDER BY opened_at DESC',
      [req.user.id, status]
    );
    res.json({ positions: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/futures/orders', async (req, res) => {
  try {
    const { symbol, direction, size, leverage, order_type, margin_mode, take_profit, stop_loss, mode } = req.body;
    const sym = String(symbol || '').toUpperCase();
    if (!ALLOWED_SYMBOLS.has(sym)) return res.status(400).json({ error: 'Invalid symbol' });
    if (!['long','short'].includes(direction)) return res.status(400).json({ error: 'direction must be long or short' });
    const sz = parseFloat(size);
    const lev = Math.floor(parseFloat(leverage));
    if (isNaN(sz) || sz <= 0) return res.status(400).json({ error: 'Invalid size' });
    if (isNaN(lev) || lev < 1) return res.status(400).json({ error: 'Invalid leverage' });

    const posMode = String(mode || 'paper').toLowerCase();

    // Tier enforcement for live mode
    if (posMode === 'live') {
      const profile = await pool.query('SELECT verification_tier FROM user_profiles WHERE user_id=$1', [req.user.id]);
      const tier = profile.rows[0]?.verification_tier || 0;
      if (tier < 1) return res.status(403).json({ error: 'Live futures requires Social tier (🥈) or higher' });
      const maxLev = tier >= 2 ? 50 : 10;
      if (lev > maxLev) return res.status(400).json({ error: `Your tier allows max ${maxLev}x leverage for live futures` });
    }

    const market = await pool.query('SELECT * FROM futures_markets WHERE symbol=$1 AND is_active=TRUE AND paused=FALSE', [sym]);
    if (!market.rows[0]) return res.status(400).json({ error: 'Market not found or paused' });
    const m = market.rows[0];
    if (lev > m.max_leverage) return res.status(400).json({ error: `Max leverage for ${sym} is ${m.max_leverage}x` });

    // Position size cap check
    const cap = await pool.query(`SELECT value FROM app_config WHERE key='futures_position_cap_per_user_per_market'`);
    const maxNotional = parseFloat(cap.rows[0]?.value || 100000);
    const notional = sz * parseFloat(m.mark_price);
    if (notional > maxNotional) return res.status(400).json({ error: `Position size exceeds cap of $${maxNotional}` });

    const entryPrice = parseFloat(m.mark_price);
    const margin = notional / lev;
    const liqPrice = direction === 'long'
      ? entryPrice * (1 - 0.9 / lev)
      : entryPrice * (1 + 0.9 / lev);

    const txHash = posMode === 'live' ? (req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : null) : null;

    const { rows } = await pool.query(
      `INSERT INTO futures_positions (user_id,username,symbol,direction,size,entry_price,mark_price,leverage,margin_mode,margin,liquidation_price,take_profit,stop_loss,unrealized_pnl,status,mode,tx_hash,opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,0,'open',$13,$14,NOW()) RETURNING *`,
      [req.user.id, req.user.username, sym, direction, sz, entryPrice, lev,
       margin_mode || 'cross', margin.toFixed(8), liqPrice.toFixed(8),
       take_profit ? parseFloat(take_profit) : null,
       stop_loss ? parseFloat(stop_loss) : null,
       posMode, txHash]
    );

    await pool.query(
      `UPDATE futures_markets SET open_interest=open_interest+$1, volume_24h=volume_24h+$2 WHERE symbol=$3`,
      [notional, notional, sym]
    );

    res.json({ position: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate transaction' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/futures/orders/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE futures_orders SET status='cancelled' WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/futures/positions/:id/close', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM futures_positions WHERE id=$1 AND user_id=$2 AND status=$3',
      [req.params.id, req.user.id, 'open']
    );
    if (!rows[0]) return res.status(404).json({ error: 'Open position not found' });
    const pos = rows[0];

    const market = await pool.query('SELECT mark_price FROM futures_markets WHERE symbol=$1', [pos.symbol]);
    const closePrice = parseFloat(market.rows[0]?.mark_price || pos.entry_price);
    const entryPrice = parseFloat(pos.entry_price);
    const size = parseFloat(pos.size);

    const pnl = pos.direction === 'long'
      ? (closePrice - entryPrice) * size
      : (entryPrice - closePrice) * size;
    const fees = size * closePrice * 0.0005;

    await pool.query(
      `UPDATE futures_positions SET status='closed', closed_at=NOW(), realized_pnl=$1, mark_price=$2, unrealized_pnl=0 WHERE id=$3`,
      [pnl.toFixed(8), closePrice, pos.id]
    );

    await pool.query(
      `INSERT INTO futures_trades (user_id,username,symbol,direction,size,entry_price,exit_price,realized_pnl,fees,mode,opened_at,closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [req.user.id, req.user.username, pos.symbol, pos.direction, size, entryPrice, closePrice, pnl.toFixed(8), fees.toFixed(8), pos.mode, pos.opened_at]
    );

    if (pos.mode === 'live') {
      await pool.query(
        `UPDATE user_profiles SET veya_balance=veya_balance+$1 WHERE user_id=$2`,
        [pnl.toFixed(8), req.user.id]
      );
    }

    await pool.query(
      `UPDATE futures_markets SET open_interest=GREATEST(0,open_interest-$1) WHERE symbol=$2`,
      [(size * entryPrice).toFixed(8), pos.symbol]
    );

    res.json({ ok: true, pnl, close_price: closePrice });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures/trades', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await pool.query('SELECT * FROM futures_trades WHERE user_id=$1 ORDER BY closed_at DESC LIMIT $2', [req.user.id, limit]);
    res.json({ trades: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures/portfolio', async (req, res) => {
  try {
    const open = await pool.query('SELECT * FROM futures_positions WHERE user_id=$1 AND status=\'open\' ORDER BY opened_at DESC', [req.user.id]);
    const closed = await pool.query('SELECT * FROM futures_positions WHERE user_id=$1 AND status=\'closed\' ORDER BY closed_at DESC LIMIT 20', [req.user.id]);
    const stats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='closed') AS total_trades,
         COUNT(*) FILTER (WHERE status='closed' AND realized_pnl>0) AS winning_trades,
         COALESCE(SUM(realized_pnl) FILTER (WHERE status='closed'),0) AS total_pnl,
         COALESCE(SUM(realized_pnl) FILTER (WHERE status='closed' AND closed_at>NOW()-INTERVAL'24 hours'),0) AS pnl_24h,
         COALESCE(SUM(margin) FILTER (WHERE status='open'),0) AS total_margin_used
       FROM futures_positions WHERE user_id=$1`,
      [req.user.id]
    );
    res.json({ open_positions: open.rows, closed_positions: closed.rows, stats: stats.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures/leaderboard', async (req, res) => {
  try {
    const mode = req.query.mode || 'all';
    let modeFilter = '';
    if (mode === 'paper') modeFilter = `AND mode='paper'`;
    if (mode === 'live') modeFilter = `AND mode='live'`;
    const { rows } = await pool.query(
      `SELECT user_id, username,
         COUNT(*) FILTER (WHERE status='closed') AS total_trades,
         COALESCE(SUM(realized_pnl) FILTER (WHERE status='closed'),0) AS total_pnl,
         COALESCE(SUM(realized_pnl) FILTER (WHERE status='closed' AND closed_at>NOW()-INTERVAL'24 hours'),0) AS pnl_24h,
         COUNT(*) FILTER (WHERE status='closed' AND realized_pnl>0) AS wins
       FROM futures_positions
       WHERE TRUE ${modeFilter}
       GROUP BY user_id, username
       ORDER BY total_pnl DESC NULLS LAST
       LIMIT 50`
    );
    res.json({ leaderboard: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures/funding-payments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM futures_funding_payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ payments: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
