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

// Generates a random, hard-to-guess tracking code for customer order lookup
// (e.g. "7XQ9K3PL"). We deliberately avoid using the customer's phone
// number for tracking, since phone numbers aren't secret — a neighbor could
// type someone else's number and see their order. This code is only ever
// shown to the person who placed that specific order.
function generateTrackingCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I/L
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
  return code;
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
    const trackingCode = generateTrackingCode();
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
        tracking_code: trackingCode,
      }])
      .select();
    if (error) throw new Error(error.message);

    res.json({
      order_db_id: data[0].id,
      tracking_code: data[0].tracking_code,
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

    const trackingCode = generateTrackingCode();
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        customer_id: customer_id || null,
        customer_name, customer_phone, delivery_address,
        items: verifiedItems,
        total,
        payment_method: payment_method || 'cod',
        payment_status: 'pending',
        tracking_code: trackingCode,
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
// Only exposes non-sensitive fields (status/total/date) — never the
// customer's name, phone, or delivery address — since this endpoint has
// no login and the ID alone shouldn't reveal personal details.
// ---------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total, payment_method, created_at')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Order not found' });
  res.json(data);
});

// ---------------------------------------------------------------
// Customer order tracking — by secret tracking code.
// We intentionally do NOT support looking orders up by phone number —
// phone numbers aren't secret (a neighbor could know or guess one), so
// that would let anyone see a stranger's order. The tracking code is a
// random 8-character string only ever shown to the person who placed
// that specific order, making it effectively unguessable.
// ---------------------------------------------------------------
router.get('/track/by-code/:code', async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total, payment_method, created_at, tracking_code')
    .eq('tracking_code', req.params.code.toUpperCase())
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'No order found for this tracking code' });
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
