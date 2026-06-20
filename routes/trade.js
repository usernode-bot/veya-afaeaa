'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const router = Router();

router.get('/tokens', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM token_prices WHERE is_stock=FALSE ORDER BY market_cap DESC NULLS LAST');
    res.json({ tokens: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/tokens/:symbol', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM token_prices WHERE symbol=$1', [req.params.symbol.toUpperCase()]);
    if (!rows[0]) return res.status(404).json({ error: 'Token not found' });
    const candles = await pool.query(
      `SELECT * FROM futures_candles WHERE symbol=$1 AND timeframe='1h' ORDER BY open_time DESC LIMIT 100`,
      [req.params.symbol.toUpperCase() + '-PERP']
    );
    res.json({ token: rows[0], candles: candles.rows.reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/swap', async (req, res) => {
  try {
    const from_symbol = String(req.body.from_symbol || '').toUpperCase().slice(0, 32);
    const to_symbol = String(req.body.to_symbol || '').toUpperCase().slice(0, 32);
    const amount = parseFloat(req.body.amount);
    if (!from_symbol || !to_symbol || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid swap parameters' });
    const fromTok = await pool.query('SELECT price_usd FROM token_prices WHERE symbol=$1', [from_symbol]);
    const toTok = await pool.query('SELECT price_usd FROM token_prices WHERE symbol=$1', [to_symbol]);
    if (!fromTok.rows[0] || !toTok.rows[0]) return res.status(400).json({ error: 'Unknown token' });
    const tx_hash = req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : null;
    const rate = fromTok.rows[0].price_usd / toTok.rows[0].price_usd;
    res.json({ ok: true, from: from_symbol, to: to_symbol, amount, rate, estimated_out: amount * rate, tx_hash });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM stock_trades WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    res.json({ orders: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
