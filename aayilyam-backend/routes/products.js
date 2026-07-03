const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const requireAdmin = require('../middleware/adminAuth');

// GET /api/products  — public, supports ?category= and ?search=
router.get('/', async (req, res) => {
  const { category, search } = req.query;
  let query = supabase.from('products').select('*').eq('active', true);
  if (category) query = query.eq('category_id', category);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/products  — admin only
router.post('/', requireAdmin, async (req, res) => {
  const { name, category_id, price, old_price, icon, stock } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price are required' });

  const { data, error } = await supabase
    .from('products')
    .insert([{ name, category_id, price, old_price, icon, stock }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// PUT /api/products/:id  — admin only
router.put('/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .update(req.body)
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// DELETE /api/products/:id  — admin only (soft delete)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('products')
    .update({ active: false })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
