const { Router } = require('express');
const { pool } = require('../lib/db');
const router = Router();

router.get('/user/me', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM user_profiles WHERE user_id=$1', [req.user.id]);
    const profile = rows[0] || { user_id: req.user.id, username: req.user.username, verification_tier: 0 };
    const unread = await pool.query('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read=FALSE', [req.user.id]);
    res.json({ user: { ...profile, unread_notifications: parseInt(unread.rows[0].count) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/profile/:username', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT user_id,username,display_name,bio,verification_tier,is_verified,veya_balance,follower_count,following_count,created_at FROM user_profiles WHERE username=$1',
      [req.params.username]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const posts = await pool.query('SELECT COUNT(*) FROM posts WHERE user_id=$1', [rows[0].user_id]);
    res.json({ user: { ...rows[0], post_count: parseInt(posts.rows[0].count) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/user/profile', async (req, res) => {
  try {
    const { display_name, bio } = req.body;
    const dn = display_name ? String(display_name).trim().slice(0, 100) : null;
    const b = bio ? String(bio).trim().slice(0, 500) : null;
    await pool.query(
      `UPDATE user_profiles SET display_name=COALESCE($1,display_name), bio=COALESCE($2,bio), updated_at=NOW() WHERE user_id=$3`,
      [dn, b, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ notifications: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (ids.length) {
      await pool.query(
        `UPDATE notifications SET read=TRUE WHERE user_id=$1 AND id=ANY($2)`,
        [req.user.id, ids]
      );
    } else {
      await pool.query('UPDATE notifications SET read=TRUE WHERE user_id=$1', [req.user.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
