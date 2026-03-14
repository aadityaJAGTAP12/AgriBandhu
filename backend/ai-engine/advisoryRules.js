/**
 * Rules engine for crop advisory combining temp, humidity, and rainfall.
 */
const generateAdvisory = (weatherCondition) => {
  if (!weatherCondition) return "Ensure your crops are monitored regularly.";
  
  const temp = weatherCondition.temp;
  const humidity = weatherCondition.humidity;
  const rainfall = weatherCondition.rainfall;
  const description = weatherCondition.description.toLowerCase();

  let advice = "General Advice: ";

  // Temperature logic
  if (temp > 35) {
    advice += "High temp alert: Increase irrigation. ";
  } else if (temp < 10) {
    advice += "Low temp alert: Protect crops from frost. ";
  } else {
    advice += "Optimal temp: Maintain standard irrigation. ";
  }

  // Humidity logic
  if (humidity > 80) {
    advice += "High humidity detected: Watch out for fungal diseases (e.g., Rust, Blight). ";
  } else if (humidity < 30) {
    advice += "Low humidity: Apply foliar sprays during early morning. ";
  }

  // Rainfall logic
  if (rainfall > 0 || description.includes("rain")) {
    advice += `Rain expected (${rainfall}mm): Halt irrigation and clear field drainage. Do not apply fertilizer today.`;
  } else if (description.includes("clear") || description.includes("sun")) {
    advice += "Clear skies: Good window for pesticide or fertilizer application.";
  }

  return advice.trim();
};

module.exports = {
  generateAdvisory
};
