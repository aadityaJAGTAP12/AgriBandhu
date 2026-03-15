/**
 * Disease detection service for Agri Bandhu
 * Simulates disease detection from images (placeholder for TFLite model)
 */

/**
 * Detect plant disease from image URL
 * @param {string} imageUrl - URL of the plant image
 * @returns {object} - Disease detection result
 */
const detectDisease = async (imageUrl) => {
  // For hackathon/demo purposes, simulate disease detection
  // In production, this would:
  // 1. Download image from WhatsApp media URL
  // 2. Preprocess image
  // 3. Run inference with TensorFlow Lite model
  // 4. Return actual prediction

  console.log(`[Disease Detection] Processing image: ${imageUrl}`);

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Mock diseases based on common Indian crop issues
  const mockDiseases = [
    {
      disease: "Leaf Blast",
      confidence: 0.87,
      treatment: "Apply tricyclazole fungicide immediately. Remove infected leaves. Ensure proper field drainage to reduce humidity."
    },
    {
      disease: "Bacterial Blight",
      confidence: 0.92,
      treatment: "Apply copper-based bactericide. Avoid overhead irrigation. Use disease-resistant varieties for next season."
    },
    {
      disease: "Rust Disease",
      confidence: 0.78,
      treatment: "Apply sulfur-based fungicide. Improve air circulation by proper spacing. Remove and destroy infected plant parts."
    },
    {
      disease: "Powdery Mildew",
      confidence: 0.85,
      treatment: "Apply potassium bicarbonate or neem oil. Ensure adequate sunlight. Avoid excessive nitrogen fertilization."
    },
    {
      disease: "Downy Mildew",
      confidence: 0.81,
      treatment: "Apply metalaxyl fungicide. Improve drainage. Space plants properly to reduce humidity around plants."
    },
    {
      disease: "Healthy Plant",
      confidence: 0.95,
      treatment: "No treatment needed. Plant appears healthy. Continue regular care and monitoring."
    }
  ];

  // Randomly select a disease for demo (in real implementation, this would be model prediction)
  const randomDisease = mockDiseases[Math.floor(Math.random() * mockDiseases.length)];

  return {
    disease: randomDisease.disease,
    confidence: randomDisease.confidence,
    treatment: randomDisease.treatment,
    crop: "Detected crop", // Would be predicted by model
    notes: "This is a simulated result. In production, this would use a trained AI model."
  };
};

module.exports = {
  detectDisease
};
