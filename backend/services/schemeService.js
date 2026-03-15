const fs = require('fs');
const path = require('path');

const schemesFilePath = path.join(__dirname, '../../database/schemes.json');

/**
 * Get all government schemes
 * @returns {array} - Array of scheme objects
 */
const getSchemes = () => {
  try {
    const data = fs.readFileSync(schemesFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading schemes database:", error);
    return [];
  }
};

/**
 * Find relevant schemes based on keyword/crop
 * @param {string} keyword - Search keyword
 * @returns {array} - Filtered schemes
 */
const findRelevantSchemes = (keyword) => {
  const allSchemes = getSchemes();
  if (!keyword) return allSchemes;

  const searchWords = keyword.toLowerCase().split(' ').filter(w => w.length > 3);
  if (searchWords.length === 0) return allSchemes;

  return allSchemes.filter(scheme => {
    const schemeText = `${scheme.name} ${scheme.description} ${scheme.benefit}`.toLowerCase();
    return searchWords.some(word =>
      schemeText.includes(word)
    );
  });
};

module.exports = {
  getSchemes,
  findRelevantSchemes
};
