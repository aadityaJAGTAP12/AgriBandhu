const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, '../../database/cropCalendar.json');

/**
 * Service to fetch crop schedules.
 */
const getCropSchedule = (cropName) => {
  try {
    const data = fs.readFileSync(calendarPath, 'utf8');
    const calendar = JSON.parse(data);
    
    // Normalize string to match keys
    const normalizedCrop = cropName.toLowerCase().trim();
    return calendar[normalizedCrop] || null;
  } catch (error) {
    console.error("Error reading crop calendar:", error);
    return null;
  }
};

module.exports = {
  getCropSchedule
};
