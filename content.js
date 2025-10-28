// ultralinq-extension/content.js

function insertButtons() {
  // Check if buttons already exist to avoid duplicates
  if (document.getElementById("gemini-button-container")) return;
  
  // Create container for buttons
  const buttonContainer = document.createElement("div");
  buttonContainer.id = "gemini-button-container";
  buttonContainer.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 5px;
  `;

  // Original single study button
  const singleBtn = document.createElement("button");
  singleBtn.id = "gemini-draft-btn";
  singleBtn.innerText = "Draft Gemini Report";
  singleBtn.style.cssText = `
    padding: 10px 15px;
    background: #4285F4;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-family: sans-serif;
    font-weight: bold;
    font-size: 14px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    transition: background-color 0.2s;
    width: 200px;
  `;

  singleBtn.onclick = () => {
    singleBtn.innerText = "Processing...";
    singleBtn.disabled = true;
    singleBtn.style.backgroundColor = "#808080";

    chrome.runtime.sendMessage({ action: "startFullReportProcess" }, (response) => {
      singleBtn.innerText = "Draft Gemini Report";
      singleBtn.disabled = false;
      singleBtn.style.backgroundColor = "#4285F4";

      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        alert("Error: Could not communicate with extension. Please reload.");
      } else if (response && !response.success) {
        alert(`Error: ${response.error}`);
      }
    });
  };

  // NEW: Longitudinal analysis button
  const longitudinalBtn = document.createElement("button");
  longitudinalBtn.id = "gemini-longitudinal-btn";
  longitudinalBtn.innerText = "📊 Multi-Study Analysis";
  longitudinalBtn.style.cssText = `
    padding: 10px 15px;
    background: #0F9D58;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-family: sans-serif;
    font-weight: bold;
    font-size: 14px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    transition: background-color 0.2s;
    width: 200px;
  `;

  longitudinalBtn.onclick = () => {
    // Check if we're on a page with multiple study links
    const studyLinks = document.querySelectorAll('a[href*="study"]');
    
    if (studyLinks.length <= 1) {
      alert("📋 Multi-Study Analysis:\n\n" +
            "Please navigate to a patient's study list page first.\n\n" +
            "This page should show multiple studies (e.g., patient search results).");
      return;
    }

    longitudinalBtn.innerText = "Starting...";
    longitudinalBtn.disabled = true;
    longitudinalBtn.style.backgroundColor = "#808080";

    chrome.runtime.sendMessage({ action: "startLongitudinalAnalysis" }, (response) => {
      longitudinalBtn.innerText = "📊 Multi-Study Analysis";
      longitudinalBtn.disabled = false;
      longitudinalBtn.style.backgroundColor = "#0F9D58";

      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        alert("Error: Could not communicate with extension. Please reload.");
      } else if (response && !response.success) {
        alert(`Error: ${response.error}`);
      }
    });
  };

  // Add buttons to container
  buttonContainer.appendChild(singleBtn);
  buttonContainer.appendChild(longitudinalBtn);
  
  // Add container to page
  document.body.appendChild(buttonContainer);
  
  console.log("UltraLinq AI Helper buttons inserted.");
}

// Use an observer to make sure we insert the buttons when the page is ready
const observer = new MutationObserver((mutations, obs) => {
  if (document.body) {
    insertButtons();
    obs.disconnect(); // Stop observing once the buttons are inserted
  }
});

// Start observing the page for changes
observer.observe(document.documentElement, { childList: true, subtree: true });