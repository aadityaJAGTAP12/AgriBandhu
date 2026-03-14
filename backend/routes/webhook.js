const express = require('express');
const router = express.Router();
const { getWeather } = require('../services/weatherService');
const { detectDisease } = require('../services/diseaseDetection');
const { findRelevantSchemes } = require('../services/schemeService');
const { generateAdvisory } = require('../ai-engine/advisoryRules');
const { generateCropPlan } = require('../ai-engine/cropPlanner');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { analyzeMessage, generateReply } = require('../ai-engine/llmAgent');
const apiKeys = require('../config/apiKeys');

// ── Conversation Memory ──────────────────────────────────────────────────────
// Per phone: { language, city, crop, onboarded }
const memory = {};

const getMemory = (phone) => {
  if (!memory[phone]) {
    memory[phone] = { language: 'en', city: 'Delhi', crop: null, onboarded: false };
  }
  return memory[phone];
};

const MAIN_MENU = `*Agri Bandhu Menu*\n\n1️⃣ Weather\n2️⃣ Crop Advice\n3️⃣ Disease Detection\n4️⃣ Government Schemes\n5️⃣ Crop Planner\n\nOr just *ask me anything* in your own words! 🌾`;

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

    // Parse real WhatsApp API payload
    if (req.body.object === 'whatsapp_business_account') {
      const entry = req.body.entry?.[0];
      const value = entry?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      if (message?.type === 'text') {
        messageText = message.text.body;
        phone = message.from;
      } else if (value?.statuses || !message) {
        return res.sendStatus(200);
      }
    } else {
      // Local mock (curl testing)
      messageText = req.body.text || req.body.message || '';
      phone = req.body.phone || req.body.from || 'default_user';
    }

    if (!messageText) return res.sendStatus(200);
    res.sendStatus(200); // Immediately ACK WhatsApp

    const ctx = getMemory(phone);
    const textStr = messageText.trim().toLowerCase();

    // ── Handle menu command and quick number commands ──────────────────────
    if (textStr === 'menu') {
      await sendWhatsAppMessage(phone, MAIN_MENU);
      return;
    }

    // ── First-time onboarding ─────────────────────────────────────────────
    if (!ctx.onboarded) {
      ctx.onboarded = true;
      const welcomeMsg = `🌾 *Welcome to Agri Bandhu!*\n\nI am your AI farming assistant. I understand Hindi, Marathi, and English.\n\nJust ask me anything naturally:\n_"What's the weather in Pune?"_\n_"Make a crop plan for rice"_\n_"Mere khet mein bimari ho gayi hai"_\n\n${MAIN_MENU}`;
      await sendWhatsAppMessage(phone, welcomeMsg);
      return;
    }

    // ── PHASE 1: LLM analyzes the message ────────────────────────────────
    const analysis = await analyzeMessage(messageText, { city: ctx.city, crop: ctx.crop, language: ctx.language });

    // Update memory with any new entities
    if (analysis.city) ctx.city = analysis.city;
    if (analysis.crop) ctx.crop = analysis.crop;
    if (analysis.language) ctx.language = analysis.language;

    // Quick number overrides for menu items
    const numMap = { '1': 'weather', '2': 'crop_advisory', '3': 'disease', '4': 'scheme', '5': 'crop_plan' };
    if (numMap[textStr]) analysis.intent = numMap[textStr];

    let serviceData = null;
    let replyText = '';

    // ── PHASE: Call the appropriate real service ──────────────────────────
    switch (analysis.intent) {
      case 'weather': {
        const city = analysis.city || ctx.city || 'Delhi';
        serviceData = await getWeather(city);
        break;
      }
      case 'crop_advisory': {
        const city = analysis.city || ctx.city || 'Delhi';
        const weather = await getWeather(city);
        if (analysis.city) ctx.city = city;
        serviceData = { location: weather.location, advisory: generateAdvisory(weather), weather };
        break;
      }
      case 'crop_plan': {
        const crop = analysis.crop || ctx.crop || 'rice';
        const city = analysis.city || ctx.city || 'Delhi';
        const weather = await getWeather(city);
        const plan = generateCropPlan(crop, city, weather);
        serviceData = plan.error ? { error: plan.error } : { crop, city, plan: plan.replyText };
        break;
      }
      case 'disease': {
        serviceData = await detectDisease(null);
        break;
      }
      case 'scheme': {
        const keyword = analysis.crop || '';
        const schemes = findRelevantSchemes(keyword);
        serviceData = { schemes: schemes.length > 0 ? schemes : [] };
        break;
      }
      case 'set_location': {
        // Farmer is telling us their city — store it and confirm
        const newCity = analysis.city || ctx.city;
        ctx.city = newCity;
        const confirmMsgs = {
          hi: `📍 समझ गया! आपका शहर *${newCity}* है। अब मैं आपको ${newCity} के लिए मौसम और सलाह दे सकता हूं।\n\n${MAIN_MENU}`,
          mr: `📍 समजलो! तुमचे शहर *${newCity}* आहे। आता मी तुम्हाला ${newCity} साठी हवामान आणि सल्ला देऊ शकतो।\n\n${MAIN_MENU}`,
          en: `📍 Got it! Your location is set to *${newCity}*. I'll use this for weather and crop advice.\n\n${MAIN_MENU}`
        };
        replyText = confirmMsgs[ctx.language] || confirmMsgs.en;
        break;
      }
      case 'greeting': {
        replyText = MAIN_MENU;
        break;
      }
      default: {
        replyText = `I'm not sure I understood that. 🤔\n\nTry asking:\n- "Weather in Pune"\n- "Make a plan for rice"\n- "Koi sarkari yojana hai?"\n\n${MAIN_MENU}`;
      }
    }

    // ── PHASE 2: LLM generates the final farmer-friendly response ─────────
    if (serviceData && !replyText) {
      replyText = await generateReply(analysis.intent, serviceData, ctx.language, messageText);
    }

    console.log(`[Reply → ${phone}]: ${replyText.slice(0, 80)}...`);
    await sendWhatsAppMessage(phone, replyText);

  } catch (error) {
    console.error('Webhook error:', error);
  }
});

module.exports = router;
