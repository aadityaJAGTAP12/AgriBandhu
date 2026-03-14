require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// Import configurations //
const { initializeFirebase } = require('./config/firebase');

// Initialize Integrations
initializeFirebase();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Import routes //
const webhookRoutes = require('./routes/webhook');
const weatherRoutes = require('./routes/weather');
const advisoryRoutes = require('./routes/advisory');
const plannerRoutes = require('./routes/planner');

// Mount routes //
app.use('/webhook', webhookRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/advisory', advisoryRoutes);
app.use('/api/crop-plan', plannerRoutes);

// Health check endpoint //
app.get('/', (req, res) => {
  res.send('Agri Bandhu API is running.');
});

// Start Server //
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Webhook endpoint ready at http://localhost:${PORT}/webhook`);
});
