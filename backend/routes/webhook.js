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
  let phone = 'default_user';
  try {
    let messageText = '';
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
        // Ignore status updates and empty messages
        return res.sendStatus(200);
      }
    } else {
      // Local mock (curl testing)
      messageText = req.body.text || req.body.message || '';
      phone = req.body.phone || req.body.from || 'default_user';
      imageUrl = req.body.imageUrl;
    }

    if (!messageText) return res.sendStatus(200);

    // IMMEDIATE ACK to WhatsApp (required for webhook compliance)
    res.sendStatus(200);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[📲 WEBHOOK] Received message from ${phone}`);
    console.log(`[💬 Message]: "${messageText}"`);
    if (imageUrl) console.log(`[🖼️  Image]: ${imageUrl}`);

    // Get conversation context
    const context = sessionMemory.get(phone);
    console.log(`[📋 Current Context]: ${JSON.stringify(context)}`);

    // Process message with LLM Agent (single entry point)
    const response = await llmAgent.processMessage(messageText, context, imageUrl);

    // Update context after processing (agent updates context internally)
    sessionMemory.addConversation(phone, messageText, response);
    console.log(`[✅ Response generated]: "${response.substring(0, 100)}..."`);

    // SEND SINGLE RESPONSE ONLY
    console.log(`[📤 Sending WhatsApp message to ${phone}]`);
    await sendWhatsAppMessage(phone, response);
    console.log(`[✅ Message sent]`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error(`[❌ WEBHOOK ERROR]: ${error.message}`);
    console.error(error.stack);
    
    // Send single error message to user
    try {
      const errorMsg = "खेती के लिए सहायता में कोई समस्या आई। कृपया कुछ समय बाद पुनः प्रयास करें।";
      console.log(`[📤 Sending error message to ${phone}]`);
      await sendWhatsAppMessage(phone, errorMsg);
    } catch (e) {
      console.error(`[❌ Failed to send error message]: ${e.message}`);
    }
  }
});

module.exports = router;
