const express = require('express');
const router = express.Router();
const { generateAdvisory } = require('../ai-engine/advisoryRules');
const { getWeather } = require('../services/weatherService');

// Direct endpoint for testing advisory independently
router.get('/', async (req, res) => {
  try {
    const weather = await getWeather("Delhi");
    const advice = generateAdvisory(weather);
    res.json({ advice });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate advisory" });
  }
});

module.exports = router;
