// backend/test_key.mjs
import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";

async function inspectTheObject() {
  try {
    console.log("--- Starting Final Inspection ---");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("API Key not found!");
      return;
    }

    const genAI = new GoogleGenAI(apiKey);

    console.log("\n✅ The 'genAI' object was created successfully.");
    console.log("Inspecting the methods available on this object...");
    console.log("-----------------------------------------");

    // Get all properties from the object and its underlying class structure
    const properties = new Set();
    let currentObj = genAI;
    do {
      Object.getOwnPropertyNames(currentObj).forEach(item => properties.add(item));
    } while ((currentObj = Object.getPrototypeOf(currentObj)));

    // Filter for functions and print them
    const methods = [...properties].filter(item => typeof genAI[item] === 'function');
    console.log(methods);

    console.log("-----------------------------------------");
    console.log("If 'getGenerativeModel' is not in the list above, the SDK is not standard.");

  } catch (error) {
    console.error("\n--- Inspection Failed ---");
    console.error(error);
  }
}

inspectTheObject();