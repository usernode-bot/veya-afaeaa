const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireTier } = require('../lib/middleware');
const router = Router();

router.get('/futures/markets', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM futures_markets WHERE is_active=TRUE ORDER BY volume_24h DESC');
    res.json({ markets: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/futures/markets/:symbol', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM futures_markets WHERE symbol=$1', [req.params.symbol.toUpperCase()]);
    if (!rows[0]) return res.status(404).json({ error: 'Market not found' });
    res.json({ market: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/futures/candles/:symbol', async (req, res) => {
  try {
    const interval = req.query.interval || '15m';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { rows } = await pool.query(
      `SELECT * FROM futures_candles WHERE market_symbol=$1 AND interval=$2 ORDER BY time DESC LIMIT $3`,
      [req.params.symbol.toUpperCase(), interval, limit]
    );
    res.json({ candles: rows.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/futures/positions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM futures_positions WHERE user_id=$1 AND status=$2 ORDER BY opened_at DESC',
      [req.user.id, req.query.status || 'open']
    );
    res.json({ positions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/futures/order', requireTier(1), async (req, res) => {
  try {
    const { symbol, side, size, leverage, order_type, limit_price, stop_price, is_paper_trade } = req.body;
    if (!symbol || !side || !size || !leverage) {
      return res.status(400).json({ error: 'symbol, side, size, leverage required' });
    }
    const market = await pool.query('SELECT * FROM futures_markets WHERE symbol=$1 AND is_active=TRUE', [String(symbol).toUpperCase()]);
    if (!market.rows[0]) return res.status(400).json({ error: 'Market not found or inactive' });

    const m = market.rows[0];
    const sz = parseFloat(size);
    const lev = parseFloat(leverage);
    if (isNaN(sz) || sz <= 0) return res.status(400).json({ error: 'Invalid size' });
    if (isNaN(lev) || lev < 1 || lev > m.max_leverage) return res.status(400).json({ error: `Leverage must be 1-${m.max_leverage}` });
    if (!['long', 'short'].includes(side)) return res.status(400).json({ error: 'side must be long or short' });

    const entryPrice = m.mark_price;
    const notional = sz * entryPrice;
    const margin = notional / lev;
    const isPaper = !!is_paper_trade;

    const { rows } = await pool.query(
      `INSERT INTO futures_positions (user_id, market_symbol, side, size, leverage, entry_price, mark_price, liquidation_price, unrealized_pnl, margin, order_type, is_paper_trade, status, opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,'open',NOW()) RETURNING *`,
      [
        req.user.id, String(symbol).toUpperCase(), side, sz, lev, entryPrice,
        side === 'long' ? entryPrice * (1 - 1 / lev * 0.9) : entryPrice * (1 + 1 / lev * 0.9),
        0, margin, order_type || 'market', isPaper
      ]
    );

    const pos = rows[0];
    await pool.query(
      `INSERT INTO futures_trades (position_id,user_id,market_symbol,side,size,price,fee,is_paper_trade,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [pos.id, req.user.id, pos.market_symbol, side, sz, entryPrice, notional * 0.001, isPaper]
    );

    res.json({ position: pos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/futures/close/:positionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM futures_positions WHERE id=$1 AND user_id=$2 AND status=$3',
      [req.params.positionId, req.user.id, 'open']
    );
    if (!rows[0]) return res.status(404).json({ error: 'Open position not found' });
    const pos = rows[0];

    const market = await pool.query('SELECT mark_price FROM futures_markets WHERE symbol=$1', [pos.market_symbol]);
    const closePrice = market.rows[0]?.mark_price || pos.entry_price;

    const pnl = pos.side === 'long'
      ? (closePrice - pos.entry_price) * pos.size
      : (pos.entry_price - closePrice) * pos.size;

    await pool.query(
      `UPDATE futures_positions SET status='closed', closed_at=NOW(), realized_pnl=$1, mark_price=$2, unrealized_pnl=0 WHERE id=$3`,
      [pnl, closePrice, pos.id]
    );

    await pool.query(
      `INSERT INTO futures_trades (position_id,user_id,market_symbol,side,size,price,fee,is_paper_trade,realized_pnl,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [pos.id, req.user.id, pos.market_symbol, pos.side === 'long' ? 'close_long' : 'close_short', pos.size, closePrice, pos.size * closePrice * 0.001, pos.is_paper_trade, pnl]
    );

    if (pnl !== 0) {
      await pool.query(
        `UPDATE user_profiles SET veya_balance=veya_balance+$1 WHERE user_id=$2`,
        [pnl, req.user.id]
      );
    }

    res.json({ ok: true, pnl, close_price: closePrice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/futures/trades', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await pool.query(
      'SELECT * FROM futures_trades WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',
      [req.user.id, limit]
    );
    res.json({ trades: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/futures/portfolio', async (req, res) => {
  try {
    const open = await pool.query(
      'SELECT * FROM futures_positions WHERE user_id=$1 AND status=$2',
      [req.user.id, 'open']
    );
    const closed = await pool.query(
      'SELECT * FROM futures_positions WHERE user_id=$1 AND status=$2 ORDER BY closed_at DESC LIMIT 20',
      [req.user.id, 'closed']
    );
    const stats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='closed') AS total_trades,
         COUNT(*) FILTER (WHERE status='closed' AND realized_pnl>0) AS winning_trades,
         COALESCE(SUM(realized_pnl) FILTER (WHERE status='closed'),0) AS total_pnl,
         COALESCE(SUM(margin) FILTER (WHERE status='open'),0) AS total_margin_used
       FROM futures_positions WHERE user_id=$1`,
      [req.user.id]
    );
    res.json({
      open_positions: open.rows,
      closed_positions: closed.rows,
      stats: stats.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/futures/leaderboard', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT user_id,username,
         COUNT(*) FILTER (WHERE status='closed') AS total_trades,
         SUM(realized_pnl) FILTER (WHERE status='closed') AS total_pnl,
         COUNT(*) FILTER (WHERE status='closed' AND realized_pnl>0) AS wins
       FROM futures_positions
       WHERE is_paper_trade=FALSE
       GROUP BY user_id,username
       ORDER BY total_pnl DESC NULLS LAST
       LIMIT 50`
    );
    res.json({ leaderboard: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
