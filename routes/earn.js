'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireTier } = require('../lib/middleware');
const router = Router();

const STAKING_POOLS = [
  { id: 'veya-pool', name: 'VEYA Pool', symbol: 'VEYA', apy: 8.0, total_staked: 2500000, min_stake: 100 },
  { id: 'usdc-pool', name: 'USDC Pool', symbol: 'USDC', apy: 5.0, total_staked: 1000000, min_stake: 50 },
];

const LP_POOLS = [
  { id: 'veya-eth-lp', name: 'VEYA/ETH', token_a: 'VEYA', token_b: 'ETH', apy: 18.5, tvl: 4200000, requires_premium: false },
  { id: 'veya-usdc-lp', name: 'VEYA/USDC', token_a: 'VEYA', token_b: 'USDC', apy: 12.0, tvl: 8100000, requires_premium: false },
];

router.get('/staking/pools', async (req, res) => {
  try {
    const positions = await pool.query('SELECT * FROM staking_positions WHERE user_id=$1', [req.user.id]);
    const pools = STAKING_POOLS.map(p => {
      const pos = positions.rows.find(r => r.pool_id === p.id);
      const daysStaked = pos ? (Date.now() - new Date(pos.created_at).getTime()) / 86400000 : 0;
      const pendingRewards = pos ? (parseFloat(pos.amount) * p.apy / 100) * (daysStaked / 365) : 0;
      return { ...p, user_position: pos || null, pending_rewards: pendingRewards.toFixed(8) };
    });
    res.json({ pools });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/staking/stake', async (req, res) => {
  try {
    const pool_id = String(req.body.pool_id || '');
    const amount = parseFloat(req.body.amount);
    const p = STAKING_POOLS.find(x => x.id === pool_id);
    if (!p) return res.status(400).json({ error: 'Invalid pool' });
    if (!amount || amount < p.min_stake) return res.status(400).json({ error: `Minimum stake is ${p.min_stake}` });
    const tx_hash = req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : `0xstake_${req.user.id}_${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO staking_positions (user_id, username, pool_id, amount, tx_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, req.user.username, pool_id, amount, tx_hash]
    );
    res.json({ position: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate transaction' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/staking/unstake', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM staking_positions WHERE id=$1 AND user_id=$2', [req.body.position_id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Position not found' });
    if (rows[0].unstake_requested_at) return res.status(400).json({ error: 'Unstake already requested' });
    await pool.query('UPDATE staking_positions SET unstake_requested_at=NOW() WHERE id=$1', [rows[0].id]);
    res.json({ ok: true, unstake_ready_at: new Date(Date.now() + 7 * 86400000).toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/staking/claim', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM staking_positions WHERE id=$1 AND user_id=$2', [req.body.position_id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Position not found' });
    const pool_def = STAKING_POOLS.find(x => x.id === rows[0].pool_id);
    const daysStaked = (Date.now() - new Date(rows[0].created_at).getTime()) / 86400000;
    const rewards = (parseFloat(rows[0].amount) * (pool_def?.apy || 8) / 100) * (daysStaked / 365);
    await pool.query('UPDATE staking_positions SET rewards_claimed=rewards_claimed+$1 WHERE id=$2', [rewards.toFixed(8), rows[0].id]);
    await pool.query('UPDATE user_profiles SET veya_balance=veya_balance+$1 WHERE user_id=$2', [rewards.toFixed(8), req.user.id]);
    res.json({ ok: true, claimed: rewards.toFixed(8) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/lp/pools', async (req, res) => {
  try {
    const positions = await pool.query('SELECT * FROM lp_positions WHERE user_id=$1', [req.user.id]);
    const pools = LP_POOLS.map(p => ({ ...p, user_position: positions.rows.find(r => r.pool_id === p.id) || null }));
    res.json({ pools });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/lp/add', async (req, res) => {
  try {
    const pool_id = String(req.body.pool_id || '');
    const lp_pool = LP_POOLS.find(x => x.id === pool_id);
    if (!lp_pool) return res.status(400).json({ error: 'Invalid LP pool' });
    const amount_a = parseFloat(req.body.amount_a);
    const amount_b = parseFloat(req.body.amount_b);
    if (!amount_a || !amount_b || amount_a <= 0 || amount_b <= 0) return res.status(400).json({ error: 'Invalid amounts' });
    const tx_hash = req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : `0xlp_${req.user.id}_${Date.now()}`;
    const lp_tokens = Math.sqrt(amount_a * amount_b);
    const { rows } = await pool.query(
      `INSERT INTO lp_positions (user_id, pool_id, token_a, token_b, amount_a, amount_b, lp_tokens, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, pool_id, lp_pool.token_a, lp_pool.token_b, amount_a, amount_b, lp_tokens.toFixed(8), tx_hash]
    );
    res.json({ position: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate transaction' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/lp/create', requireTier(2), async (req, res) => {
  res.json({ ok: true, message: 'LP pool creation coming soon' });
});

router.get('/ico', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM icos ORDER BY starts_at DESC');
    const participations = await pool.query('SELECT * FROM ico_participations WHERE user_id=$1', [req.user.id]);
    const result = rows.map(ico => ({
      ...ico,
      user_participation: participations.rows.find(p => p.ico_id === ico.id) || null,
    }));
    res.json({ icos: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ico/:id/participate', requireTier(1), async (req, res) => {
  try {
    const { rows: icoRows } = await pool.query('SELECT * FROM icos WHERE id=$1 AND status=$2', [req.params.id, 'active']);
    if (!icoRows[0]) return res.status(404).json({ error: 'ICO not found or not active' });
    const ico = icoRows[0];
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const profile = await pool.query('SELECT verification_tier FROM user_profiles WHERE user_id=$1', [req.user.id]);
    const tier = profile.rows[0]?.verification_tier || 1;
    const cap = tier >= 2 ? parseFloat(ico.premium_cap) : parseFloat(ico.social_cap);
    if (amount > cap) return res.status(400).json({ error: `Your tier cap is ${cap} tokens` });
    const tx_hash = req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : `0xicop_${req.user.id}_${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO ico_participations (ico_id, user_id, username, amount, tx_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ico.id, req.user.id, req.user.username, amount, tx_hash]
    );
    await pool.query('UPDATE icos SET raised=raised+$1 WHERE id=$2', [amount * parseFloat(ico.token_price), ico.id]);
    res.json({ participation: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already participated in this ICO' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/stocks', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM token_prices WHERE is_stock=TRUE ORDER BY symbol');
    const positions = await pool.query('SELECT * FROM stock_positions WHERE user_id=$1', [req.user.id]);
    res.json({ stocks: rows, positions: positions.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/stocks/trade', async (req, res) => {
  try {
    const symbol = String(req.body.symbol || '').toUpperCase().slice(0, 32);
    const direction = ['buy','sell'].includes(req.body.direction) ? req.body.direction : null;
    const quantity = parseFloat(req.body.quantity);
    if (!direction || !quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid trade parameters' });
    const stock = await pool.query('SELECT * FROM token_prices WHERE symbol=$1 AND is_stock=TRUE', [symbol]);
    if (!stock.rows[0]) return res.status(400).json({ error: 'Stock not found' });
    const price = parseFloat(stock.rows[0].price_usd);
    const tx_hash = `0xstock_${req.user.id}_${Date.now()}`;
    await pool.query(
      `INSERT INTO stock_trades (user_id, username, symbol, direction, quantity, price, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.id, req.user.username, symbol, direction, quantity, price, tx_hash]
    );
    const existing = await pool.query('SELECT * FROM stock_positions WHERE user_id=$1 AND symbol=$2', [req.user.id, symbol]);
    if (direction === 'buy') {
      if (existing.rows[0]) {
        const newQty = parseFloat(existing.rows[0].quantity) + quantity;
        const newAvg = (parseFloat(existing.rows[0].quantity) * parseFloat(existing.rows[0].avg_entry_price) + quantity * price) / newQty;
        await pool.query('UPDATE stock_positions SET quantity=$1, avg_entry_price=$2 WHERE id=$3', [newQty, newAvg, existing.rows[0].id]);
      } else {
        await pool.query('INSERT INTO stock_positions (user_id, symbol, quantity, avg_entry_price) VALUES ($1,$2,$3,$4)', [req.user.id, symbol, quantity, price]);
      }
    } else if (existing.rows[0]) {
      const newQty = Math.max(0, parseFloat(existing.rows[0].quantity) - quantity);
      await pool.query('UPDATE stock_positions SET quantity=$1 WHERE id=$2', [newQty, existing.rows[0].id]);
    }
    res.json({ ok: true, price, quantity, total: price * quantity });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
