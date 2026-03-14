const { GoogleGenerativeAI } = require('@google/generative-ai');
const apiKeys = require('../config/apiKeys');

let genAI = null;
let model = null;

const initGemini = () => {
  if (!model) {
    if (!apiKeys.geminiKey || apiKeys.geminiKey.includes('YOUR_')) return null;
    genAI = new GoogleGenerativeAI(apiKeys.geminiKey);
    // Use gemini-1.5-flash — stable, fast, supports Hindi/Marathi
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  return model;
};

/**
 * PHASE 1: Extract intent + entities from farmer message.
 * Returns { intent, city, crop, language }
 */
const analyzeMessage = async (message, context = {}) => {
  const geminiModel = initGemini();
  if (!geminiModel) return keywordFallback(message, context);

  const prompt = `You are an intent extraction engine for Agri Bandhu, an AI farming assistant in India.

Known context:
- City: ${context.city || 'unknown'}
- Crop: ${context.crop || 'unknown'}

Analyze this farmer message and return ONLY a valid JSON object (no markdown, no extra text):
{
  "intent": one of ["weather", "crop_advisory", "crop_plan", "disease", "scheme", "set_location", "greeting", "unknown"],
  "city": string or null,
  "crop": string or null,
  "language": "en" or "hi" or "mr"
}

Intent rules:
- "weather" = any question about weather, rain, temperature, climate (e.g. "mausam", "barish", "mahol", "tapman", "garmi", "sardi")
- "crop_advisory" = when to irrigate, fertilize, sow, general farming tips
- "crop_plan" = farming schedule, calendar, plan (e.g. "plan banao", "schedule")
- "disease" = plant disease, pest, bimari, rog
- "scheme" = government schemes, subsidies, PM-KISAN, yojana
- "set_location" = farmer is just stating their location (e.g. "I am in Agra", "main Pune mein hun")
- "greeting" = hi, hello, namaste, start
- If city not in message, use previously known city from context (do NOT output null if context has a city)
- Always detect language (hi=Hindi, mr=Marathi, en=English)

Farmer message: "${message}"`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const raw = result.response.text().trim()
      .replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(raw);

    // Fill context defaults
    if (!parsed.city && context.city) parsed.city = context.city;
    if (!parsed.crop && context.crop) parsed.crop = context.crop;
    if (!parsed.language) parsed.language = context.language || 'en';

    console.log(`[LLM Phase 1] intent=${parsed.intent} city=${parsed.city} crop=${parsed.crop} lang=${parsed.language}`);
    return parsed;
  } catch (err) {
    console.error('[LLM Phase 1 Error]', err.message);
    return keywordFallback(message, context);
  }
};

/**
 * PHASE 2: Generate a warm farmer-friendly reply from real service data.
 */
const generateReply = async (intent, serviceData, language, originalMessage) => {
  const geminiModel = initGemini();
  const langNames = { en: 'English', hi: 'Hindi', mr: 'Marathi' };
  const langName = langNames[language] || 'English';

  if (!geminiModel) return formatFallback(intent, serviceData, language);

  const prompt = `You are Agri Bandhu, a helpful AI farming assistant on WhatsApp for Indian farmers.
Respond in ${langName}. Be warm, concise, and practical. Use emojis. Max 180 words.
Do NOT invent any data. Only use the real data provided below.
End with: "अधिक जानकारी के लिए *menu* टाइप करें" (if Hindi), "अधिक माहितीसाठी *menu* टाइप करा" (if Marathi), or "Type *menu* for more options." (if English).

Farmer asked: "${originalMessage}"
Intent: ${intent}
Real data:
${JSON.stringify(serviceData, null, 2)}

Generate a WhatsApp reply now:`;

  try {
    const result = await geminiModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('[LLM Phase 2 Error]', err.message);
    return formatFallback(intent, serviceData, language);
  }
};

/**
 * Formatted fallback reply when Gemini Phase 2 fails — never returns raw JSON.
 */
const formatFallback = (intent, data, language) => {
  const menu = language === 'hi'
    ? 'अधिक जानकारी के लिए *menu* टाइप करें।'
    : language === 'mr'
      ? 'अधिक माहितीसाठी *menu* टाइप करा।'
      : 'Type *menu* for more options.';

  if (intent === 'weather' && data.temp !== undefined) {
    return `🌤 *${data.location} का मौसम / Weather*\n🌡 ${data.temp}°C\n💧 Humidity: ${data.humidity}%\n🌧 Rain: ${data.rainfall}mm\n📋 ${data.description}\n\n${menu}`;
  }
  if (intent === 'crop_advisory' && data.advisory) {
    return `🌱 *Crop Advisory — ${data.location}*\n\n${data.advisory}\n\n${menu}`;
  }
  if (intent === 'crop_plan' && data.plan) {
    return `${data.plan}\n\n${menu}`;
  }
  if (intent === 'disease' && data.detectedDisease) {
    return `🔬 *Disease: ${data.detectedDisease}*\n🌾 Crop: ${data.crop}\n✅ ${data.treatment}\n\n${menu}`;
  }
  if (intent === 'scheme' && data.schemes) {
    const schemes = Array.isArray(data.schemes) ? data.schemes : [];
    if (schemes.length === 0) return `🏛 No schemes found.\n\n${menu}`;
    return `🏛 *Government Schemes*\n\n` + schemes.map(s => `📌 *${s.name}*\n💰 ${s.benefit}`).join('\n\n') + `\n\n${menu}`;
  }
  return `✅ Done!\n\n${menu}`;
};

/**
 * Keyword fallback for when Gemini is unavailable.
 * Covers English + common Hindi + Marathi words.
 */
const keywordFallback = (message, context) => {
  const text = message.toLowerCase();
  let intent = 'unknown';
  let city = null;

  // Weather: English + Hindi (mausam, barish, mahol, garmi, tapman) + Marathi (haval, paus)
  if (/weather|rain|temperature|forecast|climate|mausam|barish|mahol|tapman|garmi|sardi|haval|paus|thanda|garam/.test(text)) intent = 'weather';
  // Disease
  else if (/disease|pest|bimari|rog|keeda|fungus|droha/.test(text)) intent = 'disease';
  // Schemes
  else if (/scheme|subsidy|yojana|pm.?kisan|fasal bima|insurance|benefit/.test(text)) intent = 'scheme';
  // Crop plan
  else if (/plan|calendar|schedule|week|khariphal|rabi|kharif|plan banao|schedule banao/.test(text)) intent = 'crop_plan';
  // Advisory
  else if (/advice|advisory|irrigat|fertiliz|sow|kab|kaise|khad|pani|sinchai/.test(text)) intent = 'crop_advisory';
  // Location setting: "I am in X", "main X mein hun", "mera shehar X hai"
  else if (/\bam in\b|\bfrom\b|\bhu[ñn]\b|\bshehar\b|\bgaon\b|\bpincode\b|\btaluk/.test(text)) intent = 'set_location';
  // Greeting
  else if (/^(hi+|hello|namaste|namaskar|jai|start|hey|menu)/.test(text.trim())) intent = 'greeting';

  // City extraction — match "in X", "at X", "mein X", common city names
  const cityPatterns = [
    /\bin ([a-z]+)\b/,
    /\bat ([a-z]+)\b/,
    /([a-z]+) mein\b/,
    /([a-z]+) mai\b/,
    /\b(mumbai|pune|delhi|agra|nagpur|jaipur|lucknow|kolkata|chennai|hyderabad|surat|ahmedabad|bhopal|indore|vadodara|nashik|aurangabad|solapur|amravati|latur)\b/
  ];
  for (const pattern of cityPatterns) {
    const m = text.match(pattern);
    if (m) { city = m[1]; break; }
  }

  const cropMatch = text.match(/\b(rice|wheat|cotton|maize|sugarcane|soybean|onion|tomato|chawal|gehu|kapas|makka|ganna|soya|pyaaz)\b/);
  const crop = cropMatch ? cropMatch[1] : (context.crop || null);
  if (!city) city = context.city || 'Delhi';
  const language = context.language || 'en';

  console.log(`[Keyword Fallback] intent=${intent} city=${city} crop=${crop}`);
  return { intent, city, crop, language };
};

module.exports = { analyzeMessage, generateReply };
