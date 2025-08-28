
// iframe_scraper.js

// Log that the scraper script has been injected into the iframe
console.log("iFrame Scraper Injected.");

/**
 * extractImageUrls
 * ----------------
 * 1. Finds the <script> tag containing the `var clips = {...}` declaration.
 * 2. Extracts and parses the JSON blob to retrieve all clip entries.
 * 3. Collects the `furl` field from each clip, filters out invalid entries,
 *    and deduplicates URLs via a Set, then returns the array.
 */
function extractImageUrls() {
  // 1. Locate the script tag that defines `clips`
  const clipsScript = Array.from(document.querySelectorAll('script'))
    .find(s => s.textContent.includes('var clips = {'));
  if (!clipsScript) {
    console.log("iFrame Scraper: 'clips' script not found.");
    return [];
  }

  // 2. Use a regex that matches across lines and handles nested braces
  const match = clipsScript.textContent.match(/var clips = ({[\s\S]*?});/);
  if (!match) {
    console.log("iFrame Scraper: 'clips' declaration did not match expected pattern.");
    return [];
  }

  try {
    // 3a. Parse the JSON blob into an object
    const clipsData = JSON.parse(match[1]);

    // 3b. Extract all `furl` values, filter out null/undefined, dedupe via Set
    const imageUrls = Array.from(new Set(
      Object.values(clipsData)
        .filter(clip => clip && clip.furl)
        .map(clip => clip.furl)
    ));

    return imageUrls;
  } catch (e) {
    console.error("iFrame Scraper: Error parsing 'clips' JSON data:", e);
    return [];
  }
}

/**
 * Listen for a request from the parent window (content.js) and respond
 * with the extracted image URLs. This avoids race conditions.
 */
window.addEventListener('message', (event) => {
  // A basic security check to ensure the message is what we expect.
  if (event.data?.type === 'ULTRALINQ_GET_IMAGE_URLS') {
    console.log("iFrame Scraper: Received request for image URLs from parent.");
    const urls = extractImageUrls();
    console.log(`iFrame Scraper: Responding with ${urls.length} image URLs.`);
    event.source.postMessage(
      { type: 'ULTRALINQ_IMAGE_URLS_RESPONSE', urls: urls },
      event.origin
    );
  }
});
