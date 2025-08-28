/**
 * @file background.js
 * @description Service worker for the UltraLinq AI Report Helper extension.
 * This is the definitive version with robust, structure-based scraping for text
 * and an increased image processing limit.
 */

// Listen for the message from the popup to start the process
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startFullReportProcess") {
        (async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) {
                sendResponse({ success: false, error: "Could not find an active tab." });
                return;
            }
            const response = await startFullReportProcess(activeTab.id);
            sendResponse(response);
        })();
        return true; // Keep message channel open for async response
    }
});

/**
 * Main function that orchestrates the entire scraping and data collection process.
 * @param {number} tabId The ID of the tab to process.
 */
async function startFullReportProcess(tabId) {
    const debuggeeId = { tabId };
    try {
        console.log("Attaching debugger...");
        await chrome.debugger.attach(debuggeeId, "1.3");
        console.log("Debugger attached.");

        console.log("Scraping text and polling for image data...");
        const [injectionResult, clipsResponse] = await Promise.all([
            chrome.scripting.executeScript({
                target: { tabId },
                func: scrapePageContent, // Using the final, bulletproof version
            }),
            chrome.debugger.sendCommand(debuggeeId, "Runtime.evaluate", {
                expression: `
                    new Promise((resolve) => {
                        let foundClips = null;
                        const findClips = () => {
                            if (window.clips && Object.keys(window.clips).length > 0) return window.clips;
                            for (let i = 0; i < window.frames.length; i++) {
                                try {
                                    if (window.frames[i].clips && Object.keys(window.frames[i].clips).length > 0) return window.frames[i].clips;
                                } catch (e) {}
                            }
                            return null;
                        };
                        const pollForClips = setInterval(() => {
                            foundClips = findClips();
                            if (foundClips) {
                                clearInterval(pollForClips);
                                resolve(JSON.stringify(foundClips));
                            }
                        }, 300);
                        setTimeout(() => {
                            clearInterval(pollForClips);
                            resolve(JSON.stringify(foundClips || {}));
                        }, 7000);
                    })
                `,
                awaitPromise: true,
                returnByValue: true
            })
        ]);
        console.log("Text and image data polling complete.");

        const { studyType, patientInfo, measurements, conclusion } = injectionResult[0].result;
        const clipsData = JSON.parse(clipsResponse.result.value);
        const imageUrls = Object.values(clipsData).map(clip => clip.furl).filter(Boolean);
        
        console.log(`Found ${imageUrls.length} images. Fetching image data via script injection...`);
        
        // *** FIX #1: Increased the image limit to 60 to capture all images ***
        const [conversionResult] = await chrome.scripting.executeScript({
            target: { tabId },
            func: urlsToDataUrls,
            args: [imageUrls.slice(0, 60)], // Process up to 60 images
        });
        const imageData = conversionResult.result;
        console.log(`Successfully converted ${imageData.length} images.`);
        
        const payload = { studyType, patientInfo, measurements, conclusion, imageData };
        
        console.log("Storing scraped data and opening preview tab.");
        await chrome.storage.session.set({ scrapedData: payload });
        await chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") });

        return { success: true };

    } catch (error) {
        console.error("Full Process Error:", error);
        await alertOnPage(tabId, `Error: ${error.message}. Is DevTools (F12) open? Please close it and try again.`);
        return { success: false, error: error.message };
    } finally {
        console.log("Detaching debugger.");
        await chrome.debugger.detach(debuggeeId).catch(e => console.error("Error detaching debugger:", e));
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "sendToAI") {
        (async () => {
            const { scrapedData } = await chrome.storage.session.get("scrapedData");
            if (!scrapedData) {
                sendResponse({ success: false, error: "No scraped data found in session." });
                return;
            }
            try {
                const report = await sendToBackend(scrapedData);
                sendResponse({ success: true, data: report });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
});

// --- Helper and Injected Functions ---

/**
 * *** FINAL VERSION ***
 * This function is injected to scrape all text. It now uses highly robust,
 * structure-based selectors to find data anywhere on the page.
 */
function scrapePageContent() {
    function getStudyType() {
        const titleElement = document.querySelector('#report2 .h0, #studyTypeLink');
        if (!titleElement) return 'unknown';
        const title = titleElement.innerText.toLowerCase();
        if (title.includes('carotid')) return 'carotid';
        if (title.includes('aorta')) return 'aorta';
        if (title.includes('arterial lower')) return 'lower_ arterial';
        if (title.includes('venous')) return 'venous';
        return 'unknown';
    }

    const studyType = getStudyType();
    let patientInfo = {}, measurements = "", conclusion = "";

    function findInfoBarValue(labelText) {
        const labels = Array.from(document.querySelectorAll("#studyinfo td.lab"));
        const foundLabel = labels.find(el => el.innerText.trim().startsWith(labelText));
        return foundLabel?.nextElementSibling?.innerText.trim() || "N/A";
    }
    patientInfo = {
        name: document.querySelector("#studyinfo h1")?.innerText.trim() || "N/A",
        dob: findInfoBarValue("DOB:"),
        studyDate: findInfoBarValue("Study Date:")
    };
    
    // *** FIX #2: This is the new, more resilient measurement scraper ***
    // It finds all table rows on the page that match the specific structure of a measurement.
    const allRows = Array.from(document.querySelectorAll("tr"));
    const measurementRows = allRows.filter(row => row.querySelector("td.k") && row.querySelector("td.val input[type='text']"));
    
    measurements = measurementRows.map(row => {
        const labelCell = row.querySelector("td.k");
        const valueInput = row.querySelector("td.val input[type='text']");
        if (labelCell && valueInput && valueInput.value) {
            const label = labelCell.innerText.replace(":", "").trim();
            const value = valueInput.value.trim();
            const units = valueInput.nextElementSibling?.classList.contains('units') ? ` ${valueInput.nextElementSibling.innerText.trim()}` : "";
            return `${label}: ${value}${units}`;
        }
        return null;
    }).filter(Boolean).join("\n");
    
    // *** And the new, more resilient conclusion scraper ***
    // It finds all textareas with the 'findingta' class and joins their content.
    const conclusionTextareas = document.querySelectorAll('textarea.findingta');
    conclusion = Array.from(conclusionTextareas)
        .map(textarea => textarea.value.trim())
        .filter(Boolean)
        .join("\n\n---\n\n"); // Join multiple textareas with a separator
    
    return { studyType, patientInfo, measurements, conclusion };
}

async function urlsToDataUrls(urls) {
    async function toDataUrl(url) {
        try {
            const response = await fetch(new URL(url, window.location.href).href);
            if (!response.ok) return null;
            const blob = await response.blob();
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve({ mimeType: blob.type, data: reader.result.split(',')[1] });
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (e) { 
            console.error(`Failed to fetch image at ${url}:`, e);
            return null; 
        }
    }
    const results = await Promise.all(urls.map(toDataUrl));
    return results.filter(Boolean);
}

async function sendToBackend(payload) {
    try {
        const response = await fetch("http://localhost:3000/generate-report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server responded with status ${response.status}`);
        }
        const data = await response.json();
        return data.report;
    } catch (error) {
        console.error("Error sending data to backend:", error);
        throw new Error(`Could not reach backend server. Is it running? Error: ${error.message}`);
    }
}

async function alertOnPage(tabId, text) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (msg) => alert(msg),
            args: [text]
        });
    } catch (e) {
        console.error("Failed to show alert on page:", e);
    }
}