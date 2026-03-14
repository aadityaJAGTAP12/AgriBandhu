const axios = require('axios');
const apiKeys = require('../config/apiKeys');

/**
 * Sends a WhatsApp message via the official Graph API.
 * 
 * @param {string} phone - Target phone number
 * @param {string} text - Message text to send
 */
const sendWhatsAppMessage = async (phone, text) => {
  const token = apiKeys.whatsappToken;
  const phoneId = apiKeys.phoneNumberId;

  // If using the local mock phone or API keys are missing/mock
  if (!token || token.includes("dummy") || !phoneId || phoneId.includes("dummy") || phone === "default_user") {
    console.log(`[Mock WhatsApp API] Message out to ${phone}:\n${text}`);
    return;
  }

  try {
    const response = await axios({
      method: "POST",
      url: `https://graph.facebook.com/v17.0/${phoneId}/messages`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: text }
      }
    });
    console.log(`[WhatsApp API] Sent successfully to ${phone}`);
  } catch (error) {
    const errorMsg = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
    console.error("[WhatsApp API Error] Failed to send message:", errorMsg);
  }
};

module.exports = {
  sendWhatsAppMessage
};
