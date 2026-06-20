const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireNotBanned } = require('../lib/middleware');
const router = Router();

router.get('/markets', async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const { rows } = await pool.query(
      'SELECT * FROM prediction_markets ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ markets: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/markets/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM prediction_markets WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Market not found' });
    const history = await pool.query(
      'SELECT * FROM market_price_history WHERE market_id=$1 ORDER BY recorded_at ASC LIMIT 200',
      [req.params.id]
    );
    const comments = await pool.query(
      'SELECT * FROM market_comments WHERE market_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    const userPosition = await pool.query(
      'SELECT * FROM market_positions WHERE market_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({
      market: rows[0],
      price_history: history.rows,
      comments: comments.rows,
      user_position: userPosition.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/markets', requireNotBanned, async (req, res) => {
  try {
    const { question, description, closes_at, category } = req.body;
    const q = String(question || '').trim().slice(0, 500);
    if (!q || !closes_at) return res.status(400).json({ error: 'question and closes_at required' });
    const { rows } = await pool.query(
      `INSERT INTO prediction_markets (creator_id,creator_username,question,description,category,closes_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, req.user.username, q, String(description || '').trim().slice(0, 2000), String(category || 'general').slice(0, 50), closes_at]
    );
    res.json({ market: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/markets/:id/trade', async (req, res) => {
  try {
    const { outcome, shares, tx_hash } = req.body;
    if (!['yes', 'no'].includes(outcome) || !shares || shares <= 0) {
      return res.status(400).json({ error: 'outcome (yes/no) and shares required' });
    }
    const { rows: markets } = await pool.query('SELECT * FROM prediction_markets WHERE id=$1', [req.params.id]);
    if (!markets[0]) return res.status(404).json({ error: 'Market not found' });
    const m = markets[0];
    if (m.status !== 'open') return res.status(400).json({ error: 'Market is not open for trading' });
    const price = outcome === 'yes' ? parseFloat(m.yes_price) : parseFloat(m.no_price);
    const totalCost = price * parseFloat(shares);
    const existing = await pool.query(
      'SELECT * FROM market_positions WHERE market_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE market_positions SET
           yes_shares = yes_shares + CASE WHEN $1='yes' THEN $2 ELSE 0 END,
           no_shares  = no_shares  + CASE WHEN $1='no'  THEN $2 ELSE 0 END,
           avg_cost = avg_cost + $3,
           updated_at = NOW()
         WHERE market_id=$4 AND user_id=$5`,
        [outcome, parseFloat(shares), totalCost, req.params.id, req.user.id]
      );
    } else {
      await pool.query(
        `INSERT INTO market_positions (market_id,user_id,username,outcome,yes_shares,no_shares,avg_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          req.params.id, req.user.id, req.user.username, outcome,
          outcome === 'yes' ? parseFloat(shares) : 0,
          outcome === 'no' ? parseFloat(shares) : 0,
          totalCost,
        ]
      );
    }
    await pool.query(
      'UPDATE prediction_markets SET liquidity=liquidity+$1 WHERE id=$2',
      [totalCost, req.params.id]
    );
    res.json({ ok: true, cost: totalCost, tx_hash: tx_hash || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/markets/:id/resolve', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM prediction_markets WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const m = rows[0];
    if (m.creator_id !== req.user.id) {
      const prof = await pool.query('SELECT is_admin FROM user_profiles WHERE user_id=$1', [req.user.id]);
      if (!prof.rows[0]?.is_admin) return res.status(403).json({ error: 'Only creator or admin can resolve' });
    }
    const { outcome } = req.body;
    if (!['yes', 'no', 'cancelled'].includes(outcome)) return res.status(400).json({ error: 'outcome must be yes, no, or cancelled' });
    await pool.query('UPDATE prediction_markets SET status=$1, resolved_outcome=$2 WHERE id=$3', [
      outcome === 'cancelled' ? 'cancelled' : 'resolved', outcome, m.id
    ]);
    const positions = await pool.query('SELECT * FROM market_positions WHERE market_id=$1', [m.id]);
    for (const pos of positions.rows) {
      let payout = 0;
      if (outcome === 'yes') payout = pos.yes_shares;
      else if (outcome === 'no') payout = pos.no_shares;
      else if (outcome === 'cancelled') payout = pos.avg_cost;
      if (payout > 0) {
        await pool.query(
          `INSERT INTO notifications (user_id,type,title,body)
           VALUES ($1,'market_resolved','Market resolved','${String(m.question).slice(0,80)} resolved: ${outcome}. Payout: $${payout.toFixed(2)}')`,
          [pos.user_id]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/markets/:id/comment', requireNotBanned, async (req, res) => {
  try {
    const content = String(req.body.content || '').trim().slice(0, 500);
    if (!content) return res.status(400).json({ error: 'content required' });
    const { rows } = await pool.query(
      `INSERT INTO market_comments (market_id,user_id,username,content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, req.user.username, content]
    );
    res.json({ comment: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
