const INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours

function start(pool) {
  const run = async () => {
    try {
      const { rows: markets } = await pool.query('SELECT * FROM futures_markets WHERE is_active=TRUE');
      for (const market of markets) {
        const fundingRate = parseFloat(market.funding_rate || 0);
        if (fundingRate === 0) continue;
        const { rows: positions } = await pool.query(
          `SELECT * FROM futures_positions WHERE market_symbol=$1 AND status='open' AND is_paper_trade=FALSE`,
          [market.symbol]
        );
        for (const pos of positions) {
          const notional = pos.size * parseFloat(market.mark_price);
          let payment = notional * Math.abs(fundingRate);
          // Long pays short when funding is positive; short pays long when negative
          if ((pos.side === 'long' && fundingRate > 0) || (pos.side === 'short' && fundingRate < 0)) {
            payment = -payment; // user pays
          }
          if (payment !== 0) {
            await pool.query(
              `UPDATE user_profiles SET veya_balance=veya_balance+$1 WHERE user_id=$2`,
              [payment, pos.user_id]
            );
          }
        }
      }
      console.log('[funding] Funding payments applied');
    } catch (err) {
      console.error('[funding] Error:', err.message);
    }
  };
  // Run once at startup after a delay, then every 8h
  setTimeout(() => {
    run();
    setInterval(run, INTERVAL_MS);
  }, 5000);
}

module.exports = { start };
