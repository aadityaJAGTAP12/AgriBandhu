const axios = require('axios');
const apiKeys = require('../config/apiKeys');
const { getWeather } = require('../services/weatherService');
const { getCropPlan } = require('../services/cropService');
const { getSchemes } = require('../services/schemeService');
const { detectDisease } = require('../services/diseaseDetection');
const ragRetriever = require('./ragRetriever');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.0-flash-exp:free';

/**
 * Agri Bandhu LLM Agent with Tool Calling
 */
class AgriBandhuAgent {
  constructor() {
    this.systemPrompt = `You are Agri Bandhu, an AI farming assistant designed for Indian farmers.

You provide help with:
- Weather information and irrigation advice
- Crop planning and scheduling
- Government schemes and subsidies
- Plant disease detection and treatment
- General farming advice

You understand Hindi, Marathi, and English naturally.

Always reply in the same language as the farmer's message.

Use simple, practical language suitable for farmers.

You have access to these tools:
- getWeather(city): Get current weather for a city
- getCropPlan(crop): Get farming schedule for a crop
- getSchemes(): Get government agriculture schemes
- detectDisease(imageUrl): Detect plant diseases from images

Use tools whenever you need accurate, up-to-date information.

You will also receive relevant agricultural knowledge from trusted documents.

Combine weather data, crop knowledge, and context to give practical farming advice.

If weather shows rain, suggest irrigation adjustments.
If discussing crops, reference the crop calendar.
If mentioning diseases, provide treatment advice.

Keep responses short and actionable. Use emojis appropriately.

Format: Natural conversation, not robotic lists.`;
  }

  /**
   * Main agent function - process user message and return response
   * @param {string} userMessage - Farmer's message
   * @param {object} context - Conversation context (city, crop, language, etc.)
   * @param {string} imageUrl - Optional image URL for disease detection
   * @returns {string} - Natural language response
   */
  async processMessage(userMessage, context = {}, imageUrl = null) {
    try {
      console.log(`[Agent] Processing: "${userMessage}" Context: ${JSON.stringify(context)}`);

      // Retrieve relevant knowledge
      const knowledge = ragRetriever.retrieveKnowledge(userMessage);

      // Build conversation context
      const contextSummary = this.buildContextSummary(context);

      // Check if image was sent
      let diseaseResult = null;
      if (imageUrl) {
        diseaseResult = await detectDisease(imageUrl);
      }

      // Determine if tools are needed
      const toolCalls = await this.decideToolCalls(userMessage, context, imageUrl);

      // Execute tools
      const toolResults = await this.executeTools(toolCalls);

      // Generate final response
      const response = await this.generateResponse(
        userMessage,
        context,
        knowledge,
        contextSummary,
        toolResults,
        diseaseResult
      );

      return response;

    } catch (error) {
      console.error('[Agent Error]', error);
      return this.getFallbackResponse(userMessage, context);
    }
  }

  /**
   * Decide which tools to call based on user message
   */
  async decideToolCalls(userMessage, context, imageUrl) {
    const message = userMessage.toLowerCase();
    const toolCalls = [];

    // Weather-related queries
    if (message.includes('weather') || message.includes('mausam') ||
        message.includes('barish') || message.includes('rain') ||
        message.includes('temperature') || message.includes('tapman') ||
        message.includes('pani') || message.includes('irrigation') ||
        message.includes('sinchai')) {
      toolCalls.push({
        name: 'getWeather',
        parameters: { city: context.city || 'Delhi' }
      });
    }

    // Crop planning queries
    if (message.includes('plan') || message.includes('schedule') ||
        message.includes('crop') || message.includes('farming') ||
        message.includes('kheti') || message.includes('fasal')) {
      // Extract crop name from message or context
      const cropName = this.extractCropName(userMessage) || context.crop;
      if (cropName) {
        toolCalls.push({
          name: 'getCropPlan',
          parameters: { crop: cropName }
        });
      }
    }

    // Government scheme queries
    if (message.includes('scheme') || message.includes('yojana') ||
        message.includes('government') || message.includes('subsidy') ||
        message.includes('bima') || message.includes('insurance') ||
        message.includes('pm-kisan') || message.includes('kisan')) {
      toolCalls.push({
        name: 'getSchemes',
        parameters: {}
      });
    }

    // Disease detection
    if (imageUrl || message.includes('disease') || message.includes('bimari') ||
        message.includes('rog') || message.includes('spot') || message.includes('daag')) {
      toolCalls.push({
        name: 'detectDisease',
        parameters: { imageUrl: imageUrl }
      });
    }

    return toolCalls;
  }

  /**
   * Execute the decided tool calls
   */
  async executeTools(toolCalls) {
    const results = {};

    for (const toolCall of toolCalls) {
      try {
        switch (toolCall.name) {
          case 'getWeather':
            results.weather = await getWeather(toolCall.parameters.city);
            break;
          case 'getCropPlan':
            results.cropPlan = getCropPlan(toolCall.parameters.crop);
            break;
          case 'getSchemes':
            results.schemes = getSchemes();
            break;
          case 'detectDisease':
            if (toolCall.parameters.imageUrl) {
              results.disease = await detectDisease(toolCall.parameters.imageUrl);
            }
            break;
        }
      } catch (error) {
        console.error(`[Tool Error] ${toolCall.name}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Generate final response using LLM
   */
  async generateResponse(userMessage, context, knowledge, contextSummary, toolResults, diseaseResult) {
    // Build the prompt
    let prompt = `${this.systemPrompt}

CONTEXT: ${contextSummary}

AGRICULTURAL KNOWLEDGE:
${knowledge}

`;

    // Add tool results
    if (Object.keys(toolResults).length > 0) {
      prompt += '\nTOOL RESULTS:\n';
      if (toolResults.weather) {
        prompt += `Weather: ${JSON.stringify(toolResults.weather)}\n`;
      }
      if (toolResults.cropPlan) {
        prompt += `Crop Plan: ${JSON.stringify(toolResults.cropPlan)}\n`;
      }
      if (toolResults.schemes) {
        prompt += `Schemes: ${JSON.stringify(toolResults.schemes.slice(0, 3))}\n`;
      }
      if (toolResults.disease) {
        prompt += `Disease Detection: ${JSON.stringify(toolResults.disease)}\n`;
      }
    }

    // Add disease result if from image
    if (diseaseResult) {
      prompt += `\nDISEASE FROM IMAGE: ${JSON.stringify(diseaseResult)}\n`;
    }

    prompt += `\nFarmer's message: "${userMessage}"

Respond naturally and helpfully. Keep it concise but informative.`;

    // Call LLM
    const response = await this.callLLM(prompt, userMessage);

    return response;
  }

  /**
   * Call OpenRouter LLM
   */
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
        max_tokens: 600
      },
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agribandhu.app',
          'X-Title': 'Agri Bandhu'
        },
        timeout: 20000
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  /**
   * Build context summary for LLM
   */
  buildContextSummary(context) {
    const parts = [];
    if (context.city) parts.push(`Farmer's location: ${context.city}`);
    if (context.crop) parts.push(`Current crop focus: ${context.crop}`);
    if (context.language && context.language !== 'en') parts.push(`Language: ${context.language}`);
    return parts.join('. ') || 'New conversation';
  }

  /**
   * Extract crop name from message
   */
  extractCropName(message) {
    const crops = ['rice', 'wheat', 'cotton', 'maize', 'sugarcane', 'soybean', 'groundnut', 'tomato', 'potato', 'onion',
                   'chawal', 'gehu', 'kapas', 'makka', 'ganna', 'soya', 'moong', 'urad', 'chana'];
    const messageLower = message.toLowerCase();

    for (const crop of crops) {
      if (messageLower.includes(crop)) {
        return crop;
      }
    }
    return null;
  }

  /**
   * Fallback response when LLM fails
   */
  getFallbackResponse(userMessage, context) {
    const lang = context.language || 'en';

    if (lang === 'hi') {
      return "क्षमा करें, कुछ तकनीकी समस्या हुई। कृपया बाद में फिर से प्रयास करें। आप मौसम, फसल योजना, या सरकारी योजनाओं के बारे में पूछ सकते हैं।";
    } else if (lang === 'mr') {
      return "क्षमा करा, काही तांत्रिक अडचण झाली. कृपया नंतर पुन्हा प्रयत्न करा. तुम्ही हवामान, पिक योजना, किंवा सरकारी योजना बद्दल विचारू शकता.";
    } else {
      return "Sorry, there was a technical issue. Please try again later. You can ask about weather, crop planning, or government schemes.";
    }
  }
}

module.exports = new AgriBandhuAgent();
