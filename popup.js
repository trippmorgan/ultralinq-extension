// popup.js (IMPROVED - with better user feedback)

document.addEventListener('DOMContentLoaded', () => {
  const scrapeButton = document.getElementById('scrapeButton');

  scrapeButton.addEventListener('click', async () => {
    // Disable the button to prevent multiple clicks
    scrapeButton.disabled = true;
    scrapeButton.textContent = 'Processing...';

    // Get the active tab to send the message to
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send the message to the content script to show the UI
    // We expect the content script to handle the UI from now on
    if (tab.id) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['ui.js'] // First, ensure the UI module is available
        }).then(() => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                    // This function runs in the context of the page
                    // It shows the panel in a 'loading' state and then starts the scrape
                    showUIPanel('loading'); 
                    // Send message to background script to start the real work
                    chrome.runtime.sendMessage({ action: "startScraping" });
                }
            });
        });
    }

    // Close the popup immediately after dispatching the command
    setTimeout(() => window.close(), 200);
  });
});