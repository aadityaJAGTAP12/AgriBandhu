const axios = require('axios');
const apiKeys = require('../config/apiKeys');

/**
 * Weather service for Agri Bandhu - Tool interface
 */
const getWeather = async (location = "Delhi") => {
  try {
    const key = apiKeys.openWeatherKey;
    if (!key || key === "YOUR_OPENWEATHER_API_KEY_HERE" || key === "dummy_weather_key") {
      console.log("⚠️ Using mock weather data (API Key missing).");
      return {
        city: location,
        temperature: 32,
        humidity: 60,
        rainfall: 0,
        condition: "Clear sky"
      };
    }

    const response = await axios.get(apiKeys.openWeatherUrl, {
      params: {
        q: location,
        appid: key,
        units: 'metric'
      }
    });

    const data = response.data;
    const rainfall = data.rain && data.rain['1h'] ? data.rain['1h'] : 0;

    return {
      city: data.name,
      temperature: Math.round(data.main.temp),
      humidity: data.main.humidity,
      rainfall: rainfall,
      condition: data.weather[0].description
    };
  } catch (error) {
    console.error("OpenWeather API Error:", error.message);
    // Fallback on error
    return {
      city: location,
      temperature: 32,
      humidity: 60,
      rainfall: 0,
      condition: "Clear sky"
    };
  }
};

module.exports = {
  getWeather
};

module.exports = {
  getWeather
};
