'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireNotBanned } = require('../lib/middleware');
const router = Router();

router.get('/posts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    let rows;
    if (req.query.mode === 'following') {
      const r = await pool.query(
        `SELECT p.* FROM posts p
         JOIN follows f ON f.following_id=p.user_id
         WHERE f.follower_id=$1 AND p.reply_to_id IS NULL
         ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
      rows = r.rows;
    } else {
      const r = await pool.query(
        `SELECT * FROM posts WHERE reply_to_id IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      rows = r.rows;
    }
    res.json({ posts: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/posts', requireNotBanned, async (req, res) => {
  try {
    const content = String(req.body.content || '').trim().slice(0, 320);
    if (!content) return res.status(400).json({ error: 'Content required' });
    const { rows } = await pool.query(
      `INSERT INTO posts (user_id, username, content, poll_id, market_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, req.user.username, content, req.body.poll_id || null, req.body.market_id || null]
    );
    res.json({ post: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/posts/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    const replies = await pool.query('SELECT * FROM replies WHERE parent_post_id=$1 ORDER BY created_at ASC', [req.params.id]);
    res.json({ post: rows[0], replies: replies.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/posts/:id/reply', requireNotBanned, async (req, res) => {
  try {
    const content = String(req.body.content || '').trim().slice(0, 320);
    if (!content) return res.status(400).json({ error: 'Content required' });
    const { rows } = await pool.query(
      `INSERT INTO replies (parent_post_id, user_id, username, content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, req.user.username, content]
    );
    await pool.query('UPDATE posts SET reply_count=reply_count+1 WHERE id=$1', [req.params.id]);
    res.json({ reply: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/posts/:id/react', async (req, res) => {
  try {
    const type = String(req.body.type || 'like').slice(0, 32);
    const existing = await pool.query('SELECT id FROM reactions WHERE post_id=$1 AND user_id=$2 AND type=$3', [req.params.id, req.user.id, type]);
    if (existing.rows[0]) {
      await pool.query('DELETE FROM reactions WHERE id=$1', [existing.rows[0].id]);
      await pool.query('UPDATE posts SET reaction_count=GREATEST(0,reaction_count-1) WHERE id=$1', [req.params.id]);
      return res.json({ action: 'removed' });
    }
    await pool.query('INSERT INTO reactions (post_id, user_id, type) VALUES ($1,$2,$3)', [req.params.id, req.user.id, type]);
    await pool.query('UPDATE posts SET reaction_count=reaction_count+1 WHERE id=$1', [req.params.id]);
    res.json({ action: 'added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    const profile = await pool.query('SELECT is_admin FROM user_profiles WHERE user_id=$1', [req.user.id]);
    if (rows[0].user_id !== req.user.id && !profile.rows[0]?.is_admin) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/follow', async (req, res) => {
  try {
    const target = await pool.query('SELECT user_id FROM user_profiles WHERE username=$1', [req.body.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const tid = target.rows[0].user_id;
    if (tid === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself' });
    await pool.query('INSERT INTO follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, tid]);
    await pool.query('UPDATE user_profiles SET following_count=following_count+1 WHERE user_id=$1', [req.user.id]);
    await pool.query('UPDATE user_profiles SET follower_count=follower_count+1 WHERE user_id=$1', [tid]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/follow/:username', async (req, res) => {
  try {
    const target = await pool.query('SELECT user_id FROM user_profiles WHERE username=$1', [req.params.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const tid = target.rows[0].user_id;
    const r = await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, tid]);
    if (r.rowCount > 0) {
      await pool.query('UPDATE user_profiles SET following_count=GREATEST(0,following_count-1) WHERE user_id=$1', [req.user.id]);
      await pool.query('UPDATE user_profiles SET follower_count=GREATEST(0,follower_count-1) WHERE user_id=$1', [tid]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/followers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT up.username, up.display_name, up.verification_tier FROM follows f
       JOIN user_profiles up ON up.user_id=f.follower_id WHERE f.following_id=$1`,
      [req.user.id]
    );
    res.json({ followers: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/following', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT up.username, up.display_name, up.verification_tier FROM follows f
       JOIN user_profiles up ON up.user_id=f.following_id WHERE f.follower_id=$1`,
      [req.user.id]
    );
    res.json({ following: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/polls', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM polls ORDER BY created_at DESC LIMIT 20');
    res.json({ polls: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/polls', requireNotBanned, async (req, res) => {
  try {
    const question = String(req.body.question || '').trim().slice(0, 320);
    if (!question) return res.status(400).json({ error: 'Question required' });
    const options = (req.body.options || []).slice(0, 4).map((o, i) => ({ id: i + 1, text: String(o).trim().slice(0, 100), vote_count: 0 }));
    if (options.length < 2) return res.status(400).json({ error: 'At least 2 options required' });
    const { rows } = await pool.query(
      `INSERT INTO polls (user_id, username, question, options, closes_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, req.user.username, question, JSON.stringify(options), req.body.closes_at || null]
    );
    res.json({ poll: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/polls/:id/vote', async (req, res) => {
  try {
    const optionId = parseInt(req.body.option_id);
    const existing = await pool.query('SELECT id FROM poll_votes WHERE poll_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (existing.rows[0]) return res.status(409).json({ error: 'Already voted' });
    await pool.query('INSERT INTO poll_votes (poll_id, user_id, option_id) VALUES ($1,$2,$3)', [req.params.id, req.user.id, optionId]);
    await pool.query('UPDATE polls SET total_votes=total_votes+1 WHERE id=$1', [req.params.id]);
    const poll = await pool.query('SELECT * FROM polls WHERE id=$1', [req.params.id]);
    if (poll.rows[0]) {
      const opts = poll.rows[0].options;
      const updated = opts.map(o => o.id === optionId ? { ...o, vote_count: (o.vote_count || 0) + 1 } : o);
      await pool.query('UPDATE polls SET options=$1 WHERE id=$2', [JSON.stringify(updated), req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
