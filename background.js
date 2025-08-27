// background.js

// Listen for the message from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startFullReportProcess") {
        (async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) {
                sendResponse({ success: false, error: "Could not find an active tab." });
                return;
            }
            // Now, pass the correct tab ID to our main process.
            const response = await startFullReportProcess(activeTab.id);
            sendResponse(response);
        })();
        return true; // Keep message channel open for async response
    }
});

// Main function that orchestrates the entire process
// in background.js

async function startFullReportProcess(tabId) {
    const debuggeeId = { tabId };
    try {
        await chrome.debugger.attach(debuggeeId, "1.3");

        // Step 1 & 2: Get TEXT and IMAGE data simultaneously
        const [injectionResult, clipsResponse] = await Promise.all([
            // Inject a script to get the text data
            chrome.scripting.executeScript({
                target: { tabId },
                func: scrapePageContent,
            }),
            // Send a command to the debugger to get the image data
            chrome.debugger.sendCommand(debuggeeId, "Runtime.evaluate", {
                // *** THE FIX IS HERE: A smarter expression that waits ***
                expression: `
                    new Promise((resolve) => {
                        const pollForClips = setInterval(() => {
                            const clips = document.getElementById('html5-embed')?.contentWindow?.clips || window.clips;
                            if (clips && Object.keys(clips).length > 0) {
                                clearInterval(pollForClips);
                                resolve(JSON.stringify(clips));
                            }
                        }, 250); // Check every 250ms

                        // Add a timeout to prevent it from running forever
                        setTimeout(() => {
                            clearInterval(pollForClips);
                            // Resolve with an empty object if not found after 5 seconds
                            resolve(JSON.stringify({})); 
                        }, 5000);
                    })
                `,
                awaitPromise: true, // Tells the debugger to wait for the Promise to resolve
                returnByValue: true
            })
        ]);

        // Process the results
        const { studyType, patientInfo, measurements, conclusion } = injectionResult[0].result;
        const clipsData = JSON.parse(clipsResponse.result.value);
        const imageUrls = Object.values(clipsData).map(clip => clip.furl).filter(Boolean);

        // Step 3: Convert Image URLs to Base64
        let imageData = [];
        if (imageUrls.length > 0) {
            const [conversionResult] = await chrome.scripting.executeScript({
                target: { tabId },
                func: urlsToDataUrls,
                args: [imageUrls.slice(0, 8)],
            });
            imageData = conversionResult.result;
        }

        // Step 4 & 5: Assemble payload and send to backend
        const payload = { studyType, patientInfo, measurements, conclusion, imageData };
        const report = await sendToBackend(payload);
        
        // Step 6: Copy report to clipboard
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (text) => navigator.clipboard.writeText(text),
            args: [report]
        });

        await alertOnPage(tabId, "Success! The draft report has been copied to your clipboard.");
        return { success: true };

    } catch (error) {
        console.error("Full Process Error:", error);
        await alertOnPage(tabId, `Error: ${error.message}. Is DevTools (F12) open?`);
        return { success: false, error: error.message };
    } finally {
        await chrome.debugger.detach(debuggeeId).catch(e => console.error("Error detaching debugger:", e));
    }
}

// --- Injected Functions ---
// These are self-contained functions that will be injected into the page to run.

function scrapePageContent() {
    // This function runs on the UltraLinq page to get all available text data.
    const activeTab = document.querySelector("#studytabs .yui-nav .selected");
    
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

    if (activeTab && activeTab.innerText.includes("Worksheet")) {
        measurements = Array.from(document.querySelectorAll("#worksheet2content tr")).map(row => {
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
        
        function findTextareaValueByLegend(legendText) {
            const allLegends = Array.from(document.querySelectorAll('fieldset legend'));
            const targetLegend = allLegends.find(legend => legend.innerText.trim() === legendText);
            return targetLegend?.closest('fieldset').querySelector('textarea.findingta')?.value || null;
        }
        conclusion = findTextareaValueByLegend("Conclusions") || findTextareaValueByLegend("Summary") || "No conclusion on worksheet.";
    }
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
        } catch (e) { return null; }
    }
    return Promise.all(urls.map(toDataUrl)).then(results => results.filter(Boolean));
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
    await chrome.scripting.executeScript({
        target: { tabId },
        func: (msg) => alert(msg),
        args: [text]
    });
}