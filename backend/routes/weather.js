const express = require('express');
const router = express.Router();
const { getWeather } = require('../services/weatherService');

// Direct endpoint for testing weather service independently
router.get('/', async (req, res) => {
  const location = req.query.location || 'Delhi';
  try {
    const data = await getWeather(location);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch weather" });
  }
});

module.exports = router;
