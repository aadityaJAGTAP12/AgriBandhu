const fs = require('fs');
const path = require('path');

/**
 * Simple RAG Retriever for agriculture knowledge
 * Uses basic keyword matching for retrieval
 */
class RagRetriever {
  constructor() {
    this.knowledgeBase = {};
    this.loadKnowledgeBase();
  }

  /**
   * Load all knowledge documents from the knowledge folder
   */
  loadKnowledgeBase() {
    const knowledgeDir = path.join(__dirname, '../../knowledge');

    try {
      const files = fs.readdirSync(knowledgeDir);
      files.forEach(file => {
        if (file.endsWith('.txt')) {
          const filePath = path.join(knowledgeDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const docName = file.replace('.txt', '');
          this.knowledgeBase[docName] = content;
        }
      });
      console.log(`[RAG] Loaded ${Object.keys(this.knowledgeBase).length} knowledge documents`);
    } catch (error) {
      console.error('[RAG] Error loading knowledge base:', error.message);
    }
  }

  /**
   * Retrieve relevant knowledge chunks based on user query
   * @param {string} query - User's question
   * @param {number} maxChunks - Maximum number of chunks to return
   * @returns {string} - Concatenated relevant knowledge
   */
  retrieveKnowledge(query, maxChunks = 3) {
    const queryLower = query.toLowerCase();
    const scores = [];

    // Simple keyword-based scoring
    for (const [docName, content] of Object.entries(this.knowledgeBase)) {
      const score = this.calculateRelevanceScore(queryLower, content.toLowerCase());
      if (score > 0) {
        scores.push({ docName, content, score });
      }
    }

    // Sort by relevance score and take top chunks
    scores.sort((a, b) => b.score - a.score);
    const topChunks = scores.slice(0, maxChunks);

    // Extract relevant sections from top documents
    const relevantKnowledge = topChunks.map(item => {
      const sections = this.extractRelevantSections(queryLower, item.content);
      return `${item.docName.toUpperCase()}:\n${sections}`;
    }).join('\n\n');

    return relevantKnowledge || 'No specific agricultural knowledge found for this query.';
  }

  /**
   * Calculate relevance score based on keyword matches
   */
  calculateRelevanceScore(query, content) {
    const keywords = this.extractKeywords(query);
    let score = 0;

    keywords.forEach(keyword => {
      // Count occurrences of keyword
      const regex = new RegExp(keyword, 'gi');
      const matches = content.match(regex);
      if (matches) {
        score += matches.length;
      }

      // Bonus for exact phrase matches
      if (content.includes(keyword)) {
        score += 2;
      }
    });

    return score;
  }

  /**
   * Extract keywords from query
   */
  extractKeywords(query) {
    // Common agricultural keywords
    const agriKeywords = [
      'rice', 'wheat', 'cotton', 'maize', 'sugarcane', 'soybean', 'groundnut',
      'tomato', 'potato', 'onion', 'kharif', 'rabi', 'monsoon', 'irrigation',
      'fertilizer', 'pesticide', 'disease', 'pest', 'weed', 'soil', 'weather',
      'rain', 'temperature', 'humidity', 'plant', 'crop', 'seed', 'sowing',
      'harvest', 'yield', 'farm', 'farmer', 'agriculture'
    ];

    const words = query.split(/\s+/);
    const keywords = [];

    words.forEach(word => {
      if (word.length > 2 && agriKeywords.some(kw => kw.includes(word) || word.includes(kw))) {
        keywords.push(word);
      }
    });

    // Add bigrams for better matching
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram.length > 4) {
        keywords.push(bigram);
      }
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Extract relevant sections from document content
   */
  extractRelevantSections(query, content) {
    const lines = content.split('\n');
    const relevantLines = [];
    const queryWords = query.split(/\s+/).filter(w => w.length > 2);

    lines.forEach((line, index) => {
      const lineLower = line.toLowerCase();
      const relevanceScore = queryWords.reduce((score, word) => {
        return score + (lineLower.includes(word) ? 1 : 0);
      }, 0);

      if (relevanceScore > 0 || line.includes('•') || line.includes('-')) {
        relevantLines.push(line);
      }
    });

    // If no relevant lines found, return first few lines as summary
    if (relevantLines.length === 0) {
      return lines.slice(0, 10).join('\n');
    }

    // Limit to most relevant sections
    return relevantLines.slice(0, 15).join('\n');
  }
}

module.exports = new RagRetriever();