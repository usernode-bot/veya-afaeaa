'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireTier, requireNotBanned } = require('../lib/middleware');
const router = Router();

router.get('/markets', async (req, res) => {
  try {
    const status = ['active','pending','resolved','all'].includes(req.query.status) ? req.query.status : 'active';
    const where = status === 'all' ? '' : `WHERE status='${status}'`;
    const { rows } = await pool.query(`SELECT * FROM markets ${where} ORDER BY volume DESC NULLS LAST, created_at DESC LIMIT 50`);
    res.json({ markets: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/markets', requireTier(1), requireNotBanned, async (req, res) => {
  try {
    const question = String(req.body.question || '').trim().slice(0, 512);
    const description = String(req.body.description || '').trim().slice(0, 2000);
    const category = String(req.body.category || 'general').slice(0, 64);
    if (!question) return res.status(400).json({ error: 'Question required' });
    if (!req.body.closes_at) return res.status(400).json({ error: 'closes_at required' });
    const closesAt = new Date(req.body.closes_at);
    if (isNaN(closesAt.getTime()) || closesAt <= new Date()) return res.status(400).json({ error: 'closes_at must be in the future' });
    const { rows } = await pool.query(
      `INSERT INTO markets (creator_id, creator_username, question, description, category, closes_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, req.user.username, question, description, category, closesAt]
    );
    res.json({ market: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/markets/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM markets WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Market not found' });
    const history = await pool.query('SELECT * FROM market_price_history WHERE market_id=$1 ORDER BY recorded_at ASC LIMIT 200', [req.params.id]);
    const comments = await pool.query('SELECT * FROM market_comments WHERE market_id=$1 ORDER BY created_at DESC LIMIT 50', [req.params.id]);
    const userPos = await pool.query('SELECT * FROM market_positions WHERE market_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const isCircuitBreaker = rows[0].circuit_breaker_until && new Date(rows[0].circuit_breaker_until) > new Date();
    res.json({ market: { ...rows[0], circuit_breaker_active: isCircuitBreaker }, price_history: history.rows, comments: comments.rows, user_positions: userPos.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/markets/:id/trade', async (req, res) => {
  try {
    const { rows: mrows } = await pool.query('SELECT * FROM markets WHERE id=$1', [req.params.id]);
    if (!mrows[0]) return res.status(404).json({ error: 'Market not found' });
    const m = mrows[0];
    if (m.status !== 'active') return res.status(400).json({ error: 'Market is not active' });
    if (m.circuit_breaker_until && new Date(m.circuit_breaker_until) > new Date()) {
      return res.status(423).json({ error: 'Market paused by circuit breaker', until: m.circuit_breaker_until });
    }
    const side = ['YES','NO'].includes(String(req.body.side || '').toUpperCase()) ? String(req.body.side).toUpperCase() : null;
    const shares = parseFloat(req.body.shares);
    if (!side || !shares || shares <= 0) return res.status(400).json({ error: 'side (YES/NO) and shares required' });

    // Constant-product AMM pricing
    const yesPool = parseFloat(m.yes_pool);
    const noPool = parseFloat(m.no_pool);
    const k = yesPool * noPool;
    let amount, newYesPool, newNoPool;
    if (side === 'YES') {
      newYesPool = yesPool + shares;
      newNoPool = k / newYesPool;
      amount = noPool - newNoPool;
    } else {
      newNoPool = noPool + shares;
      newYesPool = k / newNoPool;
      amount = yesPool - newYesPool;
    }
    const price = amount / shares;
    const newProb = newYesPool / (newYesPool + newNoPool);

    // Circuit breaker check (>20% move)
    const prevProb = parseFloat(m.yes_probability);
    const move = Math.abs(newProb - prevProb);
    const cbThreshold = 0.20;
    if (move > cbThreshold) {
      await pool.query(`UPDATE markets SET circuit_breaker_until=NOW()+INTERVAL'5 minutes' WHERE id=$1`, [m.id]);
      return res.status(423).json({ error: 'Circuit breaker triggered — market paused 5 minutes due to rapid price movement' });
    }

    await pool.query(
      `UPDATE markets SET yes_pool=$1, no_pool=$2, yes_probability=$3, volume=volume+$4 WHERE id=$5`,
      [newYesPool.toFixed(8), newNoPool.toFixed(8), newProb.toFixed(4), Math.abs(amount).toFixed(8), m.id]
    );

    // Record price history
    await pool.query('INSERT INTO market_price_history (market_id, yes_probability, volume) VALUES ($1,$2,$3)', [m.id, newProb.toFixed(4), Math.abs(amount).toFixed(8)]);

    // Update/create position
    const existing = await pool.query('SELECT * FROM market_positions WHERE market_id=$1 AND user_id=$2 AND side=$3', [m.id, req.user.id, side]);
    if (existing.rows[0]) {
      const newShares = parseFloat(existing.rows[0].shares) + shares;
      const newAvg = (parseFloat(existing.rows[0].shares) * parseFloat(existing.rows[0].avg_price) + shares * price) / newShares;
      await pool.query('UPDATE market_positions SET shares=$1, avg_price=$2, updated_at=NOW() WHERE id=$3', [newShares.toFixed(8), newAvg.toFixed(6), existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO market_positions (market_id, user_id, username, side, shares, avg_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [m.id, req.user.id, req.user.username, side, shares.toFixed(8), price.toFixed(6)]);
    }

    const tx_hash = req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : null;
    if (tx_hash) {
      await pool.query('INSERT INTO market_trades (market_id, user_id, side, shares, price, amount, tx_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [m.id, req.user.id, side, shares.toFixed(8), price.toFixed(6), Math.abs(amount).toFixed(8), tx_hash]);
    }

    res.json({ ok: true, side, shares, price: price.toFixed(6), cost: Math.abs(amount).toFixed(8), new_probability: newProb.toFixed(4) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate transaction' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/markets/:id/resolve', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM markets WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const m = rows[0];
    if (m.creator_id !== req.user.id) {
      const prof = await pool.query('SELECT is_admin FROM user_profiles WHERE user_id=$1', [req.user.id]);
      if (!prof.rows[0]?.is_admin) return res.status(403).json({ error: 'Only creator or admin can resolve' });
    }
    const outcome = ['YES','NO','cancelled'].includes(req.body.outcome) ? req.body.outcome : null;
    if (!outcome) return res.status(400).json({ error: 'outcome must be YES, NO, or cancelled' });
    const status = outcome === 'cancelled' ? 'cancelled' : 'resolved';
    await pool.query('UPDATE markets SET status=$1, resolved_outcome=$2, resolved_at=NOW() WHERE id=$3', [status, outcome, m.id]);
    const positions = await pool.query('SELECT * FROM market_positions WHERE market_id=$1', [m.id]);
    for (const pos of positions.rows) {
      let payout = 0;
      if (outcome === 'YES') payout = pos.side === 'YES' ? parseFloat(pos.shares) : 0;
      else if (outcome === 'NO') payout = pos.side === 'NO' ? parseFloat(pos.shares) : 0;
      else payout = parseFloat(pos.shares) * parseFloat(pos.avg_price);
      if (payout > 0) {
        const qText = String(m.question).slice(0, 80).replace(/'/g, "''");
        await pool.query(
          `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'market_resolved','Market resolved','${qText} → ${outcome}. Payout: $${payout.toFixed(2)}')`,
          [pos.user_id]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/markets/:id/comments', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM market_comments WHERE market_id=$1 ORDER BY created_at DESC LIMIT 50', [req.params.id]);
    res.json({ comments: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/markets/:id/comments', requireNotBanned, async (req, res) => {
  try {
    const content = String(req.body.content || '').trim().slice(0, 512);
    if (!content) return res.status(400).json({ error: 'Content required' });
    const { rows } = await pool.query(
      `INSERT INTO market_comments (market_id, user_id, username, content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, req.user.username, content]
    );
    res.json({ comment: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
