// ui.js (NEW FILE)

// This module is responsible for creating and managing the UI panel on the page.

// Injects the necessary CSS for our UI panel into the page's head
function injectCSS() {
  if (document.getElementById('gemini-report-styles')) return;

  const style = document.createElement('style');
  style.id = 'gemini-report-styles';
  style.textContent = `
    #gemini-report-panel {
      position: fixed;
      top: 50px;
      right: 20px;
      width: 450px;
      max-height: 80vh;
      background-color: #f9f9f9;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10001;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    #gemini-report-header {
      padding: 10px 15px;
      background-color: #eef2f9;
      border-bottom: 1px solid #ccc;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
    }
    #gemini-report-title {
      font-weight: 600;
      font-size: 16px;
    }
    #gemini-report-close, #gemini-report-copy {
      cursor: pointer;
      border: none;
      background: #ddd;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
    }
    #gemini-report-copy {
        background: #4CAF50;
        color: white;
    }
    #gemini-report-content {
      padding: 15px;
      overflow-y: auto;
      flex-grow: 1;
    }
    #gemini-report-textarea {
      width: 100%;
      height: 400px;
      box-sizing: border-box;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
      line-height: 1.5;
      padding: 8px;
    }
    .gemini-spinner {
        text-align: center;
        padding: 50px;
        font-style: italic;
        color: #555;
    }
  `;
  document.head.appendChild(style);
}

// Shows the UI Panel and sets it to a specific state ('loading', 'success', 'error')
function showUIPanel(state = 'loading', data = '') {
  // Remove any existing panel
  const existingPanel = document.getElementById('gemini-report-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  injectCSS();

  const panel = document.createElement('div');
  panel.id = 'gemini-report-panel';

  let contentHTML = '';
  switch (state) {
    case 'loading':
      contentHTML = '<div class="gemini-spinner">Generating AI report... Please wait.</div>';
      break;
    case 'error':
      contentHTML = `<div class="gemini-spinner" style="color: red;"><strong>Error:</strong> ${data}</div>`;
      break;
    case 'success':
      contentHTML = '<textarea id="gemini-report-textarea"></textarea>';
      break;
  }

  panel.innerHTML = `
    <div id="gemini-report-header">
      <span id="gemini-report-title">AI Drafted Report</span>
      <div>
        <button id="gemini-report-copy" style="display: ${state === 'success' ? 'inline-block' : 'none'}">Copy</button>
        <button id="gemini-report-close">Close</button>
      </div>
    </div>
    <div id="gemini-report-content">
      ${contentHTML}
    </div>
  `;

  document.body.appendChild(panel);

  if (state === 'success') {
    document.getElementById('gemini-report-textarea').value = data;
  }

  // Add event listeners for the new buttons
  document.getElementById('gemini-report-close').addEventListener('click', () => panel.remove());
  if (state === 'success') {
    document.getElementById('gemini-report-copy').addEventListener('click', () => {
      const textToCopy = document.getElementById('gemini-report-textarea').value;
      navigator.clipboard.writeText(textToCopy);
      const copyBtn = document.getElementById('gemini-report-copy');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
  }
}