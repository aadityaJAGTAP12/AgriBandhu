/**
 * DEPRECATED: This module is no longer used in the new LLM Agent architecture.
 * The system now uses natural language processing through the LLM Agent directly.
 * This file is kept for reference only.
 */

// This function is no longer called
const detectIntent = (message) => {
  console.warn('intentParser.js is deprecated. Using LLM Agent instead.');
  return "unknown";
};

module.exports = {
  detectIntent
};
