const express = require('express');
const router = express.Router();
const { generateAdvisory } = require('../ai-engine/advisoryRules');
const { getWeather } = require('../services/weatherService');

// Direct endpoint for testing advisory independently
router.get('/', async (req, res) => {
  const location = String(req.query.location || '').trim();

  if (!location) {
    return res.status(400).json({ error: 'Missing required query parameter: location' });
  }

  try {
    const weather = await getWeather(location);
    const advice = generateAdvisory({
      temp: weather.temperature,
      humidity: weather.humidity,
      rainfall: weather.rainfall,
      description: weather.condition
    });
    res.json({ advice });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate advisory' });
  }
});

module.exports = router;
