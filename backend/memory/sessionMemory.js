/**
 * Lightweight conversation memory for Agri Bandhu
 * Stores per-phone context for natural conversations
 */
class SessionMemory {
  constructor() {
    this.memory = new Map(); // phone -> context object
  }

  /**
   * Get memory for a phone number
   * @param {string} phone - Phone number
   * @returns {object} - Memory context
   */
  get(phone) {
    if (!this.memory.has(phone)) {
      this.memory.set(phone, {
        language: 'en',
        city: null,
        crop: null,
        lastTopic: null,
        conversationHistory: [],
        onboarded: false,
        lastInteraction: Date.now()
      });
    }
    return this.memory.get(phone);
  }

  /**
   * Update memory for a phone number
   * @param {string} phone - Phone number
   * @param {object} updates - Properties to update
   */
  update(phone, updates) {
    const context = this.get(phone);
    Object.assign(context, updates);
    context.lastInteraction = Date.now();
    this.memory.set(phone, context);
  }

  /**
   * Add a conversation turn to memory
   * @param {string} phone - Phone number
   * @param {string} userMessage - User's message
   * @param {string} botResponse - Bot's response
   */
  addConversation(phone, userMessage, botResponse) {
    const context = this.get(phone);
    context.conversationHistory.push({
      timestamp: Date.now(),
      user: userMessage,
      bot: botResponse
    });

    // Keep only last 10 conversations to save memory
    if (context.conversationHistory.length > 10) {
      context.conversationHistory = context.conversationHistory.slice(-10);
    }

    this.memory.set(phone, context);
  }

  /**
   * Get recent context summary for LLM
   * @param {string} phone - Phone number
   * @returns {string} - Context summary
   */
  getContextSummary(phone) {
    const context = this.get(phone);
    const summary = [];

    if (context.city) summary.push(`Location: ${context.city}`);
    if (context.crop) summary.push(`Current crop: ${context.crop}`);
    if (context.lastTopic) summary.push(`Last topic: ${context.lastTopic}`);
    if (context.language && context.language !== 'en') summary.push(`Language: ${context.language}`);

    if (context.conversationHistory.length > 0) {
      const lastConv = context.conversationHistory[context.conversationHistory.length - 1];
      summary.push(`Last conversation: User asked about "${lastConv.user.slice(0, 50)}..."`);
    }

    return summary.length > 0 ? summary.join(', ') : 'New conversation';
  }

  /**
   * Clear old memories (cleanup)
   * @param {number} maxAge - Maximum age in milliseconds (default 7 days)
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [phone, context] of this.memory.entries()) {
      if (now - context.lastInteraction > maxAge) {
        this.memory.delete(phone);
      }
    }
  }

  /**
   * Get memory stats
   * @returns {object} - Memory statistics
   */
  getStats() {
    return {
      totalUsers: this.memory.size,
      activeUsers: Array.from(this.memory.values()).filter(ctx =>
        Date.now() - ctx.lastInteraction < 24 * 60 * 60 * 1000
      ).length
    };
  }
}

module.exports = new SessionMemory();