const axios = require('axios');
const apiKeys = require('../config/apiKeys');

/**
 * Fetches real weather data from OpenWeather API.
 */
const getWeather = async (location = "Delhi") => {
  try {
    const key = apiKeys.openWeatherKey;
    if (!key || key === "YOUR_OPENWEATHER_API_KEY_HERE" || key === "dummy_weather_key") {
      console.log("⚠️ Using mock weather data (API Key missing).");
      return {
        location,
        temp: 32, // Celsius
        description: "Clear sky",
        humidity: 60,
        rainfall: 0
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
      location: data.name,
      temp: data.main.temp,
      description: data.weather[0].description,
      humidity: data.main.humidity,
      rainfall: rainfall
    };
  } catch (error) {
    console.error("OpenWeather API Error:", error.message);
    // Fallback on error
    return {
      location,
      temp: 32,
      description: "Clear sky",
      humidity: 60,
      rainfall: 0
    };
  }
};

module.exports = {
  getWeather
};
