const axios = require('axios');
const apiKeys = require('../config/apiKeys');

/**
 * Weather service for Agri Bandhu.
 * Requires an explicit location and a configured API key.
 */
const hasRealWeatherApi = () => {
  const key = apiKeys.openWeatherKey;
  return Boolean(
    key &&
    key !== 'YOUR_OPENWEATHER_API_KEY_HERE' &&
    key !== 'dummy_weather_key'
  );
};

const getWeather = async (location) => {
  const city = String(location || '').trim();
  if (!city) {
    throw new Error('City is required for weather lookup');
  }

  if (!hasRealWeatherApi()) {
    throw new Error('Weather API key is not configured');
  }

  try {
    const response = await axios.get(apiKeys.openWeatherUrl, {
      params: {
        q: city,
        appid: apiKeys.openWeatherKey,
        units: 'metric'
      }
    });

    const data = response.data;
    const rainfall = data.rain && data.rain['1h'] ? data.rain['1h'] : 0;

    return {
      city: data.name,
      temperature: Math.round(data.main.temp),
      humidity: data.main.humidity,
      rainfall,
      condition: data.weather[0].description,
      source: 'api'
    };
  } catch (error) {
    console.error('OpenWeather API Error:', error.message);
    throw error;
  }
};

module.exports = {
  getWeather,
  hasRealWeatherApi
};
