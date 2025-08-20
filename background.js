// background.js (FINAL - Refactored with the definitive ultralinqCues.js)

import { ULTRALINQ_CUES } from './ultralinqCues.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startScraping") {
    startScrapingProcess(sender.tab.id);
    return true;
  }
});

/**
 * Builds the dynamic scraper string by injecting the cues.
 * This function creates a self-contained script to be executed by the debugger.
 * @returns {string} The complete, executable JavaScript string.
 */
function buildScraperExpression() {
  // We pass the entire cues object into the evaluated script.
  // This makes the script self-contained and aware of all selectors.
  return `(function() {
    const CUES = ${JSON.stringify(ULTRALINQ_CUES)}; // Inject cues as a literal object

    // == Helper Functions ==
    function findValueByLabel(scope, selector, labelText) {
      const parent = scope ? document.querySelector(scope) : document;
      if (!parent) return null;
      const labels = Array.from(parent.querySelectorAll(selector));
      const found = labels.find(el => el.innerText.trim().startsWith(labelText));
      return found?.nextElementSibling?.innerText.trim() || null;
    }

    function findTextareaByLegend(legendText) {
        const legends = Array.from(document.querySelectorAll(CUES.dom.worksheet.conclusionLegend));
        const target = legends.find(leg => leg.innerText.trim() === legendText);
        return target?.closest(CUES.dom.worksheet.conclusionFieldset)?.querySelector(CUES.dom.worksheet.findingTextarea)?.value || null;
    }

    // == Scraper Logic ==
    const patientInfo = {
      name: document.querySelector(CUES.dom.patientHeader.patientName)?.innerText.trim() 
            ?? findValueByLabel(CUES.dom.report.container, CUES.dom.report.tableCellWithLabel, CUES.dom.report.patientNameLabel) 
            ?? 'N/A',
      dob: findValueByLabel(CUES.dom.patientHeader.container, CUES.dom.patientHeader.infoBarLabelCell, CUES.dom.patientHeader.dobLabel) 
           ?? findValueByLabel(CUES.dom.report.container, CUES.dom.report.tableCellWithLabel, CUES.dom.report.dobLabel)
           ?? 'N/A',
      studyDate: findValueByLabel(CUES.dom.patientHeader.container, CUES.dom.patientHeader.infoBarLabelCell, CUES.dom.patientHeader.studyDateLabel) 
                 ?? findValueByLabel(CUES.dom.report.container, CUES.dom.report.tableCellWithLabel, CUES.dom.report.studyDateLabel)
                 ?? 'N/A',
    };

    const worksheetMeasurements = Array.from(document.querySelectorAll(CUES.dom.worksheet.measurementRow))
        .map(row => {
            const label = row.querySelector(CUES.dom.worksheet.measurementLabelCell)?.innerText.replace(":", "").trim();
            const input = row.querySelector(CUES.dom.worksheet.measurementValueInput);
            const units = input?.nextElementSibling?.classList.contains(CUES.dom.worksheet.measurementUnitSpan.slice(1)) ? \` \${input.nextElementSibling.innerText.trim()}\` : "";
            if (label && input?.value.trim()) { return \`\${label}: \${input.value.trim()}\${units}\`; }
            return null;
        }).filter(Boolean).join('\\n');

    const reportMeasurements = Array.from(document.querySelectorAll(CUES.dom.report.measurementsTable))
        .map(row => row.innerText.trim()).filter(Boolean).join('\\n');
        
    const measurements = worksheetMeasurements || reportMeasurements || "";

    const conclusion = findTextareaByLegend(CUES.dom.worksheet.conclusionLegendText)
        || findTextareaByLegend(CUES.dom.worksheet.summaryLegendText)
        || Array.from(document.querySelectorAll(CUES.dom.report.conclusionParagraph)).map(p => p.innerText.trim()).join('\\n')
        || "";

    const clips = window[CUES.js.globalClipsObject.replace('window.','')] ?? {};

    return JSON.stringify({ patientInfo, measurements, conclusion, clips });
  })();`;
}


async function startScrapingProcess(tabId) {
  const debuggeeId = { tabId };
  const backendUrl = 'http://localhost:3000/generate-report';

  try {
    await chrome.debugger.attach(debuggeeId, "1.3");
    
    const expression = buildScraperExpression();
    const { result } = await chrome.debugger.sendCommand(debuggeeId, "Runtime.evaluate", { expression, returnByValue: true });

    if (!result || result.exceptionDetails) {
        throw new Error(`Script evaluation failed: ${result.exceptionDetails?.text || 'Unknown reason'}`);
    }
    
    const pageData = JSON.parse(result.value);
    
    console.log("--- SCRAPED DATA FROM PAGE (using Cues) ---");
    console.log(pageData); // Log the entire object for easy inspection
    
    const imageData = Object.values(pageData.clips)
      .filter(clip => clip && clip[ULTRALINQ_CUES.js.clipBase64Property])
      .map(clip => ({
        data: clip[ULTRALINQ_CUES.js.clipBase64Property],
        mimeType: 'image/jpeg'
      }));

    const payload = {
      patientInfo: pageData.patientInfo,
      measurements: pageData.measurements,
      conclusion: pageData.conclusion,
      imageData: imageData,
    };

    const serverResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!serverResponse.ok) {
      const errorData = await serverResponse.json();
      throw new Error(`Server Error: ${serverResponse.status} - ${errorData.error || 'Unknown error'}`);
    }

    const { report } = await serverResponse.json();
    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: (reportText) => { showUIPanel('success', reportText); },
        args: [report]
    });

  } catch (error) {
    console.error("Scraping process failed:", error);
     await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: (errorMessage) => { showUIPanel('error', errorMessage); },
        args: [error.message]
    });
  } finally {
    await chrome.debugger.detach(debuggeeId).catch(e => console.error("Could not detach debugger:", e));
  }
}