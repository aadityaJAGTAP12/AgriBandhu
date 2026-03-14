/**
 * Mock disease detection service.
 * In a real scenario, this would load a TFLite model and run inference on an image buffer.
 */
const detectDisease = async (imageBuffer) => {
  // Mock response for testing
  return {
    crop: "Wheat",
    detectedDisease: "Rust",
    confidence: 0.92,
    treatment: "Apply appropriate fungicide and ensure good field drainage."
  };
};

module.exports = {
  detectDisease
};
