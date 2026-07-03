const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const requireAdmin = require('../middleware/adminAuth');

// GET /api/offers — public
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('offers').select('*').eq('active', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/offers — admin only
router.post('/', requireAdmin, async (req, res) => {
  const { title, pct, description, code } = req.body;
  if (!title || !pct) return res.status(400).json({ error: 'title and pct are required' });

  const { data, error } = await supabase
    .from('offers')
    .insert([{ title, pct, description, code }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// DELETE /api/offers/:id — admin only (soft delete)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('offers').update({ active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
