const INTERVAL_MS = 60 * 1000; // 60 seconds

function start(pool) {
  const run = async () => {
    try {
      const { rows: positions } = await pool.query(
        `SELECT fp.*, fm.mark_price FROM futures_positions fp
         JOIN futures_markets fm ON fm.symbol=fp.market_symbol
         WHERE fp.status='open' AND fp.is_paper_trade=FALSE`
      );
      for (const pos of positions) {
        const markPrice = parseFloat(pos.mark_price);
        const entryPrice = parseFloat(pos.entry_price);
        const liqPrice = parseFloat(pos.liquidation_price);
        let isLiquidated = false;
        if (pos.side === 'long' && markPrice <= liqPrice) isLiquidated = true;
        if (pos.side === 'short' && markPrice >= liqPrice) isLiquidated = true;
        if (!isLiquidated) {
          const unrealizedPnl = pos.side === 'long'
            ? (markPrice - entryPrice) * pos.size
            : (entryPrice - markPrice) * pos.size;
          await pool.query(
            'UPDATE futures_positions SET mark_price=$1, unrealized_pnl=$2 WHERE id=$3',
            [markPrice, unrealizedPnl, pos.id]
          );
        } else {
          await pool.query(
            `UPDATE futures_positions SET status='liquidated', closed_at=NOW(), realized_pnl=$1, unrealized_pnl=0 WHERE id=$2`,
            [-pos.margin, pos.id]
          );
          await pool.query(
            `INSERT INTO futures_trades (position_id,user_id,market_symbol,side,size,price,fee,is_paper_trade,realized_pnl,created_at)
             VALUES ($1,$2,$3,'liquidation',$4,$5,$6,FALSE,$7,NOW())`,
            [pos.id, pos.user_id, pos.market_symbol, pos.size, markPrice, 0, -pos.margin]
          );
          await pool.query(
            `INSERT INTO notifications (user_id,type,title,body)
             VALUES ($1,'liquidation','Position Liquidated','Your ${pos.side} ${pos.market_symbol} position was liquidated at $${markPrice.toFixed(2)}')`,
            [pos.user_id]
          );
          console.log(`[liquidations] Liquidated position ${pos.id} for user ${pos.user_id}`);
        }
      }
      // Also update paper trade positions
      const { rows: paperPos } = await pool.query(
        `SELECT fp.*, fm.mark_price FROM futures_positions fp
         JOIN futures_markets fm ON fm.symbol=fp.market_symbol
         WHERE fp.status='open' AND fp.is_paper_trade=TRUE`
      );
      for (const pos of paperPos) {
        const markPrice = parseFloat(pos.mark_price);
        const entryPrice = parseFloat(pos.entry_price);
        const liqPrice = parseFloat(pos.liquidation_price);
        let isLiquidated = (pos.side === 'long' && markPrice <= liqPrice) || (pos.side === 'short' && markPrice >= liqPrice);
        if (!isLiquidated) {
          const unrealizedPnl = pos.side === 'long'
            ? (markPrice - entryPrice) * pos.size
            : (entryPrice - markPrice) * pos.size;
          await pool.query('UPDATE futures_positions SET mark_price=$1, unrealized_pnl=$2 WHERE id=$3', [markPrice, unrealizedPnl, pos.id]);
        } else {
          await pool.query(
            `UPDATE futures_positions SET status='liquidated', closed_at=NOW(), realized_pnl=$1, unrealized_pnl=0 WHERE id=$2`,
            [-pos.margin, pos.id]
          );
        }
      }
    } catch (err) {
      console.error('[liquidations] Error:', err.message);
    }
  };
  run();
  setInterval(run, INTERVAL_MS);
}

module.exports = { start };
