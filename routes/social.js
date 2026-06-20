const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireNotBanned } = require('../lib/middleware');
const router = Router();

// Posts
router.get('/posts', async (req, res) => {
  try {
    const mode = req.query.mode === 'following' ? 'following' : 'global';
    let rows;
    if (mode === 'following') {
      const result = await pool.query(
        `SELECT p.* FROM posts p
         JOIN follows f ON f.following_id=p.user_id AND f.follower_id=$1
         ORDER BY p.created_at DESC LIMIT 50`,
        [req.user.id]
      );
      rows = result.rows;
    } else {
      const result = await pool.query('SELECT * FROM posts ORDER BY created_at DESC LIMIT 50');
      rows = result.rows;
    }
    res.json({ posts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/posts', requireNotBanned, async (req, res) => {
  try {
    const content = String(req.body.content || '').trim().slice(0, 320);
    if (!content) return res.status(400).json({ error: 'Content required' });
    const { rows } = await pool.query(
      `INSERT INTO posts (user_id,username,content,poll_id,market_id,created_at)
       VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [req.user.id, req.user.username, content, req.body.poll_id || null, req.body.market_id || null]
    );
    res.json({ post: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/posts/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const replies = await pool.query('SELECT * FROM replies WHERE parent_post_id=$1 ORDER BY created_at ASC LIMIT 50', [req.params.id]);
    res.json({ post: rows[0], replies: replies.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/posts/:id/reply', requireNotBanned, async (req, res) => {
  try {
    const content = String(req.body.content || '').trim().slice(0, 320);
    if (!content) return res.status(400).json({ error: 'Content required' });
    const post = await pool.query('SELECT id FROM posts WHERE id=$1', [req.params.id]);
    if (!post.rows[0]) return res.status(404).json({ error: 'Post not found' });
    const { rows } = await pool.query(
      `INSERT INTO replies (parent_post_id,user_id,username,content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, req.user.username, content]
    );
    await pool.query('UPDATE posts SET reply_count=reply_count+1 WHERE id=$1', [req.params.id]);
    res.json({ reply: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/posts/:id/react', async (req, res) => {
  try {
    const type = String(req.body.type || 'like').slice(0, 32);
    try {
      await pool.query(
        `INSERT INTO reactions (post_id,user_id,type) VALUES ($1,$2,$3)`,
        [req.params.id, req.user.id, type]
      );
      await pool.query('UPDATE posts SET reaction_count=reaction_count+1 WHERE id=$1', [req.params.id]);
    } catch (e) {
      if (e.code === '23505') {
        // Already reacted — toggle off
        await pool.query('DELETE FROM reactions WHERE post_id=$1 AND user_id=$2 AND type=$3', [req.params.id, req.user.id, type]);
        await pool.query('UPDATE posts SET reaction_count=GREATEST(0,reaction_count-1) WHERE id=$1', [req.params.id]);
      } else throw e;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT user_id FROM posts WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const prof = await pool.query('SELECT is_admin FROM user_profiles WHERE user_id=$1', [req.user.id]);
    if (rows[0].user_id !== req.user.id && !prof.rows[0]?.is_admin) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follows
router.post('/follow', async (req, res) => {
  try {
    const target = await pool.query('SELECT user_id FROM user_profiles WHERE username=$1', [req.body.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const targetId = target.rows[0].user_id;
    if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself' });
    try {
      await pool.query(
        `INSERT INTO follows (follower_id,following_id,follower_username,following_username) VALUES ($1,$2,$3,$4)`,
        [req.user.id, targetId, req.user.username, req.body.username]
      );
      await pool.query('UPDATE user_profiles SET following_count=following_count+1 WHERE user_id=$1', [req.user.id]);
      await pool.query('UPDATE user_profiles SET follower_count=follower_count+1 WHERE user_id=$1', [targetId]);
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/follow/:username', async (req, res) => {
  try {
    const target = await pool.query('SELECT user_id FROM user_profiles WHERE username=$1', [req.params.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'Not found' });
    const targetId = target.rows[0].user_id;
    const result = await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, targetId]);
    if (result.rowCount > 0) {
      await pool.query('UPDATE user_profiles SET following_count=GREATEST(0,following_count-1) WHERE user_id=$1', [req.user.id]);
      await pool.query('UPDATE user_profiles SET follower_count=GREATEST(0,follower_count-1) WHERE user_id=$1', [targetId]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/followers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT up.username,up.display_name,up.verification_tier FROM follows f
       JOIN user_profiles up ON up.user_id=f.follower_id
       WHERE f.following_id=$1 ORDER BY f.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ followers: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/following', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT up.username,up.display_name,up.verification_tier FROM follows f
       JOIN user_profiles up ON up.user_id=f.following_id
       WHERE f.follower_id=$1 ORDER BY f.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ following: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polls
router.get('/polls', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, pv.option_id as user_vote FROM polls p
       LEFT JOIN poll_votes pv ON pv.poll_id=p.id AND pv.user_id=$1
       ORDER BY p.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ polls: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/polls', requireNotBanned, async (req, res) => {
  try {
    const question = String(req.body.question || '').trim().slice(0, 320);
    const options = Array.isArray(req.body.options) ? req.body.options.slice(0, 6) : [];
    if (!question || options.length < 2) return res.status(400).json({ error: 'Question and at least 2 options required' });
    const optionsData = options.map((o, i) => ({ id: i + 1, text: String(o).trim().slice(0, 100), vote_count: 0 }));
    const closesAt = req.body.closes_at || new Date(Date.now() + 7 * 86400000).toISOString();
    const { rows } = await pool.query(
      `INSERT INTO polls (user_id,username,question,options,closes_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, req.user.username, question, JSON.stringify(optionsData), closesAt]
    );
    res.json({ poll: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/polls/:id/vote', async (req, res) => {
  try {
    const optionId = parseInt(req.body.option_id);
    if (!optionId) return res.status(400).json({ error: 'option_id required' });
    try {
      await pool.query(
        `INSERT INTO poll_votes (poll_id,user_id,option_id) VALUES ($1,$2,$3)`,
        [req.params.id, req.user.id, optionId]
      );
      await pool.query(
        `UPDATE polls SET
           options = jsonb_set(options, ARRAY[(SELECT position::text FROM jsonb_array_elements(options) WITH ORDINALITY arr(elem,position) WHERE (elem->>'id')::int=$1 LIMIT 1), 'vote_count'], ((options->>(SELECT (position-1)::text FROM jsonb_array_elements(options) WITH ORDINALITY arr(elem,position) WHERE (elem->>'id')::int=$1 LIMIT 1))::jsonb->>'vote_count')::int + 1),
           total_votes=total_votes+1
         WHERE id=$2`,
        [optionId, req.params.id]
      ).catch(() => {
        // Fallback: just increment total_votes
        return pool.query('UPDATE polls SET total_votes=total_votes+1 WHERE id=$1', [req.params.id]);
      });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Already voted' });
      throw e;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
