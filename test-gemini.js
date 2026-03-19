require('dotenv').config();
const llmAgent = require('./backend/ai-engine/llmAgent');

async function testLLMAgent() {
  console.log('🧪 Testing Agri Bandhu LLM Agent...\n');

  // Test cases for pure LLM-driven behavior
  const testCases = [
    {
      message: "What's the weather like today?",
      context: { city: 'Delhi', language: 'en' },
      description: 'Weather query - should trigger WEATHER tool'
    },
    {
      message: "मेरी गेहूं की फसल के लिए क्या योजना है?",
      context: { crop: 'wheat', language: 'hi' },
      description: 'Hindi crop planning query - should trigger CROP_PLAN tool'
    },
    {
      message: "Tell me about government schemes for farmers",
      context: { language: 'en' },
      description: 'Scheme query - should trigger SCHEMES tool'
    },
    {
      message: "How do I grow tomatoes better?",
      context: { language: 'en' },
      description: 'General farming advice - should use RAG knowledge'
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n📝 Test: ${testCase.description}`);
      console.log(`💬 Message: "${testCase.message}"`);
      console.log(`📍 Context: ${JSON.stringify(testCase.context)}`);

      const response = await llmAgent.processMessage(testCase.message, testCase.context);
      console.log(`🤖 Response: "${response}"`);
      console.log('✅ SUCCESS');

    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
    }
  }

  console.log('\n🎉 Testing complete!');
}

testLLMAgent().catch(console.error);
