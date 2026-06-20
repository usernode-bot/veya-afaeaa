'use strict';
const INTERVAL_MS = 60 * 1000;

function start(pool) {
  async function run() {
    try {
      const liqThresholdRow = await pool.query(`SELECT value FROM app_config WHERE key='futures_liquidation_threshold'`);
      const liqThreshold = parseFloat(liqThresholdRow.rows[0]?.value || 0.05);

      const { rows: positions } = await pool.query(
        `SELECT fp.*, fm.mark_price AS current_mark_price
         FROM futures_positions fp
         JOIN futures_markets fm ON fm.symbol=fp.symbol
         WHERE fp.status='open' AND fm.paused=FALSE`
      );

      for (const pos of positions) {
        try {
          const markPrice = parseFloat(pos.current_mark_price);
          const entryPrice = parseFloat(pos.entry_price);
          const size = parseFloat(pos.size);
          const margin = parseFloat(pos.margin);

          const upnl = pos.direction === 'long'
            ? (markPrice - entryPrice) * size
            : (entryPrice - markPrice) * size;

          const posValue = size * markPrice;
          const marginRatio = posValue > 0 ? (margin + upnl) / posValue : 0;

          await pool.query(
            `UPDATE futures_positions SET mark_price=$1, unrealized_pnl=$2 WHERE id=$3`,
            [markPrice, upnl.toFixed(8), pos.id]
          );

          if (marginRatio < liqThreshold) {
            const loss = -margin;
            await pool.query(
              `UPDATE futures_positions SET status='liquidated', closed_at=NOW(), realized_pnl=$1, unrealized_pnl=0 WHERE id=$2`,
              [loss.toFixed(8), pos.id]
            );
            await pool.query(
              `INSERT INTO futures_liquidations (position_id, user_id, symbol, size, entry_price, liquidation_price, loss)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [pos.id, pos.user_id, pos.symbol, size, entryPrice, markPrice, Math.abs(loss).toFixed(8)]
            );
            await pool.query(
              `INSERT INTO notifications (user_id, type, title, body)
               VALUES ($1,'liquidation','Position Liquidated','Your ${pos.direction} ${pos.symbol} position was liquidated at $${markPrice.toFixed(2)}. Loss: $${Math.abs(loss).toFixed(2)}')`,
              [pos.user_id]
            );
            if (pos.mode === 'live') {
              await pool.query(
                `UPDATE user_profiles SET veya_balance=veya_balance+$1 WHERE user_id=$2`,
                [loss.toFixed(8), pos.user_id]
              );
            }
          }
        } catch {}
      }
    } catch {}
  }

  setInterval(run, INTERVAL_MS);
  setTimeout(run, 5000);
}

module.exports = { start };
