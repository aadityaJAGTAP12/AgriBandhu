const axios = require('axios');
const apiKeys = require('../config/apiKeys');
const { getWeather, hasRealWeatherApi } = require('../services/weatherService');
const { getCropPlan } = require('../services/cropService');
const { getSchemes } = require('../services/schemeService');
const { detectDisease } = require('../services/diseaseDetection');
const ragRetriever = require('./ragRetriever');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-3.5-turbo';

const TOOL_DEFINITIONS = `
TOOLS AVAILABLE:
1) WEATHER - needs {"city": "<city name>"}; returns {temperature, humidity, rainfall, condition, city}.
2) CROP_PLAN - needs {"crop": "<crop name>"}; returns crop schedule with season, duration_days, plan.
3) SCHEMES - no params; returns an array of scheme objects.
4) DISEASE - needs {"imageUrl": "<url>"}; returns a disease analysis object.
`;

class AgriBandhuAgent {
  constructor() {
    this.systemPrompt = `You are Agri Bandhu, an AI farming assistant for Indian farmers.

LANGUAGE:
- Always respond in the same language as the farmer's message.

CRITICAL RULES:
1. Use tools for weather, schemes, crop planning, and disease detection.
2. If required information like city or crop is missing, ask for it.
3. Never assume or guess a city, crop, or location.
4. Answer meta questions about APIs, tools, and location directly and honestly.
5. Be practical, conversational, and farmer-friendly.
6. Do not mention being an AI unless explicitly asked.
`;
  }

  async processMessage(userMessage, context = {}, imageUrl = null) {
    const startTime = Date.now();

    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log('[AGENT START] Processing message');
      console.log(`[Message]: "${userMessage}"`);
      console.log(`[Context]: ${JSON.stringify(context)}`);
      if (imageUrl) console.log(`[Image URL]: ${imageUrl}`);

      const previousLanguage = context.language;
      const previousAwaitingField = context.awaitingField;
      const previousLastTopic = context.lastTopic;
      const language = this.detectLanguage(userMessage, previousLanguage);
      context.language = language;

      const crop = this.extractCrop(userMessage);
      if (crop) {
        context.crop = crop;
        if (context.awaitingField === 'crop') {
          context.awaitingField = null;
        }
      }

      const city = this.extractCity(userMessage);
      if (city) {
        context.city = city;
        if (context.awaitingField === 'city') {
          context.awaitingField = null;
        }
      }

      const intent = this.detectIntent(userMessage, imageUrl, {
        ...context,
        previousAwaitingField,
        previousLastTopic
      });
      context.lastTopic = intent !== 'general' ? intent : context.lastTopic;
      console.log(`[Intent]: ${intent}`);

      if (intent === 'meta_api') {
        return this.answerApiQuestion(language);
      }

      if (intent === 'meta_location') {
        return this.answerLocationQuestion(context, language);
      }

      const missingInfoResponse = this.getMissingInfoResponse(intent, context, language);
      if (missingInfoResponse) {
        console.log(`[Missing Info Response]: ${missingInfoResponse}`);
        return missingInfoResponse;
      }

      const knowledge = ragRetriever.retrieveKnowledge(userMessage);
      const contextSummary = this.buildContextSummary(context);
      const requiresTooling = this.detectToolRequirement(intent, imageUrl);

      console.log(`[Context Summary]: ${contextSummary}`);
      console.log(`[Tooling]: ${requiresTooling ? 'required' : 'not required'}`);

      const toolRequests = await this.getToolRequests(
        userMessage,
        contextSummary,
        knowledge,
        imageUrl,
        requiresTooling,
        intent,
        context
      );
      console.log(`[Tool Requests]: ${JSON.stringify(toolRequests)}`);

      const toolResults = toolRequests.length > 0
        ? await this.executeToolRequests(toolRequests)
        : {};
      console.log(`[Tool Results]: ${JSON.stringify(toolResults, null, 2)}`);

      const response = await this.getFinalResponse(
        userMessage,
        contextSummary,
        knowledge,
        toolResults,
        language
      );

      console.log(`[Final Response]: "${response.substring(0, 100)}..."`);
      console.log(`[Processing Time]: ${Date.now() - startTime}ms`);
      console.log(`${'='.repeat(80)}\n`);

      return response;
    } catch (error) {
      console.error('[AGENT ERROR]', error);
      console.error(`[Failed After]: ${Date.now() - startTime}ms`);
      console.log(`${'='.repeat(80)}\n`);

      const langCode = context.language || 'en';
      if (langCode.startsWith('hi') || langCode.startsWith('mr')) {
        return 'Thoda issue aa raha hai, please dobara try karein.';
      }
      return 'There is a temporary issue right now. Please try again once more.';
    }
  }

  async getToolRequests(userMessage, contextSummary, knowledge, imageUrl, requiresTooling = false, intent = 'general', context = {}) {
    const instruction = `
You are deciding which tools to use. Respond with ONLY valid JSON.

Output format:
{
  "reasoning": "<brief explanation>",
  "toolRequests": [
    {"name": "<TOOL_NAME>", "params": { ... } }
  ]
}

Rules:
- Weather questions must call WEATHER only when city is available.
- Crop planning questions must call CROP_PLAN only when crop is available.
- Scheme questions must call SCHEMES.
- Image questions must call DISEASE.
- If required information is missing, return an empty toolRequests array.
- Never invent a city or default to Delhi, Mumbai, or any other place.
- Never use tools for meta questions.

${TOOL_DEFINITIONS}
`;

    const prompt = `CONTEXT:
${contextSummary}

AGRICULTURAL KNOWLEDGE:
${knowledge}

FARMER MESSAGE:
"${userMessage}"

INTENT:
${intent}

${requiresTooling ? 'CRITICAL: If information is complete, at least one tool must be called.' : ''}

${instruction}`;

    const llmOutput = await this.callLLM(this.systemPrompt, prompt);
    console.log(`[LLM Tool Response]:\n${llmOutput}`);

    const toolRequests = this.parseToolRequests(llmOutput);
    if (requiresTooling && toolRequests.length === 0) {
      console.warn('[ENFORCEMENT] Using heuristic tool routing.');
      return this.getDefaultToolRequests(intent, context, imageUrl);
    }

    return toolRequests;
  }

  parseToolRequests(llmOutput) {
    const cleaned = llmOutput.trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.toolRequests)) {
        return parsed.toolRequests;
      }
    } catch (error) {
      // Continue to fallback extraction.
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.toolRequests)) {
          return parsed.toolRequests;
        }
      } catch (error) {
        // Ignore invalid extracted JSON.
      }
    }

    return [];
  }

  getDefaultToolRequests(intent, context = {}, imageUrl = null) {
    if (intent === 'weather' && context.city) {
      return [{ name: 'WEATHER', params: { city: context.city } }];
    }

    if (intent === 'crop_plan' && context.crop) {
      return [{ name: 'CROP_PLAN', params: { crop: context.crop } }];
    }

    if (intent === 'schemes') {
      return [{ name: 'SCHEMES', params: {} }];
    }

    if (intent === 'disease' && imageUrl) {
      return [{ name: 'DISEASE', params: { imageUrl } }];
    }

    return [];
  }

  detectToolRequirement(intent, imageUrl = null) {
    if (imageUrl) return true;
    return ['weather', 'crop_plan', 'schemes', 'disease'].includes(intent);
  }

  detectLanguage(userMessage, previousLanguage = null) {
    if (/[\u0900-\u097F]/.test(userMessage)) {
      return 'hi';
    }
    if (/\b(ajj|aaj|kal|barish|mausam|sheher|fasal|kheti|paani|kripya|dobara)\b/i.test(userMessage)) {
      return 'hi';
    }
    if (previousLanguage) {
      return previousLanguage;
    }
    return 'en';
  }

  detectIntent(userMessage, imageUrl = null, context = {}) {
    const msg = userMessage.toLowerCase();

    if (imageUrl || /disease|pest|fungus|infection|leaf spot|blight|keeda|rog|bimari/i.test(msg)) {
      return 'disease';
    }
    if (/api|tool|real.?time|openweather|backed by weather/i.test(msg)) {
      return 'meta_api';
    }
    if (/how did you get my location|how do you know my location|mera location kaise|my location/i.test(msg)) {
      return 'meta_location';
    }
    if (/yojana|scheme|subsid|government|sarkari|loan|benefit/i.test(msg)) {
      return 'schemes';
    }
    if (/fasal|crop|plan|schedule|kharif|rabi|season|beej|sowing/i.test(msg)) {
      return 'crop_plan';
    }
    if (/barish|rain|weather|temperature|humid|mausam|garmi|thandi|climate|condition/i.test(msg)) {
      return 'weather';
    }
    if ((context.awaitingField === 'city' || context.previousAwaitingField === 'city') && this.extractCity(userMessage)) {
      return 'weather';
    }
    if ((context.awaitingField === 'crop' || context.previousAwaitingField === 'crop') && this.extractCrop(userMessage)) {
      return 'crop_plan';
    }
    if (context.previousLastTopic === 'weather' && this.extractCity(userMessage)) {
      return 'weather';
    }
    if (context.previousLastTopic === 'crop_plan' && this.extractCrop(userMessage)) {
      return 'crop_plan';
    }
    return 'general';
  }

  getMissingInfoResponse(intent, context, language) {
    if (intent === 'weather' && !context.city) {
      context.awaitingField = 'city';
      return this.getAskCityMessage(language);
    }

    if (intent === 'crop_plan' && !context.crop) {
      context.awaitingField = 'crop';
      return this.getAskCropMessage(language);
    }

    return null;
  }

  getAskCityMessage(language) {
    if (language === 'hi') {
      return 'Aap kis sheher ke liye weather jaana chahte hain?';
    }
    return 'Which city would you like the weather for?';
  }

  getAskCropMessage(language) {
    if (language === 'hi') {
      return 'Aap kis fasal ke baare mein pooch rahe hain?';
    }
    return 'Which crop are you asking about?';
  }

  answerApiQuestion(language) {
    const configured = hasRealWeatherApi();

    if (language === 'hi') {
      return configured
        ? 'Haan, weather ke liye main real-time weather API ka use karta hoon.'
        : 'Abhi weather API configured nahi hai, isliye real-time weather response available nahi hai.';
    }

    return configured
      ? 'Yes, I use a real-time weather API for weather responses.'
      : 'The weather API is not configured right now, so real-time weather is not available.';
  }

  answerLocationQuestion(context, language) {
    if (!context.city) {
      if (language === 'hi') {
        return 'Maine aapka location assume nahi kiya hai. Kripya apna sheher batayein.';
      }
      return 'I have not assumed your location. Please tell me your city.';
    }

    if (language === 'hi') {
      return `Maine aapka location guess nahi kiya. Mujhe ${context.city} aapke message ya saved context se mila tha.`;
    }
    return `I did not guess your location. I used ${context.city} from your message or saved conversation context.`;
  }

  async executeToolRequests(toolRequests) {
    const results = {};

    for (const request of toolRequests) {
      try {
        const name = String(request.name || '').toUpperCase();
        const params = request.params || {};

        switch (name) {
          case 'WEATHER': {
            if (!params.city) {
              throw new Error('WEATHER tool requires city');
            }
            const weather = await getWeather(params.city);
            if (!weather || !weather.city) {
              throw new Error('Weather tool returned invalid response');
            }
            results.weather = weather;
            break;
          }

          case 'CROP_PLAN': {
            if (!params.crop) {
              throw new Error('CROP_PLAN tool requires crop');
            }
            const plan = getCropPlan(params.crop);
            if (!plan || plan.error) {
              throw new Error(plan?.error || 'Crop plan unavailable');
            }
            results.cropPlan = plan;
            break;
          }

          case 'SCHEMES':
            results.schemes = getSchemes();
            break;

          case 'DISEASE': {
            if (!params.imageUrl) {
              throw new Error('DISEASE tool requires imageUrl');
            }
            results.disease = await detectDisease(params.imageUrl);
            break;
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`[TOOL ERROR] ${request.name}: ${error.message}`);
        throw error;
      }
    }

    return results;
  }

  async getFinalResponse(userMessage, contextSummary, knowledge, toolResults, language = 'en') {
    const languageInstruction = language === 'hi'
      ? 'Reply in Hindi.'
      : 'Reply in English.';

    const prompt = `CONTEXT:
${contextSummary}

AGRICULTURAL KNOWLEDGE:
${knowledge}

FARMER MESSAGE:
"${userMessage}"

TOOL RESULTS:
${JSON.stringify(toolResults, null, 2)}

Rules:
1. ${languageInstruction}
2. Use tool results when available.
3. Do not mention tools or internal reasoning.
4. Do not claim a city unless it appears in TOOL RESULTS or CONTEXT.
5. Be practical and concise.
`;

    const response = await this.callLLM(this.systemPrompt, prompt);
    return response.trim();
  }

  async callLLM(systemPrompt, userMessage) {
    const key = apiKeys.openRouterKey;
    if (!key) {
      throw new Error('No OpenRouter API key configured');
    }

    const response = await axios.post(
      OPENROUTER_URL,
      {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 800
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agribandhu.app',
          'X-Title': 'Agri Bandhu'
        },
        timeout: 25000
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  buildContextSummary(context) {
    const parts = [];
    if (context.city) parts.push(`Location: ${context.city}`);
    if (context.crop) parts.push(`Crop: ${context.crop}`);
    if (context.language) {
      const langName = context.language === 'hi' ? 'Hindi' : 'English';
      parts.push(`Language: ${langName}`);
    }
    if (context.awaitingField) parts.push(`Awaiting: ${context.awaitingField}`);
    return parts.length > 0 ? parts.join(' | ') : 'New conversation';
  }

  extractCity(message) {
    const cities = [
      'mumbai', 'pune', 'delhi', 'agra', 'nagpur', 'jaipur', 'lucknow', 'kolkata', 'chennai',
      'hyderabad', 'surat', 'ahmedabad', 'bhopal', 'indore', 'nashik', 'aurangabad', 'solapur',
      'varanasi', 'patna', 'gurgaon', 'noida', 'bangalore', 'kochi', 'jamshedpur', 'dilli'
    ];
    const messageLower = message.toLowerCase();

    for (const knownCity of cities) {
      if (messageLower.includes(knownCity)) {
        if (knownCity === 'dilli') return 'Delhi';
        return knownCity.charAt(0).toUpperCase() + knownCity.slice(1);
      }
    }

    return null;
  }

  extractCrop(message) {
    const crops = [
      'rice', 'wheat', 'cotton', 'maize', 'sugarcane', 'soybean', 'groundnut',
      'tomato', 'potato', 'onion', 'chawal', 'gehu', 'kapas', 'makka',
      'ganna', 'soya', 'moong', 'urad', 'chana'
    ];
    const messageLower = message.toLowerCase();

    for (const crop of crops) {
      if (messageLower.includes(crop)) {
        return crop;
      }
    }

    return null;
  }
}

module.exports = new AgriBandhuAgent();
