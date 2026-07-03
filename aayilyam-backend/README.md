# Aayilyam Stores — Backend

This is the working backend for your website: it stores products/categories/offers/orders in Supabase, takes payments through Razorpay, and emails you the moment a new order comes in.

It has been tested locally and starts up correctly — you just need to fill in your own credentials below to make it fully live.

## What's inside

```
server.js              → the main API server
routes/products.js      → browse, add, edit, remove products
routes/categories.js    → browse, add, remove categories
routes/offers.js        → browse, add, remove offers
routes/orders.js        → checkout, payments, order tracking, admin order list
utils/supabaseClient.js → database connection
utils/razorpayClient.js → payment gateway connection
utils/notify.js         → sends you an email when an order is placed
middleware/adminAuth.js → protects admin-only actions with a password
schema.sql              → run this once in Supabase to create your tables
.env.example            → copy to .env and fill in your real keys
```

## Step 1 — Create your Supabase project (free)

1. Go to supabase.com → sign up → "New Project"
2. Once it's created, go to **Project Settings → API** and copy:
   - **Project URL** → this is your `SUPABASE_URL`
   - **service_role key** (not the "anon" one) → this is your `SUPABASE_SERVICE_ROLE_KEY`
3. Go to **SQL Editor → New query**, paste the entire contents of `schema.sql`, and click **Run**. This creates all your tables and pre-fills your 9 categories.

## Step 2 — Create your Razorpay account

1. Go to razorpay.com → sign up as a business (you'll need basic shop/bank details for payouts to your account)
2. Go to **Settings → API Keys → Generate Test Key** to start (switch to live keys once you're ready to accept real payments)
3. Copy the **Key Id** and **Key Secret** into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
4. Go to **Settings → Webhooks → Add New Webhook**, set the URL to `https://your-deployed-backend-url.com/api/orders/razorpay-webhook`, select the `payment.captured` event, and set a secret — put that same secret into `RAZORPAY_WEBHOOK_SECRET`

## Step 3 — Email notifications (free, via Gmail)

1. Use (or create) a Gmail address for the shop, e.g. `aayilyamstores@gmail.com`
2. Turn on 2-Step Verification on that Google account
3. Go to **Google Account → Security → App Passwords**, create one for "Mail", and copy the 16-character password
4. Put the Gmail address in `SMTP_EMAIL` and the app password in `SMTP_APP_PASSWORD`
5. Put whatever email you personally check in `NOTIFY_EMAIL` (can be the same address, or your personal Gmail)

Once this is set up, **every order — WhatsApp/COD or paid online — automatically sends you an email** with the customer's name, phone, address, items, and total.

## Step 4 — Configure and run

```bash
cp .env.example .env
# then edit .env and paste in all your real values from steps 1-3

npm install
node server.js
```

You should see: `Aayilyam Stores API listening on port 4000`

## Step 5 — Connect it to your website

The website file (`aayilyam-stores.html`) is already wired to call this backend — you just need to fill in three values. Open the file, find the `CONFIG` block near the top of the `<script>` section, and set:

```js
const CONFIG = {
  API_BASE_URL: 'https://your-deployed-backend-url.com/api',
  SUPABASE_URL: 'https://YOUR-PROJECT-ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_PUBLIC_KEY',   // the public "anon" key, not the service_role one
};
```

Once these point to your real backend, the website automatically:
- Loads real products/categories/offers instead of the built-in sample data
- Saves every order (WhatsApp, COD, or paid) to your database and emails you
- Runs real Razorpay payments through the "Pay online" button
- Lets customers register/log in with real accounts (email + password)
- Lets you log into the Admin dashboard with your `ADMIN_PASSWORD` and have changes save permanently

Until you fill these in, the website keeps working in "demo mode" with sample data — nothing breaks, it just isn't connected to a real database yet.

## Step 6 — Deploy it so it's live 24/7

Right now this only runs on your own computer. To make it permanently live:
- **Render.com** or **Railway.app** are the easiest for a Node.js app like this — connect your GitHub repo, add your `.env` values as "Environment Variables" in their dashboard, and it deploys automatically. Both have free/cheap tiers suitable for a small shop.
- Once deployed, update `FRONTEND_URL` in your environment variables to your actual website address, and update the Razorpay webhook URL to point to the live backend URL.

## About WhatsApp order notifications

Email notifications work today, out of the box. To also get an **automatic WhatsApp message** (not just email) the moment an order is placed, see the comment block in `utils/notify.js` — it shows exactly where to plug in a WhatsApp Business API provider (Interakt, Gupshup, or Meta Cloud API) once you've signed up with one.

## Admin password

Your admin panel is protected by a single shared password (set as `ADMIN_PASSWORD` in `.env`) rather than a full login system — simplest option for a one-owner shop. If you later add staff who need their own admin logins, let me know and I'll upgrade this to proper role-based accounts.
