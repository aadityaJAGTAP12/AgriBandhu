/**
 * Test script for the new Agri Bandhu LLM Agent
 */
require('dotenv').config();

async function testAgent() {
  try {
    const llmAgent = require('./backend/ai-engine/llmAgent');

    console.log('Testing Agri Bandhu LLM Agent...\n');

    // Test cases
    const testCases = [
      { message: "Pune mai barish hogi?", context: { city: "Pune", language: "hi" } },
      { message: "Rice ka crop plan batao", context: { crop: "rice", language: "hi" } },
      { message: "Koi sarkari yojana hai?", context: { language: "hi" } },
      { message: "What's the weather in Delhi?", context: { city: "Delhi", language: "en" } }
    ];

    for (const testCase of testCases) {
      console.log(`\n--- Test: "${testCase.message}" ---`);
      console.log(`Context: ${JSON.stringify(testCase.context)}`);

      try {
        const response = await llmAgent.processMessage(testCase.message, testCase.context);
        console.log(`Response: ${response}`);
      } catch (error) {
        console.log(`Error: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAgent();