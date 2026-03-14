const fs = require('fs');
const path = require('path');

const schemesFilePath = path.join(__dirname, '../../database/schemes.json');

/**
 * Service to fetch government schemes
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

const findRelevantSchemes = (keyword) => {
  const allSchemes = getSchemes();
  if (!keyword) return allSchemes;
  
  const searchWords = keyword.toLowerCase().split(' ').filter(w => w.length > 3);
  if (searchWords.length === 0) return allSchemes;

  return allSchemes.filter(scheme => {
    return searchWords.some(word => 
      scheme.name.toLowerCase().includes(word) || 
      scheme.description.toLowerCase().includes(word)
    );
  });
};

module.exports = {
  getSchemes,
  findRelevantSchemes
};
