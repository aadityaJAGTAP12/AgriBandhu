const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, '../../database/cropCalendar.json');

/**
 * Get crop plan/schedule for a specific crop
 * @param {string} cropName - Name of the crop
 * @returns {object} - Structured crop plan
 */
const getCropPlan = (cropName) => {
  try {
    const data = fs.readFileSync(calendarPath, 'utf8');
    const calendar = JSON.parse(data);

    // Normalize crop name
    const normalizedCrop = cropName.toLowerCase().trim();

    // Try exact match first
    let cropData = calendar[normalizedCrop];

    // If not found, try partial matches
    if (!cropData) {
      for (const [key, value] of Object.entries(calendar)) {
        if (key.includes(normalizedCrop) || normalizedCrop.includes(key)) {
          cropData = value;
          break;
        }
      }
    }

    if (!cropData) {
      return {
        crop: cropName,
        error: `Crop plan not available for ${cropName}. Available crops: ${Object.keys(calendar).join(', ')}`
      };
    }

    return {
      crop: cropName,
      season: cropData.season,
      duration_days: cropData.duration_days,
      plan: cropData.schedule
    };
  } catch (error) {
    console.error("Error reading crop calendar:", error);
    return {
      crop: cropName,
      error: "Unable to load crop calendar data"
    };
  }
};

/**
 * Get available crops
 * @returns {array} - List of available crops
 */
const getAvailableCrops = () => {
  try {
    const data = fs.readFileSync(calendarPath, 'utf8');
    const calendar = JSON.parse(data);
    return Object.keys(calendar);
  } catch (error) {
    console.error("Error reading crop calendar:", error);
    return [];
  }
};

module.exports = {
  getCropPlan,
  getAvailableCrops
};
