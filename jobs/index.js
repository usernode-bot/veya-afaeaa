const liquidations = require('./liquidations');
const funding = require('./funding');

let started = false;

function start(pool) {
  if (started) return;
  started = true;
  liquidations.start(pool);
  funding.start(pool);
  console.log('[jobs] Background jobs started');
}

module.exports = { start };
