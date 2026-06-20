const { pool } = require('./db');

async function getUserProfile(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_profiles WHERE user_id = $1', [userId]
  );
  return rows[0];
}

function requireTier(minTier) {
  return async (req, res, next) => {
    try {
      const profile = req.profile || await getUserProfile(req.user.id);
      if (!profile || profile.verification_tier < minTier) {
        return res.status(403).json({ error: 'Insufficient verification tier', required: minTier });
      }
      req.profile = profile;
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

async function requireAdmin(req, res, next) {
  try {
    const profile = req.profile || await getUserProfile(req.user && req.user.id);
    if (!profile || !profile.is_admin) {
      if (req.path.startsWith('/api') || req.xhr || req.headers.accept === 'application/json') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      return res.status(403).send('<html><body style="font-family:system-ui;padding:2rem"><h1>403 Forbidden</h1><p>Admin access required.</p></body></html>');
    }
    req.profile = profile;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function requireNotBanned(req, res, next) {
  try {
    const profile = req.profile || await getUserProfile(req.user.id);
    if (profile && profile.is_banned) {
      return res.status(403).json({ error: 'Account is banned' });
    }
    req.profile = profile;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function auditLog(req, action, entityType, entityId, metadata) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, metadata, ip_addr)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user && req.user.id, req.user && req.user.username, action,
       entityType || null, entityId ? String(entityId) : null,
       JSON.stringify(metadata || {}), req.ip || null]
    );
  } catch {}
}

module.exports = { requireTier, requireAdmin, requireNotBanned, auditLog };
