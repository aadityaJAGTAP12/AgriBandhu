require('dotenv').config();

module.exports = {
  openWeatherUrl: "https://api.openweathermap.org/data/2.5/weather",
  openWeatherKey: process.env.OPENWEATHER_API_KEY || "dummy_weather_key",
  whatsappToken: process.env.WHATSAPP_TOKEN || "dummy_whatsapp_token",
  phoneNumberId: process.env.PHONE_NUMBER_ID || "dummy_phone_id",
  verifyToken: process.env.VERIFY_TOKEN || "dummy_verify_token",
  geminiKey: process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE",
  openRouterKey: process.env.OPENROUTER_API_KEY || ""
};
