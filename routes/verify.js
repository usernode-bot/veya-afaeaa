const { Router } = require('express');
const { pool } = require('../lib/db');
const router = Router();

router.get('/verify/status', async (req, res) => {
  try {
    const prof = await pool.query('SELECT verification_tier,is_verified FROM user_profiles WHERE user_id=$1', [req.user.id]);
    const ver = await pool.query('SELECT * FROM user_verifications WHERE user_id=$1', [req.user.id]);
    res.json({
      tier: prof.rows[0]?.verification_tier || 0,
      is_verified: prof.rows[0]?.is_verified || false,
      verification: ver.rows[0] || null,
      base_verify_available: !!process.env.BASE_VERIFY_API_KEY,
      zkpassport_available: !!process.env.ZKPASSPORT_DOMAIN,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify/social/start', async (req, res) => {
  try {
    const apiKey = process.env.BASE_VERIFY_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Base Verify not configured', coming_soon: true });
    // Stub: return mock OAuth URL when key is a test value
    const url = `https://verify.base.dev/oauth?client_id=veya&redirect_uri=${encodeURIComponent('https://veya.app/verify/callback')}&state=${req.user.id}`;
    res.json({ url, message: 'Redirect user to this URL to complete social verification' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify/social/complete', async (req, res) => {
  try {
    const apiKey = process.env.BASE_VERIFY_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Base Verify not configured', coming_soon: true });
    const { code, state } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const anti_sybil_token = `bv_${req.user.id}_${Date.now()}`;
    const provider = req.body.provider || 'base';
    try {
      await pool.query(
        `INSERT INTO user_verifications (user_id,anti_sybil_token,social_provider,social_verified_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (user_id) DO UPDATE SET anti_sybil_token=$2, social_provider=$3, social_verified_at=NOW()`,
        [req.user.id, anti_sybil_token, provider]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(403).json({ error: 'This social account is already linked to another wallet' });
      throw e;
    }
    await pool.query('UPDATE user_profiles SET verification_tier=GREATEST(verification_tier,1), updated_at=NOW() WHERE user_id=$1', [req.user.id]);
    await pool.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'tier_upgrade','Social tier unlocked 🥈','You have completed Social verification and unlocked new features!')`,
      [req.user.id]
    );
    res.json({ ok: true, tier: 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify/passport/start', async (req, res) => {
  try {
    const domain = process.env.ZKPASSPORT_DOMAIN;
    if (!domain) return res.status(503).json({ error: 'zkPassport not configured', coming_soon: true });
    let ZKPassport;
    try { ZKPassport = require('@zkpassport/sdk').ZKPassport; } catch {
      return res.status(503).json({ error: 'zkPassport SDK not installed', coming_soon: true });
    }
    const zkPassport = new ZKPassport(domain);
    const queryBuilder = await zkPassport.request({
      name: 'Veya',
      logo: `https://${domain}/logo.png`,
      purpose: 'Prove you are a unique real human aged 18+ for Premium access',
      scope: 'veya-premium-verification',
    });
    const { url, requestId } = queryBuilder.gte('age', 18).done();
    await pool.query(
      `INSERT INTO zkpassport_requests (request_id,user_id,status,created_at,updated_at) VALUES ($1,$2,'pending',NOW(),NOW())
       ON CONFLICT (request_id) DO NOTHING`,
      [requestId, req.user.id]
    );
    res.json({ url, requestId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/verify/passport/status/:requestId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM zkpassport_requests WHERE request_id=$1 AND user_id=$2',
      [req.params.requestId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
    const request = rows[0];
    if (request.status === 'verified') {
      return res.json({ status: 'verified', tier: 2 });
    }
    if (request.status === 'failed') {
      return res.json({ status: 'failed' });
    }
    res.json({ status: request.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Internal callback for zkPassport proof results
router.post('/verify/passport/callback', async (req, res) => {
  try {
    const { requestId, verified, uniqueIdentifier, age } = req.body;
    if (!requestId || !verified) {
      await pool.query('UPDATE zkpassport_requests SET status=$1,updated_at=NOW() WHERE request_id=$2', ['failed', requestId]);
      return res.json({ ok: true });
    }
    const reqRow = await pool.query('SELECT user_id FROM zkpassport_requests WHERE request_id=$1', [requestId]);
    if (!reqRow.rows[0]) return res.status(404).json({ error: 'Request not found' });
    const userId = reqRow.rows[0].user_id;
    try {
      await pool.query(
        `INSERT INTO user_verifications (user_id,zkpassport_identifier,zkpassport_age_verified,zkpassport_verified_at)
         VALUES ($1,$2,TRUE,NOW())
         ON CONFLICT (user_id) DO UPDATE SET zkpassport_identifier=$2, zkpassport_age_verified=TRUE, zkpassport_verified_at=NOW()`,
        [userId, uniqueIdentifier]
      );
    } catch (e) {
      if (e.code === '23505') {
        await pool.query('UPDATE zkpassport_requests SET status=$1,updated_at=NOW() WHERE request_id=$2', ['failed', requestId]);
        return res.status(403).json({ error: 'Passport already linked to another account' });
      }
      throw e;
    }
    await pool.query('UPDATE zkpassport_requests SET status=$1,result_data=$2,updated_at=NOW() WHERE request_id=$3', ['verified', JSON.stringify({ age, uniqueIdentifier }), requestId]);
    await pool.query('UPDATE user_profiles SET verification_tier=2, is_verified=TRUE, updated_at=NOW() WHERE user_id=$1', [userId]);
    await pool.query(
      `INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'tier_upgrade','Premium tier unlocked 🥇','You have completed zkPassport verification and unlocked all premium features!')`,
      [userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
