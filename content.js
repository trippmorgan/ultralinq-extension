// ultralinq-extension/content.js

// --- MASTER SCRAPING FUNCTION ---
async function scrapeStudyData() {
  console.log("Button clicked! Detecting active tab...");
  const activeTab = document.querySelector("#studytabs .yui-nav .selected");
  let payload = null;
  try {
    if (activeTab && activeTab.innerText.includes("Report")) {
      console.log("Running REPORT scraper...");
      payload = scrapeReportView();
    } else if (activeTab && (activeTab.innerText.includes("Worksheet") || activeTab.innerText.includes("Clips & Stills"))) {
      console.log("Running WORKSHEET/CLIPS scraper...");
      payload = await scrapeWorksheetOrClipsView();
    } else {
      throw new Error("Could not recognize the active tab.");
    }
    console.log("Scraping successful. Final Payload:", payload);
    await sendDataToBackend(payload);
  } catch (error) {
    console.error("Scraping failed:", error);
    alert(`Failed to scrape data. Error: ${error.message}`);
  }
}

// --- HELPER to convert images to Base64 ---
async function urlToDataUrl(url) {
  try {
    const response = await fetch(new URL(url, window.location.href).href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ mimeType: blob.type || 'image/jpeg', data: reader.result.split(',')[1] });
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Error converting image ${url}:`, error);
    return null;
  }
}

// --- SCRAPER for Worksheet and Clips & Stills tabs ---
async function scrapeWorksheetOrClipsView() {
  function findInfoBarValue(labelText) {
    const labels = Array.from(document.querySelectorAll("#studyinfo td.lab"));
    const foundLabel = labels.find(el => el.innerText.trim().startsWith(labelText));
    return foundLabel?.nextElementSibling?.innerText.trim() || "N/A";
  }
  const patientName = document.querySelector("#studyinfo h1")?.innerText.trim() || "N/A";
  const dob = findInfoBarValue("DOB:");
  const studyDate = findInfoBarValue("Study Date:");

  const measurements = Array.from(document.querySelectorAll("#worksheet2content tr")).map(row => {
    const labelCell = row.querySelector("td.k");
    const valueInput = row.querySelector("td.val input[type='text']");
    if (labelCell && valueInput && valueInput.value.trim()) {
      const label = labelCell.innerText.replace(":", "").trim();
      const value = valueInput.value.trim();
      const units = valueInput.nextElementSibling?.classList.contains('units') ? ` ${valueInput.nextElementSibling.innerText.trim()}` : "";
      return `${label}: ${value}${units}`;
    }
    return null;
  }).filter(item => item).join("\n");

  function findTextareaValueByLegend(legendText) {
    const allLegends = Array.from(document.querySelectorAll('fieldset legend'));
    const targetLegend = allLegends.find(legend => legend.innerText.trim() === legendText);
    return targetLegend?.closest('fieldset').querySelector('textarea.findingta')?.value || null;
  }
  const conclusion = findTextareaValueByLegend("Conclusions") || findTextareaValueByLegend("Summary") || "No conclusion on worksheet.";

  // Actively request image URLs from the iframe using a request/response pattern
  const imageUrls = await new Promise((resolve) => {
    const iframe = document.getElementById('html5-embed');
    if (!iframe || !iframe.contentWindow) {
      console.warn("Clips & Stills iframe not found. Cannot scrape images.");
      return resolve([]);
    }

    const listener = (event) => {
      if (event.source === iframe.contentWindow && event.data?.type === 'ULTRALINQ_IMAGE_URLS_RESPONSE') {
        console.log("Received image URLs from iframe:", event.data.urls);
        window.removeEventListener('message', listener);
        clearTimeout(timeoutId);
        resolve(event.data.urls || []);
      }
    };

    window.addEventListener('message', listener);

    const timeoutId = setTimeout(() => {
      console.warn("Timed out waiting for image URLs from iframe.");
      window.removeEventListener('message', listener);
      resolve([]);
    }, 7000);

    iframe.contentWindow.postMessage({ type: 'ULTRALINQ_GET_IMAGE_URLS' }, '*');
  });

  const imageData = await Promise.all(imageUrls.slice(0, 8).map(url => urlToDataUrl(url)));
  return {
    patientInfo: { name: patientName, dob, studyDate },
    measurements: measurements || "No measurements found.",
    conclusion,
    imageData: imageData.filter(Boolean)
  };
}

// --- SCRAPER for Report View ---
function scrapeReportView() {
    // This function is less critical but kept for completeness
    function findReportValue(labelText) {
        const allCells = Array.from(document.querySelectorAll('#report2table td.k'));
        const labelCell = allCells.find(cell => cell.innerText.trim().startsWith(labelText));
        return labelCell?.nextElementSibling?.innerText.trim() || 'N/A';
    }
    const patientName = findReportValue('Patient Name:');
    const dob = findReportValue('DOB:');
    const studyDate = findReportValue('Date of Service:');
    const conclusion = Array.from(document.querySelectorAll('td.conclusionsv p.rp')).map(p => p.innerText.trim()).join('\n') || findReportValue('Summary Findings:') || "No conclusion found.";
    
    // Simplified measurement scraping for the report view
    const measurements = Array.from(document.querySelectorAll('#report2table table.includeauto tr'))
        .map(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length > 1 && cells[0].classList.contains('k')) {
                return cells.map(cell => cell.innerText.trim()).join('\t');
            }
            return null;
        }).filter(Boolean).join('\n');

    return {
        patientInfo: { name: patientName, dob, studyDate },
        measurements: measurements || "Could not parse measurements from report.",
        conclusion,
        imageData: []
    };
}

// --- UTILITY to send data ---
async function sendDataToBackend(payload) {
  const btn = document.getElementById("gemini-draft-btn");
  if (btn) btn.innerText = "Generating...";
  try {
    console.log("Sending payload to backend:", { ...payload, imageData: `${payload.imageData?.length || 0} images` });
    const response = await fetch("http://localhost:3000/generate-report", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Server error: ${errorData.error || response.statusText}`);
    }
    const data = await response.json();
    await navigator.clipboard.writeText(data.report);
    alert("Success! The draft report has been copied to your clipboard.");
  } catch (error) {
    console.error("Failed to fetch report from backend:", error);
    alert(`Could not generate report. Error: ${error.message}\n\nIs the backend server running?`);
  } finally {
    if (btn) btn.innerText = "Draft Gemini Report";
  }
}

// --- UTILITY to insert button ---
function insertButton() {
  if (document.getElementById("gemini-draft-btn")) return;
  const btn = document.createElement("button");
  btn.id = "gemini-draft-btn";
  btn.innerText = "Draft Gemini Report";
  btn.style.cssText = `position:fixed;top:10px;right:10px;z-index:9999;padding:10px 15px;background:#4285F4;color:white;border:none;border-radius:5px;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,0.2);font-family:sans-serif;font-weight:bold;font-size:14px;`;
  btn.onclick = scrapeStudyData;
  document.body.appendChild(btn);
  console.log("UltraLinq AI Helper button inserted.");
}

// --- Initialize ---
if (window.top === window.self) {
    insertButton();
}