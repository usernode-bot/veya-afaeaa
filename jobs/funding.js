'use strict';
const INTERVAL_MS = 8 * 60 * 60 * 1000;

function start(pool) {
  async function run() {
    try {
      const { rows: positions } = await pool.query(
        `SELECT fp.*, fm.funding_rate, fm.mark_price AS current_mark
         FROM futures_positions fp
         JOIN futures_markets fm ON fm.symbol=fp.symbol
         WHERE fp.status='open'`
      );

      for (const pos of positions) {
        try {
          const rate = parseFloat(pos.funding_rate);
          if (rate === 0) continue;
          const mark = parseFloat(pos.current_mark);
          const size = parseFloat(pos.size);
          const notional = size * mark;
          let payment = notional * Math.abs(rate);

          // Long pays when rate > 0; short pays when rate < 0
          if ((pos.direction === 'long' && rate > 0) || (pos.direction === 'short' && rate < 0)) {
            payment = -payment;
          }

          await pool.query(
            `INSERT INTO futures_funding_payments (position_id, user_id, symbol, rate, payment) VALUES ($1,$2,$3,$4,$5)`,
            [pos.id, pos.user_id, pos.symbol, rate, payment.toFixed(8)]
          );

          if (pos.mode === 'live' && payment !== 0) {
            await pool.query(
              `UPDATE user_profiles SET veya_balance=veya_balance+$1 WHERE user_id=$2`,
              [payment.toFixed(8), pos.user_id]
            );
          }
        } catch {}
      }
    } catch {}
  }

  setInterval(run, INTERVAL_MS);
  setTimeout(run, 30000);
}

module.exports = { start };
