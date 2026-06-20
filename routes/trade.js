const { Router } = require('express');
const { pool } = require('../lib/db');
const router = Router();

router.get('/tokens', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM token_prices WHERE is_stock=FALSE ORDER BY market_cap DESC');
    res.json({ tokens: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tokens/:symbol', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM token_prices WHERE symbol=$1', [req.params.symbol.toUpperCase()]);
    if (!rows[0]) return res.status(404).json({ error: 'Token not found' });
    res.json({ token: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/swap', async (req, res) => {
  try {
    const { from_symbol, to_symbol, amount, tx_hash } = req.body;
    if (!from_symbol || !to_symbol || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid swap parameters' });
    }
    const fromToken = await pool.query('SELECT price_usd FROM token_prices WHERE symbol=$1', [String(from_symbol).toUpperCase()]);
    const toToken = await pool.query('SELECT price_usd FROM token_prices WHERE symbol=$1', [String(to_symbol).toUpperCase()]);
    if (!fromToken.rows[0] || !toToken.rows[0]) return res.status(400).json({ error: 'Unknown token' });
    res.json({ ok: true, from: from_symbol, to: to_symbol, amount, tx_hash: tx_hash || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM stock_trades WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    res.json({ orders: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
