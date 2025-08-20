// test_key.js
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function runTest() {
  console.log("--- Starting API Key Test ---");

  // 1. Load the key from the .env file
  const apiKey = process.env.GOOGLE_API_KEY;

  // 2. VERY IMPORTANT: Check if the key was loaded at all
  if (!apiKey) {
    console.error("\nERROR: API Key not found in .env file! `process.env.GOOGLE_API_KEY` is undefined.");
    console.log("Please ensure your .env file exists and contains: GOOGLE_API_KEY=YourActualKey\n");
    return;
  }

  // 3. Log a sanitized version of the key to verify it's the one you expect
  console.log(`Key loaded successfully. Using key that starts with "${apiKey.slice(0, 8)}" and ends with "${apiKey.slice(-4)}".`);
  console.log(`Key length: ${apiKey.length} characters.`);

  // 4. Try to make the simplest possible API call
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent("hello");
    const response = await result.response;
    console.log("\n✅ SUCCESS! The API key is valid and the connection to Google works.");
    console.log("Response:", response.text());
  } catch (error) {
    console.error("\n❌ FAILED: The API call failed. This confirms the key is invalid or the project has an issue.");
    console.error("Full Error Details:", error);
  } finally {
      console.log("\n--- Test Finished ---");
  }
}

runTest();