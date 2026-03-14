require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const key = process.env.GEMINI_API_KEY;
console.log('Key ends with:', key ? key.slice(-6) : 'NOT SET');

const genAI = new GoogleGenerativeAI(key);

// Try gemini-1.5-flash first, fallback to gemini-pro
async function test() {
  for (const modelName of ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro']) {
    try {
      console.log(`\nTrying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello in one word');
      console.log(`✅ SUCCESS: ${result.response.text()}`);
      console.log(`\n>>> Use this model: ${modelName}`);
      break;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
    }
  }
}

test();
