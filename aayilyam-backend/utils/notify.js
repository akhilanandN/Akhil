const nodemailer = require('nodemailer');
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
    await transporter.sendMail({
      from: `"Aayilyam Stores Website" <${process.env.SMTP_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `🛒 New order ${order.id} — ₹${order.total}`,
      text,
    });
    console.log(`Order email sent for ${order.id}`);
  } catch (err) {
    // Don't let a failed notification break order placement — just log it.
    console.error('Failed to send order email:', err.message);
  }
}

// ---- WhatsApp notification (stub — activate when you're ready) ----
// To make this real, sign up with a WhatsApp Business API provider such as
// Interakt, Gupshup, or Meta's own Cloud API, then replace the body of this
// function with a call to their "send template message" endpoint, e.g.:
//
//   await axios.post('https://api.gupshup.io/wa/api/v1/msg', {
//     channel: 'whatsapp',
//     source: 'YOUR_WHATSAPP_BUSINESS_NUMBER',
//     destination: '9197447xxxxx', // shop owner's number
//     message: JSON.stringify({ type: 'text', text: `New order ${order.id} — ₹${order.total}` }),
//   }, { headers: { apikey: process.env.GUPSHUP_API_KEY } });
//
async function sendOrderWhatsApp(order) {
  console.log(`[WhatsApp notification not yet configured] Order ${order.id} placed — ₹${order.total}`);
  // See comment above to enable real WhatsApp alerts.
}

async function notifyNewOrder(order) {
  await sendOrderEmail(order);
  await sendOrderWhatsApp(order);
}

module.exports = { notifyNewOrder };
