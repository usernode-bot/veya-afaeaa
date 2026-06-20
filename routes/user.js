'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const router = Router();

router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM user_profiles WHERE user_id=$1', [req.user.id]);
    const notif = await pool.query('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read=FALSE', [req.user.id]);
    res.json({ profile: rows[0] || { user_id: req.user.id, username: req.user.username, verification_tier: 0 }, unread_count: parseInt(notif.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/profile/:username', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT user_id,username,display_name,bio,avatar_url,verification_tier,is_verified,follower_count,following_count,created_at FROM user_profiles WHERE username=$1',
      [req.params.username]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const posts = await pool.query('SELECT * FROM posts WHERE username=$1 ORDER BY created_at DESC LIMIT 20', [req.params.username]);
    res.json({ profile: rows[0], posts: posts.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/profile', async (req, res) => {
  try {
    const display_name = String(req.body.display_name || '').trim().slice(0, 128);
    const bio = String(req.body.bio || '').trim().slice(0, 500);
    const { rows } = await pool.query(
      `UPDATE user_profiles SET display_name=$1, bio=$2, updated_at=NOW() WHERE user_id=$3 RETURNING *`,
      [display_name || null, bio || null, req.user.id]
    );
    res.json({ profile: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/notifications', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [req.user.id, limit]);
    res.json({ notifications: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    if (ids.length) {
      await pool.query('UPDATE notifications SET read=TRUE WHERE user_id=$1 AND id=ANY($2)', [req.user.id, ids]);
    } else {
      await pool.query('UPDATE notifications SET read=TRUE WHERE user_id=$1', [req.user.id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
