/**
 * @file background.js
 * @description Service worker for the UltraLinq AI Report Helper extension.
 * Now includes single study analysis AND multi-study longitudinal analysis.
 */

// Listen for messages from content script and popup
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
    
    // NEW: Handle longitudinal analysis
    if (message.action === "startLongitudinalAnalysis") {
        (async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) {
                sendResponse({ success: false, error: "Could not find an active tab." });
                return;
            }
            const response = await startLongitudinalAnalysis(activeTab.id);
            sendResponse(response);
        })();
        return true;
    }
});

/**
 * Main function for single study analysis
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
                func: scrapePageContent,
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
        
        const [conversionResult] = await chrome.scripting.executeScript({
            target: { tabId },
            func: urlsToDataUrls,
            args: [imageUrls.slice(0, 60)],
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

/**
 * NEW: Longitudinal Analysis - Scrape multiple studies
 */
async function startLongitudinalAnalysis(tabId) {
    try {
        console.log("Starting longitudinal analysis...");
        
        // Step 1: Get all study links from current page
        const [linksResult] = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractStudyLinks,
        });
        
        const studyLinks = linksResult.result;
        
        if (!studyLinks || studyLinks.length === 0) {
            await alertOnPage(tabId, "No study links found on this page.\n\nPlease navigate to a patient's study list first.");
            return { success: false, error: "No study links found" };
        }

        console.log(`Found ${studyLinks.length} study links`);
        
        // Step 2: Show confirmation dialog
        const confirmResult = await chrome.scripting.executeScript({
            target: { tabId },
            func: (count) => {
                return confirm(
                    `Found ${count} studies.\n\n` +
                    `This will:\n` +
                    `• Visit each study page\n` +
                    `• Scrape all measurements and conclusions\n` +
                    `• Get images from the most recent study\n` +
                    `• Send to Gemini for longitudinal analysis\n\n` +
                    `This may take several minutes.\n\n` +
                    `Continue?`
                );
            },
            args: [studyLinks.length]
        });
        
        if (!confirmResult[0].result) {
            return { success: false, error: "User cancelled" };
        }

        // Step 3: Ask for study type
        const studyTypeResult = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const choice = prompt(
                    "Select study type for analysis:\n\n" +
                    "1. Carotid\n" +
                    "2. Aorta\n" +
                    "3. Left Leg Arterial\n" +
                    "4. Right Leg Arterial\n\n" +
                    "Enter number (1-4):"
                );
                
                const typeMap = {
                    '1': 'carotid',
                    '2': 'aorta',
                    '3': 'left_leg',
                    '4': 'right_leg'
                };
                
                return typeMap[choice] || 'carotid';
            }
        });
        
        const studyType = studyTypeResult[0].result;

        // Step 4: Scrape each study
        await alertOnPage(tabId, `Starting to scrape ${studyLinks.length} studies.\n\nPlease don't close this tab.\n\nYou'll see the page navigate to each study automatically.`);
        
        const allStudiesData = [];
        
        for (let i = 0; i < studyLinks.length; i++) {
            const studyUrl = studyLinks[i].url;
            console.log(`\nScraping study ${i + 1}/${studyLinks.length}: ${studyUrl}`);
            
            try {
                // Navigate to study
                await chrome.tabs.update(tabId, { url: studyUrl });
                
                // Wait for page to load
                await new Promise(resolve => setTimeout(resolve, 4000));
                
                // Scrape the study (only get images from first study to save time)
                const studyData = await scrapeStudyPage(tabId, i === 0);
                
                if (studyData) {
                    allStudiesData.push({
                        ...studyData,
                        studyDate: studyLinks[i].date || studyData.patientInfo.studyDate,
                        studyUrl: studyUrl
                    });
                    console.log(`✓ Study ${i + 1} scraped successfully`);
                }
                
            } catch (error) {
                console.error(`✗ Error scraping study ${i + 1}:`, error);
            }
        }

        console.log(`\nSuccessfully scraped ${allStudiesData.length}/${studyLinks.length} studies`);

        if (allStudiesData.length === 0) {
            await alertOnPage(tabId, "Failed to scrape any studies. Please try again.");
            return { success: false, error: "No studies scraped" };
        }

        // Step 5: Send to backend for analysis
        await alertOnPage(tabId, `Scraped ${allStudiesData.length} studies!\n\nSending to Gemini for longitudinal analysis...\n\nThis may take a minute.`);
        
        const payload = {
            studyType: studyType,
            patientName: allStudiesData[0]?.patientInfo?.name || "Patient",
            studies: allStudiesData
        };

        const report = await sendToBackendLongitudinal(payload);
        
        // Step 6: Show report in new tab
        await chrome.storage.session.set({ 
            longitudinalReport: report, 
            studiesAnalyzed: allStudiesData.length,
            patientName: payload.patientName,
            studyType: studyType
        });
        
        await chrome.tabs.create({ url: chrome.runtime.getURL("longitudinal-report.html") });

        await alertOnPage(tabId, `✅ Analysis complete!\n\n${allStudiesData.length} studies analyzed.\n\nReport opened in new tab.`);
        
        return { success: true, studiesAnalyzed: allStudiesData.length };

    } catch (error) {
        console.error("Longitudinal analysis error:", error);
        await alertOnPage(tabId, `Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Extract all study links from current page
 */
function extractStudyLinks() {
    const links = [];
    
    // Find all links that look like study links
    const allLinks = Array.from(document.querySelectorAll('a[href*="study"], a[href*="report"]'));
    
    allLinks.forEach(link => {
        if (link.href && (link.href.includes('/study/') || link.href.includes('studyid='))) {
            // Try to find associated date and type from parent row
            const row = link.closest('tr') || link.closest('.row') || link.parentElement;
            
            let date = "Unknown";
            let type = "Unknown";
            
            if (row) {
                const cells = Array.from(row.querySelectorAll('td, span, div'));
                cells.forEach(cell => {
                    const text = cell.innerText || cell.textContent;
                    // Look for date pattern (MM/DD/YYYY or MM-DD-YYYY)
                    if (text && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text)) {
                        date = text.trim();
                    }
                    // Look for study type keywords
                    if (text && (text.includes('Carotid') || text.includes('Aorta') || 
                               text.includes('Arterial') || text.includes('Venous'))) {
                        type = text.trim();
                    }
                });
            }
            
            links.push({
                url: link.href,
                date: date,
                type: type
            });
        }
    });
    
    // Remove duplicates based on URL
    const uniqueLinks = Array.from(new Map(links.map(item => [item.url, item])).values());
    
    return uniqueLinks;
}

/**
 * Scrape a single study page (reusing existing logic)
 */
async function scrapeStudyPage(tabId, includeImages = false) {
    const debuggeeId = { tabId };
    
    try {
        await chrome.debugger.attach(debuggeeId, "1.3");

        const [injectionResult] = await chrome.scripting.executeScript({
            target: { tabId },
            func: scrapePageContent,
        });

        const studyData = injectionResult.result;
        
        // Only get images from the first/most recent study to save time
        let imageData = [];
        if (includeImages) {
            console.log("Fetching images from most recent study...");
            const clipsResponse = await chrome.debugger.sendCommand(debuggeeId, "Runtime.evaluate", {
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
                        }, 5000);
                    })
                `,
                awaitPromise: true,
                returnByValue: true
            });

            const clipsData = JSON.parse(clipsResponse.result.value);
            const imageUrls = Object.values(clipsData).map(clip => clip.furl).filter(Boolean);
            
            if (imageUrls.length > 0) {
                const [conversionResult] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: urlsToDataUrls,
                    args: [imageUrls.slice(0, 15)], // Limit to 15 images for longitudinal
                });
                imageData = conversionResult.result;
                console.log(`Fetched ${imageData.length} images`);
            }
        }

        await chrome.debugger.detach(debuggeeId).catch(e => console.error("Error detaching debugger:", e));
        
        return { ...studyData, imageData };

    } catch (error) {
        console.error("Error scraping study:", error);
        await chrome.debugger.detach(debuggeeId).catch(() => {});
        return null;
    }
}

/**
 * Send longitudinal data to backend
 */
async function sendToBackendLongitudinal(payload) {
    try {
        const response = await fetch("http://localhost:3000/analyze-patient-history-extension", {
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

// Listen for preview page requests to send data to AI
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
 * Scrape all text from study page
 */
function scrapePageContent() {
    function getStudyType() {
        const titleElement = document.querySelector('#report2 .h0, #studyTypeLink');
        if (!titleElement) return 'unknown';
        const title = titleElement.innerText.toLowerCase();
        if (title.includes('carotid')) return 'carotid';
        if (title.includes('aorta')) return 'aorta';
        if (title.includes('arterial lower')) return 'lower_arterial';
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
    
    // Scrape measurements
    const allRows = Array.from(document.querySelectorAll("tr"));
    const measurementRows = allRows.filter(row => 
        row.querySelector("td.k") && row.querySelector("td.val input[type='text']")
    );
    
    measurements = measurementRows.map(row => {
        const labelCell = row.querySelector("td.k");
        const valueInput = row.querySelector("td.val input[type='text']");
        if (labelCell && valueInput && valueInput.value) {
            const label = labelCell.innerText.replace(":", "").trim();
            const value = valueInput.value.trim();
            const units = valueInput.nextElementSibling?.classList.contains('units') 
                ? ` ${valueInput.nextElementSibling.innerText.trim()}` 
                : "";
            return `${label}: ${value}${units}`;
        }
        return null;
    }).filter(Boolean).join("\n");
    
    // Scrape conclusion
    const conclusionTextareas = document.querySelectorAll('textarea.findingta');
    conclusion = Array.from(conclusionTextareas)
        .map(textarea => textarea.value.trim())
        .filter(Boolean)
        .join("\n\n---\n\n");
    
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