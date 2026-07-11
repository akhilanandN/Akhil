const nodemailer = require('nodemailer');
const { generateOrderPdf } = require('./generateOrderPdf');
require('dotenv').config();

// ---- Email notification (works today, free via Gmail) ----
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_APP_PASSWORD,
  },
});

async function sendOrderEmail(order) {
  const itemsList = order.items
    .map(i => `  • ${i.name} x${i.qty} — ₹${(i.price * i.qty).toFixed(2)}`)
    .join('\n');

  const text = `New order received on Aayilyam Stores!

Order ID: ${order.id}
Customer: ${order.customer_name || 'Guest'}
Phone: ${order.customer_phone || '-'}
Address: ${order.delivery_address || '-'}
Payment: ${order.payment_method} (${order.payment_status})

Items:
${itemsList}

Total: ₹${order.total}
`;

  try {
    const pdfBuffer = await generateOrderPdf(order);
    await transporter.sendMail({
      from: `"Aayilyam Stores Website" <${process.env.SMTP_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `🛒 New order ${order.id} — ₹${order.total}`,
      text,
      attachments: [
        { filename: `Order-${order.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
      ],
    });
    console.log(`Order email (with PDF) sent for ${order.id}`);
  } catch (err) {
    // Don't let a failed notification break order placement — just log it.
    console.error('Failed to send order email:', err.message);
  }
}

// ---- Customer order confirmation email ----
// Sent to the customer's own email (captured at checkout) right after their
// order is saved. Skips quietly if we don't have an email for this order —
// e.g. very old orders placed before this field existed.
async function sendCustomerConfirmationEmail(order) {
  if (!order.customer_email) {
    console.log(`No customer email on order ${order.id} — skipping confirmation email.`);
    return;
  }

  const itemsList = order.items
    .map(i => `  • ${i.name} x${i.qty} — ₹${(i.price * i.qty).toFixed(2)}`)
    .join('\n');

  const trackingLine = order.tracking_code ? `Tracking Code: ${order.tracking_code}\n` : '';

  const text = `Hi ${order.customer_name || 'there'},

Thank you for shopping with Aayilyam Stores! Your order has been placed successfully.

Order ID: ${order.id}
${trackingLine}Payment: ${order.payment_method} (${order.payment_status})
${order.delivery_address ? `Delivery Address: ${order.delivery_address}` : 'Delivery: Store Pickup'}

Items:
${itemsList}

Total: ₹${order.total}

${order.delivery_address
  ? 'Estimated Delivery: 1-2 business days, depending on your location and product availability.'
  : 'Estimated Pickup: Ready within a few hours \u2014 we\'ll notify you once it\'s packed and waiting at the store.'}

We'll notify you as your order moves along. You can also track it anytime using
the "My Orders" section on our website.

— Aayilyam Stores, Velur
`;

  try {
    await transporter.sendMail({
      from: `"Aayilyam Stores" <${process.env.SMTP_EMAIL}>`,
      to: order.customer_email,
      subject: `✅ Your Aayilyam Stores order is confirmed — Order ${order.id}`,
      text,
    });
    console.log(`Confirmation email sent to customer for order ${order.id}`);
  } catch (err) {
    // Don't let a failed confirmation email break order placement — just log it.
    console.error('Failed to send customer confirmation email:', err.message);
  }
}

// ---- WhatsApp notification to admin (via CallMeBot's free WhatsApp API) ----
// CallMeBot is a free service built exactly for this: sending automated
// WhatsApp alerts to YOUR OWN phone (not for messaging customers/marketing —
// it's rate-limited and only works for a number that's opted in once).
// No business account, no verification, no cost.
//
// One-time setup (do this from the admin's own WhatsApp):
//   1. Save +34 644 59 71 07 as a contact (e.g. "CallMeBot").
//   2. Send it this exact WhatsApp message: "I allow callmebot to send me messages"
//   3. Within a minute you'll get a reply back with your personal API key.
//   4. Set these two environment variables on Render:
//        ADMIN_WHATSAPP_NUMBER = your number with country code, no + or spaces
//                                 (e.g. 919744756758)
//        CALLMEBOT_APIKEY      = the key CallMeBot texted you
async function sendOrderWhatsApp(order) {
  const phone = process.env.ADMIN_WHATSAPP_NUMBER;
  const apikey = process.env.CALLMEBOT_APIKEY;

  if (!phone || !apikey) {
    console.log(`[WhatsApp not configured] Order ${order.id} placed — ₹${order.total}. Set ADMIN_WHATSAPP_NUMBER and CALLMEBOT_APIKEY to enable.`);
    return;
  }

  const itemsList = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
  const message = `🛒 New Aayilyam Stores order!\n` +
    `Order ID: ${order.id}\n` +
    `Customer: ${order.customer_name || 'Guest'} (${order.customer_phone || '-'})\n` +
    `Items: ${itemsList}\n` +
    `Total: ₹${order.total}\n` +
    `Payment: ${order.payment_method} (${order.payment_status})\n` +
    `${order.delivery_address ? `Address: ${order.delivery_address}` : 'Store Pickup'}`;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    const res = await fetch(url);
    const body = await res.text();
    console.log(`WhatsApp admin alert sent for order ${order.id}: ${body}`);
  } catch (err) {
    // Don't let a failed WhatsApp alert break order placement — just log it.
    console.error('Failed to send WhatsApp admin alert:', err.message);
  }
}

async function notifyNewOrder(order) {
  await sendOrderEmail(order);
  await sendCustomerConfirmationEmail(order);
  await sendOrderWhatsApp(order);
}

module.exports = { notifyNewOrder };
