const express = require('express');
const router = express.Router();
const { generateCropPlan } = require('../ai-engine/cropPlanner');
const { getWeather } = require('../services/weatherService');

// Endpoint: GET /api/crop-plan?crop=rice&location=pune
router.get('/', async (req, res) => {
  try {
    const crop = req.query.crop;
    const location = req.query.location || 'Pune';

    if (!crop) {
      return res.status(400).json({ error: "Missing required query parameter: crop" });
    }

    const weather = await getWeather(location);
    const planResult = generateCropPlan(crop, location, weather);

    if (planResult.error) {
      return res.status(404).json(planResult);
    }

    // Return the required structure
    res.status(200).json({
      crop: planResult.crop,
      location: planResult.location,
      schedule: planResult.schedule
    });
  } catch (error) {
    console.error("Crop planner error:", error);
    res.status(500).json({ error: "Failed to generate crop plan" });
  }
});

module.exports = router;
