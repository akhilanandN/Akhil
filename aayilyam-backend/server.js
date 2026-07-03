require('dotenv').config();
const express = require('express');
const cors = require('cors');

const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const offersRouter = require('./routes/offers');
const ordersRouter = require('./routes/orders');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// NOTE: the Razorpay webhook route needs the RAW request body to verify
// its signature, so it must be registered before express.json() below.
app.use('/api/orders/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'Aayilyam Stores API running' }));

app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/offers', offersRouter);
app.use('/api/orders', ordersRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Aayilyam Stores API listening on port ${PORT}`));
