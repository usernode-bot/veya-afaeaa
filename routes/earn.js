const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireTier } = require('../lib/middleware');
const router = Router();

// Staking
router.get('/staking', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM staking_pools ORDER BY apy DESC');
    const userPositions = await pool.query('SELECT * FROM staking_positions WHERE user_id=$1', [req.user.id]);
    res.json({ pools: rows, positions: userPositions.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/staking/stake', async (req, res) => {
  try {
    const { pool_id, amount, tx_hash } = req.body;
    if (!pool_id || !amount || amount <= 0) return res.status(400).json({ error: 'pool_id and amount required' });
    const { rows: pools } = await pool.query('SELECT * FROM staking_pools WHERE id=$1 AND is_active=TRUE', [pool_id]);
    if (!pools[0]) return res.status(404).json({ error: 'Pool not found or inactive' });
    const p = pools[0];
    const { rows } = await pool.query(
      `INSERT INTO staking_positions (user_id,pool_id,pool_name,amount_staked,apy,tx_hash,status)
       VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING *`,
      [req.user.id, pool_id, p.name, amount, p.apy, tx_hash || `0xstake_${Date.now()}_${req.user.id}`]
    );
    await pool.query('UPDATE staking_pools SET total_staked=total_staked+$1 WHERE id=$2', [amount, pool_id]);
    res.json({ position: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/staking/unstake/:positionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM staking_positions WHERE id=$1 AND user_id=$2 AND status=$3',
      [req.params.positionId, req.user.id, 'active']
    );
    if (!rows[0]) return res.status(404).json({ error: 'Active position not found' });
    const pos = rows[0];
    const daysStaked = (Date.now() - new Date(pos.created_at).getTime()) / 86400000;
    const rewards = pos.amount_staked * (pos.apy / 100) * (daysStaked / 365);
    await pool.query(
      'UPDATE staking_positions SET status=$1, rewards_earned=$2, unstaked_at=NOW() WHERE id=$3',
      ['unstaked', rewards, pos.id]
    );
    await pool.query('UPDATE staking_pools SET total_staked=GREATEST(0,total_staked-$1) WHERE id=$2', [pos.amount_staked, pos.pool_id]);
    res.json({ ok: true, rewards, amount_returned: pos.amount_staked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LP Pools
router.get('/lp', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM lp_pools ORDER BY tvl DESC');
    const userPositions = await pool.query('SELECT * FROM lp_positions WHERE user_id=$1', [req.user.id]);
    res.json({ pools: rows, positions: userPositions.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/lp/add', requireTier(1), async (req, res) => {
  try {
    const { pool_id, amount_token_a, amount_token_b, tx_hash } = req.body;
    if (!pool_id || !amount_token_a || !amount_token_b) return res.status(400).json({ error: 'pool_id, amount_token_a, amount_token_b required' });
    const { rows: pools } = await pool.query('SELECT * FROM lp_pools WHERE id=$1', [pool_id]);
    if (!pools[0]) return res.status(404).json({ error: 'Pool not found' });
    const p = pools[0];
    const totalValue = parseFloat(amount_token_a) + parseFloat(amount_token_b);
    const lpTokens = totalValue / (p.tvl || 1) * (p.total_lp_tokens || 1000);
    const { rows } = await pool.query(
      `INSERT INTO lp_positions (user_id,pool_id,pool_name,lp_tokens,amount_token_a,amount_token_b,tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, pool_id, p.name, lpTokens, amount_token_a, amount_token_b, tx_hash || `0xlp_${Date.now()}`]
    );
    await pool.query('UPDATE lp_pools SET tvl=tvl+$1, total_lp_tokens=total_lp_tokens+$2 WHERE id=$3', [totalValue, lpTokens, pool_id]);
    res.json({ position: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ICO
router.get('/icos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM icos ORDER BY created_at DESC LIMIT 20');
    res.json({ icos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/icos/:id/buy', requireTier(1), async (req, res) => {
  try {
    const { amount, tx_hash } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required' });
    const { rows } = await pool.query('SELECT * FROM icos WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ICO not found' });
    const ico = rows[0];
    if (ico.status !== 'active') return res.status(400).json({ error: 'ICO not active' });
    const tokensReceived = parseFloat(amount) / ico.token_price;
    const raised = parseFloat(amount);
    await pool.query('UPDATE icos SET amount_raised=amount_raised+$1 WHERE id=$2', [raised, ico.id]);
    res.json({ ok: true, tokens_received: tokensReceived, amount_paid: amount, tx_hash: tx_hash || `0xico_${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stocks (tokenized)
router.get('/stocks', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM token_prices WHERE is_stock=TRUE ORDER BY symbol ASC');
    res.json({ stocks: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
