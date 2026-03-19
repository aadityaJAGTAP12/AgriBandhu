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
1) WEATHER - requires {"city": "<city name>"}.
2) CROP_PLAN - requires {"crop": "<crop name>"}.
3) SCHEMES - requires no params.
4) DISEASE - requires {"imageUrl": "<url>"}.
`;

class AgriBandhuAgent {
  constructor() {
    this.systemPrompt = `You are Agri Bandhu, an AI farming assistant for Indian farmers.

LANGUAGE:
- Always reply in the same language as the user's message.

HONESTY:
- Never assume or guess a city, crop, location, weather, or tool result.
- If required information is missing, ask the user for it.
- If the user challenges an assumption, acknowledge it directly and correct course.

STYLE:
- Be concise, practical, and conversational.
- Answer the user's actual question.
- Do not drift into unrelated farming advice.
- Do not mention hidden tools or internal reasoning.
`;
  }

  async processMessage(userMessage, context = {}, imageUrl = null) {
    const startTime = Date.now();

    try {
      console.log(`\n${'='.repeat(80)}`);
      console.log('[AGENT START] Processing message');
      console.log(`[Message]: "${userMessage}"`);
      console.log(`[Context]: ${JSON.stringify(context)}`);

      const previousLanguage = context.language;
      const previousAwaitingField = context.awaitingField;
      const language = this.detectLanguage(userMessage, previousLanguage);
      context.language = language;

      const crop = this.extractCrop(userMessage, context);
      if (crop) {
        context.crop = crop;
        if (context.awaitingField === 'crop') {
          context.awaitingField = null;
        }
      }

      const city = this.extractCity(userMessage, context);
      if (city) {
        context.city = city;
        if (context.awaitingField === 'city') {
          context.awaitingField = null;
        }
      }

      const intent = this.detectIntent(userMessage, imageUrl, {
        ...context,
        previousAwaitingField
      });
      context.lastTopic = intent !== 'general' ? intent : context.lastTopic;
      console.log(`[Intent]: ${intent}`);

      if (intent === 'greeting') {
        return await this.generateRedirectResponse(
          userMessage,
          context,
          'The user sent a greeting. Reply with a short greeting and ask how you can help with farming.',
          { short: true }
        );
      }

      if (intent === 'meta_correction') {
        return await this.generateRedirectResponse(
          userMessage,
          context,
          'The user says the assistant assumed something incorrectly. Acknowledge that directly, avoid excuses, and ask what they want to know instead.',
          { short: true }
        );
      }

      if (intent === 'meta_api' || intent === 'meta_location' || intent === 'meta_location_api') {
        return await this.generateTransparencyResponse(userMessage, context, intent);
      }

      if (intent === 'general') {
        return await this.generateGeneralResponse(userMessage, context);
      }

      const missingField = this.getMissingField(intent, context, imageUrl);
      if (missingField) {
        context.awaitingField = missingField;
        return await this.generateMissingInfoPrompt(userMessage, context, intent, missingField);
      }

      const knowledge = ragRetriever.retrieveKnowledge(userMessage);
      const contextSummary = this.buildContextSummary(context);
      const requiresTooling = this.detectToolRequirement(intent, imageUrl);

      console.log(`[Context Summary]: ${contextSummary}`);
      console.log(`[Tooling]: ${requiresTooling ? 'required' : 'not required'}`);

      const toolRequests = requiresTooling
        ? await this.getToolRequests(userMessage, contextSummary, knowledge, imageUrl, intent, context)
        : [];
      const validatedToolRequests = this.validateToolRequests(toolRequests, intent, context, imageUrl);
      console.log(`[Validated Tool Requests]: ${JSON.stringify(validatedToolRequests)}`);

      const toolResults = validatedToolRequests.length > 0
        ? await this.executeToolRequests(validatedToolRequests)
        : {};
      console.log(`[Tool Results]: ${JSON.stringify(toolResults, null, 2)}`);

      this.ensureToolResults(intent, toolResults);

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

  async getToolRequests(userMessage, contextSummary, knowledge, imageUrl, intent, context) {
    const prompt = `CONTEXT:
${contextSummary}

AGRICULTURAL KNOWLEDGE:
${knowledge}

USER MESSAGE:
"${userMessage}"

INTENT:
${intent}

Return ONLY valid JSON in this format:
{
  "toolRequests": [
    {"name": "<TOOL_NAME>", "params": { ... } }
  ]
}

Rules:
- WEATHER can be used only if city is already known in context.
- CROP_PLAN can be used only if crop is already known in context.
- SCHEMES can be used for government scheme questions.
- DISEASE can be used only if an imageUrl exists.
- Never invent missing params.
- Never return WEATHER without city.
- Never return CROP_PLAN without crop.
- If no valid tool call can be made, return {"toolRequests": []}.

Known context:
- city: ${context.city || 'missing'}
- crop: ${context.crop || 'missing'}
- image provided: ${imageUrl ? 'yes' : 'no'}

${TOOL_DEFINITIONS}`;

    const llmOutput = await this.callLLM(this.systemPrompt, prompt);
    console.log(`[LLM Tool Response]:\n${llmOutput}`);
    return this.parseToolRequests(llmOutput);
  }

  parseToolRequests(llmOutput) {
    const cleaned = llmOutput.trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.toolRequests)) {
        return parsed.toolRequests;
      }
    } catch (error) {
      // Continue to substring extraction.
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.toolRequests)) {
          return parsed.toolRequests;
        }
      } catch (error) {
        // Ignore invalid JSON.
      }
    }

    return [];
  }

  validateToolRequests(toolRequests, intent, context = {}, imageUrl = null) {
    const validated = [];

    for (const request of toolRequests) {
      const name = String(request?.name || '').toUpperCase();
      const params = request?.params || {};

      if (name === 'WEATHER') {
        const city = String(params.city || context.city || '').trim();
        if (!city) continue;
        validated.push({ name: 'WEATHER', params: { city } });
        continue;
      }

      if (name === 'CROP_PLAN') {
        const crop = String(params.crop || context.crop || '').trim();
        if (!crop) continue;
        validated.push({ name: 'CROP_PLAN', params: { crop } });
        continue;
      }

      if (name === 'SCHEMES' && intent === 'schemes') {
        validated.push({ name: 'SCHEMES', params: {} });
        continue;
      }

      if (name === 'DISEASE') {
        const toolImageUrl = String(params.imageUrl || imageUrl || '').trim();
        if (!toolImageUrl) continue;
        validated.push({ name: 'DISEASE', params: { imageUrl: toolImageUrl } });
      }
    }

    if (validated.length > 0) {
      return validated;
    }

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
    return previousLanguage || 'en';
  }

  detectIntent(userMessage, imageUrl = null, context = {}) {
    const msg = userMessage.toLowerCase().trim();
    const extractedCity = this.extractCity(userMessage, context);
    const extractedCrop = this.extractCrop(userMessage, context);

    if (this.isSimpleGreeting(msg)) {
      return 'greeting';
    }
    if (imageUrl || /disease|pest|fungus|infection|leaf spot|blight|keeda|rog|bimari/i.test(msg)) {
      return 'disease';
    }
    if (this.isLocationAndApiQuestion(msg)) {
      return 'meta_location_api';
    }
    if (this.isCorrectionMessage(msg)) {
      return 'meta_correction';
    }
    if (this.isApiQuestion(msg)) {
      return 'meta_api';
    }
    if (this.isLocationQuestion(msg)) {
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
    if ((context.awaitingField === 'city' || context.previousAwaitingField === 'city') && extractedCity) {
      return 'weather';
    }
    if ((context.awaitingField === 'crop' || context.previousAwaitingField === 'crop') && extractedCrop) {
      return 'crop_plan';
    }
    return 'general';
  }

  getMissingField(intent, context, imageUrl) {
    if (intent === 'weather' && !String(context.city || '').trim()) {
      return 'city';
    }
    if (intent === 'crop_plan' && !String(context.crop || '').trim()) {
      return 'crop';
    }
    if (intent === 'disease' && !String(imageUrl || '').trim()) {
      return 'image';
    }
    return null;
  }

  async generateMissingInfoPrompt(userMessage, context, intent, missingField) {
    const fieldText = missingField === 'city'
      ? 'city'
      : missingField === 'crop'
      ? 'crop'
      : 'image';

    return this.generateRedirectResponse(
      userMessage,
      context,
      `The user asked about ${intent}, but the required ${fieldText} is missing. Ask for the missing ${fieldText} politely. Keep it short.`,
      { short: true }
    );
  }

  async generateTransparencyResponse(userMessage, context, intent) {
    const locationFact = context.city
      ? `Known city from saved context: ${context.city}.`
      : 'No city is currently known.';
    const apiFact = hasRealWeatherApi()
      ? 'Weather API is configured.'
      : 'Weather API is not configured.';

    let instruction = 'Answer the user honestly and directly.';
    if (intent === 'meta_api') {
      instruction = 'The user is asking whether weather data comes from an API. Answer directly and honestly. Do not give a weather forecast.';
    } else if (intent === 'meta_location') {
      instruction = 'The user is asking how location was known. Answer directly and honestly. If no city is known, say that clearly and ask them to share their city.';
    } else if (intent === 'meta_location_api') {
      instruction = 'The user is asking both about location and API usage. Address both parts directly and honestly. Do not give a weather forecast.';
    }

    return this.generateRedirectResponse(
      userMessage,
      context,
      `${instruction}

Facts:
- ${locationFact}
- ${apiFact}`,
      { short: true }
    );
  }

  async generateGeneralResponse(userMessage, context) {
    return this.generateRedirectResponse(
      userMessage,
      context,
      'The user intent is unclear or vague. Ask a short clarifying question about how you can help with farming. Do not give advice yet.',
      { short: true }
    );
  }

  async generateRedirectResponse(userMessage, context, instruction, options = {}) {
    const contextSummary = this.buildContextSummary(context);
    const prompt = `USER MESSAGE:
"${userMessage}"

CONTEXT:
${contextSummary}

INSTRUCTION:
${instruction}

Constraints:
- Use the same language as the user.
- Keep the response ${options.short ? 'short' : 'natural and focused'}.
- Do not assume missing facts.
- Address the user's actual message directly.`;

    const response = await this.callLLM(this.systemPrompt, prompt);
    return response.trim();
  }

  isSimpleGreeting(message) {
    return /^(hi|hii|hello|hey|namaste|namaskar)$/.test(message);
  }

  isApiQuestion(message) {
    return /api|tool|real.?time|openweather|backed by weather/i.test(message);
  }

  isLocationQuestion(message) {
    return /how did you get my location|how do you know my location|why do you know my location|i didn't tell you my city|i didnt tell you my city|i did not tell you my city|i didn't tell my city|i didnt tell my city|i did not tell my city|mera location kaise/i.test(message);
  }

  isLocationAndApiQuestion(message) {
    return (
      /didnt tell you my location|did not tell you my location|i didn't tell you my location|i didnt tell you my location|i didn't tell you my city|i didnt tell you my city|i did not tell you my city|i didn't tell my city|i didnt tell my city|i did not tell my city|how did you get my location|how do you know my location|why do you know my location/i.test(message) &&
      this.isApiQuestion(message)
    );
  }

  isCorrectionMessage(message) {
    return /i didnt ask|i didn't ask|did not ask|why are you telling me this|why are you talking about weather|i never asked|wrong answers|wrong answer|why are you giving wrong answers/i.test(message);
  }

  looksLikeStandaloneAnswer(message) {
    return Boolean(message) && !/[?]/.test(message) && message.length <= 60;
  }

  async executeToolRequests(toolRequests) {
    const results = {};

    for (const request of toolRequests) {
      const name = String(request.name || '').toUpperCase();
      const params = request.params || {};

      switch (name) {
        case 'WEATHER': {
          const city = String(params.city || '').trim();
          if (!city) {
            throw new Error('WEATHER tool requires city');
          }
          const weather = await getWeather(city);
          if (!weather || !weather.city) {
            throw new Error('Weather tool returned invalid response');
          }
          results.weather = weather;
          break;
        }

        case 'CROP_PLAN': {
          const crop = String(params.crop || '').trim();
          if (!crop) {
            throw new Error('CROP_PLAN tool requires crop');
          }
          const plan = getCropPlan(crop);
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
          const toolImageUrl = String(params.imageUrl || '').trim();
          if (!toolImageUrl) {
            throw new Error('DISEASE tool requires imageUrl');
          }
          results.disease = await detectDisease(toolImageUrl);
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    }

    return results;
  }

  ensureToolResults(intent, toolResults) {
    if (intent === 'weather' && !toolResults.weather) {
      throw new Error('Weather flow reached final response without weather tool results');
    }
    if (intent === 'crop_plan' && !toolResults.cropPlan) {
      throw new Error('Crop plan flow reached final response without crop plan results');
    }
    if (intent === 'disease' && !toolResults.disease) {
      throw new Error('Disease flow reached final response without disease tool results');
    }
  }

  async getFinalResponse(userMessage, contextSummary, knowledge, toolResults, language = 'en') {
    const languageInstruction = language === 'hi' ? 'Reply in Hindi.' : 'Reply in English.';

    const prompt = `CONTEXT:
${contextSummary}

AGRICULTURAL KNOWLEDGE:
${knowledge}

USER MESSAGE:
"${userMessage}"

TOOL RESULTS:
${JSON.stringify(toolResults, null, 2)}

Rules:
1. ${languageInstruction}
2. Use tool results when available.
3. Answer only the user's actual question.
4. Do not pretend to know missing facts.
5. Do not add unrelated farming advice unless it directly helps answer the question.
6. Do not claim any location unless it appears in TOOL RESULTS or CONTEXT.`;

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
        temperature: 0.2,
        max_tokens: 500
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

  extractCity(message, context = {}) {
    const trimmed = String(message || '').trim();

    if ((context.awaitingField === 'city' || context.previousAwaitingField === 'city') && this.looksLikeStandaloneAnswer(trimmed)) {
      return this.toTitleCase(trimmed);
    }

    const patterns = [
      /\b(?:in|for|at)\s+([a-zA-Z][a-zA-Z\s-]{1,40})/i,
      /\b(?:city|location)\s*(?:is|:)?\s*([a-zA-Z][a-zA-Z\s-]{1,40})/i
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) {
        return this.toTitleCase(match[1].trim());
      }
    }

    return null;
  }

  extractCrop(message, context = {}) {
    const crops = [
      'rice', 'wheat', 'cotton', 'maize', 'sugarcane', 'soybean', 'groundnut',
      'tomato', 'potato', 'onion', 'chawal', 'gehu', 'kapas', 'makka',
      'ganna', 'soya', 'moong', 'urad', 'chana'
    ];
    const messageLower = String(message || '').toLowerCase();

    if ((context.awaitingField === 'crop' || context.previousAwaitingField === 'crop') && this.looksLikeStandaloneAnswer(messageLower)) {
      return messageLower.trim();
    }

    for (const crop of crops) {
      if (messageLower.includes(crop)) {
        return crop;
      }
    }

    return null;
  }

  toTitleCase(value) {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
}

module.exports = new AgriBandhuAgent();
