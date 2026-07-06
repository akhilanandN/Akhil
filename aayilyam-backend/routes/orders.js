const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const razorpay = require('../utils/razorpayClient');
const requireAdmin = require('../middleware/adminAuth');
const { notifyNewOrder } = require('../utils/notify');

// Recalculate the total server-side from the DB — never trust prices sent
// from the browser, since anyone can edit client-side JavaScript.
async function calculateVerifiedTotal(items) {
  const ids = items.map(i => i.product_id);
  const { data: products, error } = await supabase.from('products').select('id, name, price').in('id', ids);
  if (error) throw new Error(error.message);

  let total = 0;
  const verifiedItems = items.map(i => {
    const product = products.find(p => p.id === i.product_id);
    if (!product) throw new Error(`Product ${i.product_id} not found`);
    total += product.price * i.qty;
    return { product_id: product.id, name: product.name, price: product.price, qty: i.qty };
  });
  return { total: Math.round(total * 100) / 100, verifiedItems };
}

// ---------------------------------------------------------------
// STEP 1 — Customer checks out with "Pay Online"
// Frontend calls this first to get a Razorpay order to open Checkout with.
// ---------------------------------------------------------------
router.post('/create-payment', async (req, res) => {
  try {
    const { items, customer_name, customer_phone, delivery_address, customer_id } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });

    const { total, verifiedItems } = await calculateVerifiedTotal(items);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total * 100), // paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    });

    // Save the order as "pending" now; we mark it "paid" once payment is verified.
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        customer_id: customer_id || null,
        customer_name, customer_phone, delivery_address,
        items: verifiedItems,
        total,
        payment_method: 'razorpay',
        payment_status: 'pending',
        razorpay_order_id: razorpayOrder.id,
      }])
      .select();
    if (error) throw new Error(error.message);

    res.json({
      order_db_id: data[0].id,
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID, // safe to expose — it's the public key
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// STEP 2 — After Razorpay Checkout succeeds in the browser, frontend
// sends back the payment details here so we can verify them are genuine.
// ---------------------------------------------------------------
router.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ payment_status: 'paid', razorpay_payment_id })
      .eq('razorpay_order_id', razorpay_order_id)
      .select();
    if (error) throw new Error(error.message);

    await notifyNewOrder(data[0]);
    res.json({ success: true, order: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// ALTERNATIVE (recommended in addition to Step 2) — Razorpay webhook.
// More reliable than relying on the browser to report back, because it
// fires directly from Razorpay's servers even if the customer closes the
// tab right after paying. Set this URL in Razorpay Dashboard → Webhooks.
// ---------------------------------------------------------------
router.post('/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    if (signature !== expected) return res.status(400).json({ error: 'Invalid webhook signature' });

    const payload = JSON.parse(req.body);
    if (payload.event === 'payment.captured') {
      const razorpayOrderId = payload.payload.payment.entity.order_id;
      const { data, error } = await supabase
        .from('orders')
        .update({ payment_status: 'paid' })
        .eq('razorpay_order_id', razorpayOrderId)
        .select();
      if (!error && data[0]) await notifyNewOrder(data[0]);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// Cash on delivery / WhatsApp order — no payment gateway involved.
// ---------------------------------------------------------------
router.post('/create-cod', async (req, res) => {
  try {
    const { items, customer_name, customer_phone, delivery_address, customer_id, payment_method } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });

    const { total, verifiedItems } = await calculateVerifiedTotal(items);

    const { data, error } = await supabase
      .from('orders')
      .insert([{
        customer_id: customer_id || null,
        customer_name, customer_phone, delivery_address,
        items: verifiedItems,
        total,
        payment_method: payment_method || 'cod',
        payment_status: 'pending',
      }])
      .select();
    if (error) throw new Error(error.message);

    await notifyNewOrder(data[0]);
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------
// Customer order tracking — by order ID
// ---------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Order not found' });
  res.json(data);
});

// ---------------------------------------------------------------
// Customer order tracking — by phone number (easier to remember than
// an order ID). Returns the customer's single most recent order.
// ---------------------------------------------------------------
router.get('/track/by-phone/:phone', async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_phone', req.params.phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'No order found for this phone number' });
  res.json(data);
});

// ---------------------------------------------------------------
// Admin — view all orders, update status
// ---------------------------------------------------------------
router.get('/', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body; // 'placed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled'
  const { data, error } = await supabase.from('orders').update({ status }).eq('id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

module.exports = router;
