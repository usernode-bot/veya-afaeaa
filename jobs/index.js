'use strict';
const liquidations = require('./liquidations');
const funding = require('./funding');

let started = false;

function start(pool) {
  if (started) return;
  started = true;
  liquidations.start(pool);
  funding.start(pool);

  // Cleanup idempotency keys older than 24h
  setInterval(async () => {
    try {
      await pool.query(`DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'`);
    } catch {}
  }, 3600000);

  console.log('[jobs] Background jobs started');
}

module.exports = { start };
