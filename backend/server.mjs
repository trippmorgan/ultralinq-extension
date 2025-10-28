// backend/server.mjs
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Initialize Google AI (new SDK syntax) ---
if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not set in your .env file!");
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Main Endpoint ---
app.post('/generate-report', async (req, res) => {
  try {
    const { studyType, patientInfo = {}, measurements = [], conclusion = '', imageData = [] } = req.body;

    const hasMeasurements = Array.isArray(measurements) && measurements.length > 0;
    const hasImages = Array.isArray(imageData) && imageData.length > 0;

    // --- Choose appropriate model ---
    const modelName = hasImages ? "gemini-2.5-pro" : "gemini-2.5-flash";
    console.log(`🧠 Generating report using model: ${modelName}...`);

    // --- Build Prompt ---
    let prompt;
    switch (studyType?.toLowerCase()) {
      case 'carotid':
        prompt = `
You are an expert clinical assistant drafting a Carotid Duplex Ultrasound report.
DATA:
- Study Date: ${patientInfo.studyDate || "Not provided."}
- Measurements: ${hasMeasurements ? JSON.stringify(measurements) : "Not provided."}
- Physician's Conclusion: ${conclusion || "Not provided."}
- Images: ${hasImages ? "Attached for analysis." : "Not provided."}

TASK:
Generate a report with "FINDINGS" and "IMPRESSION" sections.
- FINDINGS: Create a narrative summary. For each vessel (CCA, ICA, ECA, Vertebral), discuss velocities vs normal.
- IMPRESSION: Numbered summary of diagnostic takeaways (e.g., stenosis %, plaque presence).
`;
        break;

      case 'aorta':
        prompt = `
You are an expert clinical assistant drafting an Aortic Ultrasound report.
DATA:
- Study Date: ${patientInfo.studyDate || "Not provided."}
- Measurements: ${hasMeasurements ? JSON.stringify(measurements) : "Not provided."}
- Physician's Conclusion: ${conclusion || "Not provided."}
- Images: ${hasImages ? "Attached for analysis." : "Not provided."}

TASK:
Generate a report with "FINDINGS" and "IMPRESSION" sections.
- FINDINGS: Describe visualized aortic segments, max diameter, and note any plaque, thrombus, or aneurysm.
- IMPRESSION: Numbered list summarizing key findings, including any aneurysm and its size.
`;
        break;

      default:
        prompt = `
You are an expert clinical assistant drafting a generic medical imaging report.
DATA:
- Study Type: ${studyType || "Unknown"}
- Study Date: ${patientInfo.studyDate || "Not provided."}
- Measurements: ${hasMeasurements ? JSON.stringify(measurements) : "Not provided."}
- Physician's Conclusion: ${conclusion || "Not provided."}
- Images: ${hasImages ? "Attached for analysis." : "Not provided."}

TASK:
Generate a report with "FINDINGS" and "IMPRESSION" sections, summarizing all provided data.
`;
    }

    // --- Build request contents for the new SDK ---
    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ];

    if (hasImages) {
      for (const img of imageData) {
        contents[0].parts.push({
          inlineData: {
            data: img.data,       // base64 encoded string
            mimeType: img.mimeType || "image/jpeg"
          }
        });
      }
    }

    // --- NEW SDK CALL (v2.x syntax) ---
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });

    // ✅ Extract text correctly from new response format
    const reportText = response.response?.text() || response.text || "No report text found.";


    if (!reportText) throw new Error("No text returned from Gemini model.");

    res.json({ report: reportText.trim() });

  } catch (error) {
    console.error("❌ Error in /generate-report:", error);
    res.status(500).json({ error: `Failed to generate report: ${error.message}` });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

