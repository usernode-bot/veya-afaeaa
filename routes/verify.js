'use strict';
const { Router } = require('express');
const { pool } = require('../lib/db');
const router = Router();

router.get('/verify/status', async (req, res) => {
  try {
    const profile = await pool.query('SELECT verification_tier FROM user_profiles WHERE user_id=$1', [req.user.id]);
    const verif = await pool.query('SELECT * FROM user_verifications WHERE user_id=$1', [req.user.id]);
    res.json({ tier: profile.rows[0]?.verification_tier || 0, verification: verif.rows[0] || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify/social/start', async (req, res) => {
  try {
    if (!process.env.BASE_VERIFY_API_KEY) {
      return res.status(503).json({ message: 'Base Verify not configured', coming_soon: true });
    }
    const challengeUrl = `https://verify.base.dev/oauth?client_id=${process.env.BASE_VERIFY_API_KEY}&redirect_uri=${encodeURIComponent('https://veya.app/verify/callback')}&state=${req.user.id}`;
    res.json({ url: challengeUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify/social/complete', async (req, res) => {
  try {
    const { code, provider } = req.body;
    if (!code) return res.status(400).json({ error: 'OAuth code required' });
    if (!process.env.BASE_VERIFY_API_KEY) {
      return res.status(503).json({ message: 'Base Verify not configured', coming_soon: true });
    }
    const token = `bv_${req.user.id}_${provider || 'social'}_${Date.now()}`;
    try {
      await pool.query(
        `INSERT INTO user_verifications (user_id, anti_sybil_token, social_provider, social_verified_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (user_id) DO UPDATE SET anti_sybil_token=$2, social_provider=$3, social_verified_at=NOW()`,
        [req.user.id, token, provider || 'base_verify']
      );
    } catch (e) {
      if (e.code === '23505') return res.status(403).json({ error: 'Social account already linked to another wallet' });
      throw e;
    }
    await pool.query('UPDATE user_profiles SET verification_tier=GREATEST(verification_tier,1) WHERE user_id=$1', [req.user.id]);
    await pool.query(`INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'tier_upgrade','Social tier unlocked 🥈','You have been verified as Social tier. Create markets, participate in ICOs, and trade live futures up to 10x leverage.')`, [req.user.id]);
    res.json({ ok: true, tier: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify/passport/start', async (req, res) => {
  try {
    if (!process.env.ZKPASSPORT_DOMAIN) {
      return res.status(503).json({ message: 'zkPassport not configured', coming_soon: true });
    }
    let ZKPassport;
    try { ({ ZKPassport } = require('@zkpassport/sdk')); } catch {
      return res.status(503).json({ message: 'zkPassport SDK not available', coming_soon: true });
    }
    const zkPassport = new ZKPassport(process.env.ZKPASSPORT_DOMAIN);
    const queryBuilder = await zkPassport.request({
      name: 'Veya',
      logo: 'https://veya.app/logo.png',
      purpose: 'Prove you are a unique real human aged 18+ for Premium access',
      scope: 'veya-premium-verification',
    });
    const { url, requestId } = queryBuilder.gte('age', 18).done();
    await pool.query(
      `INSERT INTO zkpassport_requests (request_id, user_id, status) VALUES ($1,$2,'pending')
       ON CONFLICT (request_id) DO NOTHING`,
      [requestId, req.user.id]
    );
    res.json({ url, requestId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/verify/passport/status/:requestId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM zkpassport_requests WHERE request_id=$1 AND user_id=$2', [req.params.requestId, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
    if (rows[0].status === 'verified') {
      const result = rows[0].result_data;
      const identifier = result?.uniqueIdentifier;
      if (identifier) {
        try {
          await pool.query(
            `INSERT INTO user_verifications (user_id, zkpassport_identifier, zkpassport_age_verified, zkpassport_verified_at)
             VALUES ($1,$2,TRUE,NOW())
             ON CONFLICT (user_id) DO UPDATE SET zkpassport_identifier=$2, zkpassport_age_verified=TRUE, zkpassport_verified_at=NOW()`,
            [req.user.id, identifier]
          );
        } catch (e) {
          if (e.code === '23505') return res.status(403).json({ error: 'Passport already linked to another account' });
          throw e;
        }
        await pool.query('UPDATE user_profiles SET verification_tier=GREATEST(verification_tier,2), is_verified=TRUE WHERE user_id=$1', [req.user.id]);
        await pool.query(`INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'tier_upgrade','Premium tier unlocked 🥇','zkPassport verified! You now have Premium access: 50x futures leverage, LP creation, and highest ICO allocation.')`, [req.user.id]);
      }
    }
    res.json({ status: rows[0].status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify/passport/callback', async (req, res) => {
  try {
    const { requestId, verified, result } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });
    await pool.query(
      `UPDATE zkpassport_requests SET status=$1, result_data=$2, updated_at=NOW() WHERE request_id=$3`,
      [verified ? 'verified' : 'failed', JSON.stringify(result || {}), requestId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
