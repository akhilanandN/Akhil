const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const requireAdmin = require('../middleware/adminAuth');

// GET /api/categories — public
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/categories — admin only
router.post('/', requireAdmin, async (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabase
    .from('categories')
    .insert([{ name, icon: icon || '🛒' }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// DELETE /api/categories/:id — admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
