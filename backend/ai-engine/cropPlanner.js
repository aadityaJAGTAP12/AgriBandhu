const { getCropSchedule } = require('../services/cropService');

/**
 * Generates a crop schedule matched with weather advisories.
 * 
 * @param {string} crop - Crop name (e.g. 'rice', 'wheat')
 * @param {string} location - Location string (e.g. 'Pune')
 * @param {object} weather - Weather condition object
 * @returns {object} Payload with formatted schedule and raw array
 */
const generateCropPlan = (crop, location, weather) => {
  const scheduleData = getCropSchedule(crop);

  if (!scheduleData) {
    return {
      error: `Sorry, we don't have a calendar for ${crop} yet.`
    };
  }

  // Capitalize crop name
  const formattedCrop = crop.charAt(0).toUpperCase() + crop.slice(1).toLowerCase();

  let intro = `Crop Plan for ${formattedCrop} (Location: ${location})\n\n`;
  let schedules = [];

  // Build the basic schedule array
  scheduleData.schedule.forEach(item => {
    schedules.push(`Week ${item.week}:\n• ${item.task}`);
  });

  // Apply Weather Rules to the immediate/general warning stack
  let rules = [];
  
  if (weather) {
    if (weather.rainfall > 0 || (weather.description && weather.description.toLowerCase().includes("rain"))) {
      rules.push("⚠️ Delay irrigation due to expected rainfall today.");
    }
    if (weather.humidity > 80) {
      rules.push("⚠️ High humidity detected – monitor crop for fungal diseases.");
    }
    if (weather.temp > 35) {
      rules.push("⚠️ High temperature – increase irrigation and provide shade if possible.");
    }
  }

  // Compile final message
  let finalMessage = intro + schedules.join("\n\n");
  
  if (rules.length > 0) {
    finalMessage += `\n\n--- Current Weather Advisory ---\n` + rules.join("\n");
  }

  return {
    crop: formattedCrop,
    location: location,
    schedule: schedules,
    advisory: rules,
    replyText: finalMessage
  };
};

module.exports = {
  generateCropPlan
};
