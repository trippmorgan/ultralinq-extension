// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Main API endpoint
app.post('/generate-report', async (req, res) => {
  try {
    const { studyType, patientInfo, measurements, conclusion, imageData } = req.body;
    
    let prompt = '';
    const hasMeasurements = measurements && measurements.length > 0;
    const hasImages = imageData && imageData.length > 0;

    let modelName = "gemini-1.5-flash-latest"; // Default to flash for speed and cost
    if (hasImages) {
        modelName = "gemini-1.5-pro-latest"; // Use Pro for multimodal tasks
    }

    // --- PROMPT SELECTION LOGIC ---
    switch (studyType) {
        case 'carotid':
            prompt = `
You are an expert clinical assistant drafting a Carotid Duplex Ultrasound report.
DATA:
- Study Date: ${patientInfo.studyDate}
- Measurements: ${hasMeasurements ? measurements : "Not provided."}
- Physician's Conclusion: ${conclusion || "Not provided."}
- Images: ${hasImages ? "Attached for analysis." : "Not provided."}
TASK:
Generate a report with "FINDINGS" and "IMPRESSION" sections.
- FINDINGS: Create a narrative summary of the data. For each vessel (CCA, ICA, ECA, Vertebral), state velocities and compare to normal ranges if available. If images are provided, describe any visible plaque.
- IMPRESSION: Create a numbered list of the key diagnostic takeaways. Synthesize all provided data.
`;
            break;
        case 'aorta':
            prompt = `
You are an expert clinical assistant drafting an Aortic Ultrasound report.
DATA:
- Study Date: ${patientInfo.studyDate}
- Measurements: ${hasMeasurements ? measurements : "Not provided."}
- Physician's Conclusion: ${conclusion || "Not provided."}
- Images: ${hasImages ? "Attached for analysis." : "Not provided."}
TASK:
Generate a report with "FINDINGS" and "IMPRESSION" sections.
- FINDINGS: Describe the visualized portions of the aorta (e.g., proximal, mid, distal). State the maximum diameter measurements. If images are provided, describe the vessel walls, and note any plaque, thrombus, or evidence of aneurysm.
- IMPRESSION: Create a numbered list stating the key findings, such as the maximum aortic diameter and whether an aneurysm is present.
`;
            break;
        // Add more cases here for 'lower_arterial', 'venous', etc.
        default:
            prompt = `
You are an expert clinical assistant drafting a medical imaging report.
DATA:
- Study Type: ${studyType || 'Unknown'}
- Study Date: ${patientInfo.studyDate}
- Measurements: ${hasMeasurements ? measurements : "Not provided."}
- Physician's Conclusion: ${conclusion || "Not provided."}
- Images: ${hasImages ? "Attached for analysis." : "Not provided."}
TASK:
Generate a generic report with "FINDINGS" and "IMPRESSION" sections, summarizing all provided data in a clear, structured format.
`;
    }

    const imageParts = (imageData || []).map(img => ({
      inlineData: { data: img.data, mimeType: img.mimeType }
    }));
    
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const reportText = response.text();

    if (!reportText) throw new Error("No response text received from Gemini AI");

    res.json({ report: reportText });

  } catch (error) {
    console.error("Error in /generate-report:", error);
    res.status(500).json({ error: `Failed to generate report: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ WARNING: GEMINI_API_KEY is not set in your .env file!");
  }
});