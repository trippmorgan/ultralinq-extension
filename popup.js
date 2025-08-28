// popup.js
document.getElementById('scrapeButton').addEventListener('click', () => {
  const statusDiv = document.getElementById('status');
  const scrapeButton = document.getElementById('scrapeButton');

  statusDiv.textContent = 'Processing...';
  scrapeButton.disabled = true;
  
  // Send a message to the background script to start the entire process
  chrome.runtime.sendMessage({ action: "startFullReportProcess" }, (response) => {
    if (chrome.runtime.lastError) {
      statusDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
      console.error("Popup Error:", chrome.runtime.lastError.message);
    } else if (response && response.success) {
      statusDiv.textContent = 'Success!';
      // Briefly show success then close the popup
      setTimeout(() => window.close(), 1500);
    } else {
      statusDiv.textContent = `Failed: ${response.error}`;
      console.error("Popup received error:", response.error);
    }
    scrapeButton.disabled = false;
  });
});