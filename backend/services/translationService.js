const { Translate } = require('@google-cloud/translate').v2;
const apiKeys = require('../config/apiKeys');

// Initialize the client if credentials are provided in the environment
// Otherwise, we create a mock version to prevent crashes during local testing
let translateClient = null;

try {
  translateClient = new Translate();
} catch (error) {
  console.log("⚠️ Google Cloud Translation not configured properly. Using mock translation service.");
}

/**
 * Translates text into the target language.
 * @param {string} text - text to translate
 * @param {string} targetLang - target language code (e.g. 'hi' for Hindi, 'mr' for Marathi)
 */
const translateText = async (text, targetLang) => {
  // If target is English or no target, just return original
  if (!targetLang || targetLang === 'en') {
    return text;
  }

  // If no client, return a mock string
  if (!translateClient) {
    return `[Translated to ${targetLang}]: ${text}`;
  }

  try {
    const [translations] = await translateClient.translate(text, targetLang);
    return translations;
  } catch (error) {
    console.error("Translation error:", error);
    return `[Mock Translation to ${targetLang}]: ${text}`;
  }
};

module.exports = {
  translateText
};
