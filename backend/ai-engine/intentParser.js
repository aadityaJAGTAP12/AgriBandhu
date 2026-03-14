/**
 * Simple keyword-based intent parser.
 * A real version would use NLP like Dialogflow, Rasa, or an LLM.
 */
const detectIntent = (message) => {
  const text = message.toLowerCase();
  
  if (text.includes("weather") || text.includes("rain") || text.includes("temperature")) {
    return "weather";
  }
  
  if (text.includes("scheme") || text.includes("subsidy") || text.includes("government") || text.includes("pm")) {
    return "government_scheme";
  }
  
  if (text.includes("disease") || text.includes("sick") || text.includes("spot") || text.includes("yellow")) {
    return "disease_detection";
  }
  
  if (text.includes("advice") || text.includes("how to") || text.includes("help")) {
    return "crop_advisory";
  }

  return "unknown";
};

module.exports = {
  detectIntent
};
