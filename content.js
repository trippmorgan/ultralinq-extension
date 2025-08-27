// ultralinq-extension/content.js

function insertButton() {
// Check if the button already exists to avoid duplicates
if (document.getElementById("gemini-draft-btn")) return;
const btn = document.createElement("button");
btn.id = "gemini-draft-btn";
btn.innerText = "Draft Gemini Report";
btn.style.cssText = `
position: fixed;
top: 10px;
right: 10px;
z-index: 9999;
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
`;

btn.onclick = () => {
btn.innerText = "Processing...";
btn.disabled = true;
btn.style.backgroundColor = "#808080"; // Grey out button while working

// Send a message to the background script to start the entire scraping process.
chrome.runtime.sendMessage({ action: "startScraping" }, (response) => {
// Re-enable the button when the process is complete or has failed
btn.innerText = "Draft Gemini Report";
btn.disabled = false;
btn.style.backgroundColor = "#4285F4";

if (chrome.runtime.lastError) {
console.error(chrome.runtime.lastError.message);
alert("Error: Could not communicate with the extension's background script. Please try reloading the extension and the page.");
} else if (response && !response.success) {
alert(`An error occurred during scraping: ${response.error}`);
}
});
};
document.body.appendChild(btn);
console.log("UltraLinq AI Helper button inserted.");
}

// Use an observer to make sure we insert the button only when the page is ready
const observer = new MutationObserver((mutations, obs) => {
// #studytabs is a stable element that appears when a study is loaded
if (document.querySelector("#studytabs")) {
insertButton();
obs.disconnect(); // Stop observing once the button is inserted
}
});

// Start observing the page for changes
observer.observe(document.body, { childList: true, subtree: true });
