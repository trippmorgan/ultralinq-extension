/**
 * @file preview.js
 * @description Handles the rendering of scraped data and interaction on the preview page.
 */

// Main function to render the scraped data when the page loads.
document.addEventListener('DOMContentLoaded', async () => {
    // Get the data object that background.js saved to session storage.
    const { scrapedData } = await chrome.storage.session.get('scrapedData');

    if (scrapedData) {
        const textDiv = document.getElementById('scrapedText');
        const imagesContainer = document.getElementById('imagesContainer');
        
        // Clear default "Loading..." text
        textDiv.textContent = ''; 
        imagesContainer.innerHTML = '';

        // --- 1. Format and Display the Scraped Text Data ---
        // We will build a nicely formatted string from the structured data.
        let formattedText = '';

        if (scrapedData.patientInfo) {
            formattedText += `--- Patient Information ---\n`;
            formattedText += `Name: ${scrapedData.patientInfo.name || 'N/A'}\n`;
            formattedText += `DOB: ${scrapedData.patientInfo.dob || 'N/A'}\n`;
            formattedText += `Study Date: ${scrapedData.patientInfo.studyDate || 'N/A'}\n\n`;
        }

        if (scrapedData.studyType) {
            formattedText += `--- Study Information ---\n`;
            formattedText += `Study Type: ${scrapedData.studyType}\n\n`;
        }

        if (scrapedData.measurements) {
            formattedText += `--- Worksheet Measurements ---\n`;
            formattedText += `${scrapedData.measurements}\n\n`;
        }

        if (scrapedData.conclusion) {
            formattedText += `--- Conclusion/Summary ---\n`;
            formattedText += `${scrapedData.conclusion}\n`;
        }
        
        // Set the formatted text to the page.
        textDiv.textContent = formattedText.trim();


        // --- 2. Display the Scraped Images ---
        // The imageData is an array of objects: { mimeType, data }
        if (scrapedData.imageData && scrapedData.imageData.length > 0) {
            scrapedData.imageData.forEach(imageObject => {
                const img = document.createElement('img');
                // Construct the full data URL for the image src attribute.
                img.src = `data:${imageObject.mimeType};base64,${imageObject.data}`;
                imagesContainer.appendChild(img);
            });
        } else {
            imagesContainer.textContent = 'No images were scraped.';
        }

    } else {
        document.getElementById('scrapedText').textContent = 'Could not load scraped data. Please try again.';
    }
});


// --- Event Listener for the "Send to Gemini" Button ---
document.getElementById('sendToGeminiBtn').addEventListener('click', async () => {
    const button = document.getElementById('sendToGeminiBtn');
    const geminiResponseDiv = document.getElementById('geminiResponse');
    const geminiTextPre = document.getElementById('geminiText');
    
    // Provide user feedback
    button.disabled = true;
    button.textContent = 'Processing...';
    geminiResponseDiv.style.display = 'none'; // Hide old responses

    // Send a message to the background script to initiate the backend call.
    // The background script already has the data in storage.
    try {
        const response = await chrome.runtime.sendMessage({ type: 'sendToAI' });

        if (response.success && response.data) {
            geminiTextPre.textContent = response.data;
            geminiResponseDiv.style.display = 'block';
            button.textContent = 'Report Generated';
        } else {
            throw new Error(response.error || 'Unknown error from background script.');
        }
    } catch (error) {
        console.error("Error getting Gemini response:", error);
        geminiTextPre.textContent = `An error occurred: ${error.message}`;
        geminiResponseDiv.style.display = 'block';
        button.textContent = 'Error!';
        button.disabled = false; // Re-enable button on failure
    }
});