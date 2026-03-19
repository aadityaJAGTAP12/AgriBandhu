const express = require('express');
const router = express.Router();
const { sendWhatsAppMessage } = require('../services/whatsappService');
const llmAgent = require('../ai-engine/llmAgent');
const sessionMemory = require('../memory/sessionMemory');
const apiKeys = require('../config/apiKeys');

// ── Webhook Verification ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token) {
    if (mode === 'subscribe' && token === apiKeys.verifyToken) {
      console.log('✅ WEBHOOK VERIFIED');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  res.sendStatus(400);
});

// ── Incoming Messages ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    let messageText = '';
    let phone = 'default_user';
    let imageUrl = null;

    // Parse real WhatsApp API payload
    if (req.body.object === 'whatsapp_business_account') {
      const entry = req.body.entry?.[0];
      const value = entry?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      if (message?.type === 'text') {
        messageText = message.text.body;
        phone = message.from;
      } else if (message?.type === 'image') {
        // Handle image messages for disease detection
        imageUrl = message.image?.url;
        messageText = message.caption || "Please check this plant image for diseases.";
        phone = message.from;
      } else if (value?.statuses || !message) {
        return res.sendStatus(200);
      }
    } else {
      // Local mock (curl testing)
      messageText = req.body.text || req.body.message || '';
      phone = req.body.phone || req.body.from || 'default_user';
      imageUrl = req.body.imageUrl;
    }

    if (!messageText) return res.sendStatus(200);
    res.sendStatus(200); // Immediately ACK WhatsApp

    // Get conversation context
    const context = sessionMemory.get(phone);

    // Track the crop mentioned by the farmer for follow-up context
    const cropMention = llmAgent.extractCrop(messageText);
    if (cropMention && !context.crop) {
      sessionMemory.update(phone, { crop: cropMention });
      context.crop = cropMention;
    }

    // Handle special commands
    const textStr = messageText.trim().toLowerCase();
    if (textStr === 'menu') {
      const menuMsg = `*Agri Bandhu Menu*\n\n🌾 *Ask me anything naturally:*\n\n• Weather in your city\n• Crop planning advice\n• Government schemes\n• Plant disease help\n• Farming tips\n\nJust type your question! 🌱`;
      await sendWhatsAppMessage(phone, menuMsg);
      return;
    }

    // Process message with LLM Agent
    console.log(`[Webhook] Processing message from ${phone}: "${messageText}"`);
    const response = await llmAgent.processMessage(messageText, context, imageUrl);

    // Update context based on response (agent handles this internally)
    // For now, just store the conversation
    sessionMemory.addConversation(phone, messageText, response);

    console.log(`[Response → ${phone}]: ${response.slice(0, 80)}...`);
    await sendWhatsAppMessage(phone, response);

  } catch (error) {
    console.error('Webhook error:', error);
    // Send error message to user
    try {
      await sendWhatsAppMessage(phone, "क्षमा करें, कुछ तकनीकी समस्या हुई। कृपया कुछ देर बाद फिर से प्रयास करें।");
    } catch (e) {
      console.error('Failed to send error message:', e);
    }
  }
});

module.exports = router;
