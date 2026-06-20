const { Router } = require('express');
const { pool } = require('../lib/db');
const router = Router();

router.get('/nfts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nfts ORDER BY created_at DESC LIMIT 50');
    res.json({ nfts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nfts/mint', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 255);
    const description = String(req.body.description || '').trim().slice(0, 1000);
    const price = parseFloat(req.body.price) || 0;
    const tx_hash = req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : `0xmint_${Date.now()}_${req.user.id}`;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const token_id = `veya_nft_${req.user.id}_${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO nfts (token_id,owner_id,owner_username,name,description,price,tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [token_id, req.user.id, req.user.username, name, description, price, tx_hash]
    );
    res.json({ nft: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Transaction already processed' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/nfts/buy', async (req, res) => {
  try {
    const nftId = parseInt(req.body.nft_id);
    const tx_hash = req.body.tx_hash ? String(req.body.tx_hash).slice(0, 255) : `0xbuy_${Date.now()}_${req.user.id}`;
    const { rows } = await pool.query('SELECT * FROM nfts WHERE id=$1', [nftId]);
    if (!rows[0]) return res.status(404).json({ error: 'NFT not found' });
    if (rows[0].owner_id === req.user.id) return res.status(400).json({ error: 'Already owned' });
    await pool.query(
      'UPDATE nfts SET owner_id=$1, owner_username=$2 WHERE id=$3',
      [req.user.id, req.user.username, nftId]
    );
    res.json({ ok: true, nft_id: nftId, tx_hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
