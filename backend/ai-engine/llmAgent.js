const axios = require('axios');
const apiKeys = require('../config/apiKeys');
const { getWeather } = require('../services/weatherService');
const { getCropPlan } = require('../services/cropService');
const { getSchemes } = require('../services/schemeService');
const { detectDisease } = require('../services/diseaseDetection');
const ragRetriever = require('./ragRetriever');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-3.5-turbo';

const TOOL_DEFINITIONS = `
TOOLS AVAILABLE (use ONLY for structured tool calls):
1) WEATHER - needs {"city": "<city name>"}; returns {temperature, humidity, rainfall, condition, city}.
2) CROP_PLAN - needs {"crop": "<crop name>"}; returns crop schedule with season, duration_days, plan.
3) SCHEMES - no params; returns an array of scheme objects.
4) DISEASE - needs {"imageUrl": "<url>"}; returns a disease analysis object.
`;

/**
 * Agri Bandhu LLM Agent - Pure LLM-driven tool orchestration
 * Backend only executes tool calls requested by the LLM.
 */
class AgriBandhuAgent {
  constructor() {
    this.systemPrompt = `You are Agri Bandhu, an AI farming assistant for Indian farmers.

You provide practical, helpful farming advice based on weather, crop planning, government schemes, plant health, and best agricultural practices.

LANGUAGE: Always respond in the same language as the farmer's message (Hindi/Marathi/English).

STYLE:
- Conversational and farmer-friendly
- Practical and actionable
- Provide a useful answer even if you are not 100% sure; do NOT say "I'm not sure", "I don't understand", "I cannot help", or similar.
- Do not invent facts; rely on the provided knowledge and tool data
- Do not include menus unless the user explicitly asks for "menu" (case-insensitive)
- Avoid structured tables, numbered lists, or heavy emoji formatting; respond in natural sentences.
- Do not mention IP addresses, location tracking, or how you obtain information.
`;
  }

  /**
   * Main entrypoint: send message to the LLM, run tools it requests, then ask LLM for a final reply.
   */
  async processMessage(userMessage, context = {}, imageUrl = null) {
    try {
      console.log(`[Agent] Processing: "${userMessage}" Context: ${JSON.stringify(context)}`);

      // Keep crop context (for follow-up questions)
      if (!context.crop) {
        const crop = this.extractCrop(userMessage);
        if (crop) context.crop = crop;
      }

      const knowledge = ragRetriever.retrieveKnowledge(userMessage);
      const contextSummary = this.buildContextSummary(context);

      // Ask the LLM which tools (if any) to call
      const toolRequests = await this.getToolRequests(userMessage, contextSummary, knowledge, imageUrl);

      // Execute requested tools
      const toolResults = toolRequests.length > 0 ? await this.executeToolRequests(toolRequests) : {};

      // Generate final natural response
      const response = await this.getFinalResponse(userMessage, contextSummary, knowledge, toolResults);
      return response;

    } catch (error) {
      console.error('[Agent Error]', error);
      // Minor infrastructure fallback (only for unexpected failures)
      return "क्षमा करें, कुछ तकनीकी दिक्कत है। कृपया दोबारा प्रयास करें।";
    }
  }

  async getToolRequests(userMessage, contextSummary, knowledge, imageUrl) {
    const instruction = `
You will output ONLY a JSON object with the following shape:
{
  "toolRequests": [
    {"name": "<TOOL_NAME>", "params": { ... } },
    ...
  ]
}

- If no tool is needed, output: {"toolRequests": []}
- Do NOT output any extra text outside the JSON.
- Valid tool names: WEATHER, CROP_PLAN, SCHEMES, DISEASE
- For ANY question about weather, temperature, rainfall, humidity, or climate conditions, you MUST call the WEATHER tool with the city mentioned in the message (extract the city name; if none specified, use "Delhi").
- For crop planning questions, call CROP_PLAN with the crop name.
- For government schemes, call SCHEMES.
- For disease detection, call DISEASE with imageUrl if an image is provided.
${imageUrl ? '- Use the imageUrl param in DISEASE when appropriate.' : ''}

${TOOL_DEFINITIONS}
`;

    const prompt = `CONTEXT:
${contextSummary}

AGRICULTURAL KNOWLEDGE:
${knowledge}

FARMER MESSAGE:
"${userMessage}"

${instruction}`;

    const llmOutput = await this.callLLM(this.systemPrompt, prompt);
    return this.parseToolRequests(llmOutput);
  }

  parseToolRequests(llmOutput) {
    const cleaned = llmOutput.trim();

    // Try direct JSON parsing
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.toolRequests)) return parsed.toolRequests;
    } catch (e) {
      // Try extracting JSON substring
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.toolRequests)) return parsed.toolRequests;
        } catch (e2) {
          // ignore
        }
      }
    }

    return [];
  }

  async executeToolRequests(toolRequests) {
    const results = {};

    for (const request of toolRequests) {
      try {
        const name = (request.name || '').toUpperCase();
        const params = request.params || {};

        switch (name) {
          case 'WEATHER':
            if (params.city) results.weather = await getWeather(params.city);
            break;
          case 'CROP_PLAN':
            if (params.crop) results.cropPlan = getCropPlan(params.crop);
            break;
          case 'SCHEMES':
            results.schemes = getSchemes();
            break;
          case 'DISEASE':
            if (params.imageUrl) results.disease = await detectDisease(params.imageUrl);
            break;
        }
      } catch (error) {
        console.error(`[Tool Error] ${request.name}:`, error.message);
      }
    }

    return results;
  }

  async getFinalResponse(userMessage, contextSummary, knowledge, toolResults) {
    const prompt = `CONTEXT:
${contextSummary}

AGRICULTURAL KNOWLEDGE:
${knowledge}

FARMER MESSAGE:
"${userMessage}"

TOOL RESULTS:
${JSON.stringify(toolResults, null, 2)}

Using the knowledge and tool results above, provide a natural, practical response to the farmer. Avoid bullet lists and tables. Do not output any JSON; only a conversational reply. If tool results are empty, still answer with general farming advice rather than saying you found nothing.`;

    const response = await this.callLLM(this.systemPrompt, prompt);
    return response.trim();
  }

  async callLLM(systemPrompt, userMessage) {
    const key = apiKeys.openRouterKey;
    if (!key) throw new Error('No OpenRouter API key configured');

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
          'Authorization': `Bearer ${key}`,
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
    if (context.crop) parts.push(`Crop focus: ${context.crop}`);
    if (context.language && context.language !== 'en') parts.push(`Language: ${context.language}`);
    return parts.join(', ') || 'New conversation';
  }

  extractCity(message) {
    const cities = ['mumbai', 'pune', 'delhi', 'agra', 'nagpur', 'jaipur', 'lucknow', 'kolkata', 'chennai', 'hyderabad', 'surat', 'ahmedabad', 'bhopal', 'indore', 'nashik', 'aurangabad', 'solapur'];
    const messageLower = message.toLowerCase();

    for (const city of cities) {
      if (messageLower.includes(city)) {
        return city.charAt(0).toUpperCase() + city.slice(1);
      }
    }
    return null;
  }

  extractCrop(message) {
    const crops = ['rice', 'wheat', 'cotton', 'maize', 'sugarcane', 'soybean', 'groundnut', 'tomato', 'potato', 'onion', 'chawal', 'gehu', 'kapas', 'makka', 'ganna', 'soya', 'moong', 'urad', 'chana'];
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
