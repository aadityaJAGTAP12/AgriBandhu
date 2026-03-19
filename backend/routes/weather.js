const express = require('express');
const router = express.Router();
const { getWeather } = require('../services/weatherService');

// Direct endpoint for testing weather service independently
router.get('/', async (req, res) => {
  const location = String(req.query.location || '').trim();

  if (!location) {
    return res.status(400).json({ error: 'Missing required query parameter: location' });
  }

  try {
    const data = await getWeather(location);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch weather' });
  }
});

module.exports = router;
