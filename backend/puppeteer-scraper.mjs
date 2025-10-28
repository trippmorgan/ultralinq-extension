// backend/puppeteer-scraper.mjs
import puppeteer from 'puppeteer';
import 'dotenv/config';

/**
 * Semi-automated UltraLinq scraper
 * User logs in and navigates manually, then scraper takes over
 */
export class UltraLinqScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.baseUrl = 'https://app.ultralinq.net';
  }

  /**
   * Initialize browser and wait for user to login manually
   */
  async initialize() {
    console.log('🚀 Launching browser...\n');
    this.browser = await puppeteer.launch({
      headless: false, // Must be false so user can interact
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    
    // Set a realistic user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('📋 MANUAL STEPS REQUIRED:');
    console.log('━'.repeat(60));
    console.log('1. Log into UltraLinq in the browser window');
    console.log('2. Search for the patient');
    console.log('3. Make sure the list of studies is visible');
    console.log('4. Come back here and press Enter to continue');
    console.log('━'.repeat(60));
    console.log('\n🌐 Opening login page...\n');

    // Navigate to login page
    await this.page.goto(`${this.baseUrl}/1/auth/login/`, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Wait for user confirmation
    await this.waitForUserInput('\n✋ Press Enter when you are logged in and have the patient studies visible: ');
    
    console.log('\n✅ Proceeding with automated scraping...\n');
  }

  /**
   * Wait for user to press Enter
   */
  async waitForUserInput(message) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(message, () => {
        rl.close();
        resolve();
      });
    });
  }

  /**
   * Get all study links from the current page
   */
  async getStudyLinksFromCurrentPage() {
    console.log('🔍 Extracting study links from current page...');
    
    const studies = await this.page.evaluate(() => {
      // Look for study links in various possible structures
      const studyLinks = [];
      
      // Try different selectors for study links
      const possibleSelectors = [
        'a[href*="/study/"]',
        'a[href*="study"]',
        'tr a[href]',
        '.study-row a',
        'table a[href]'
      ];
      
      for (const selector of possibleSelectors) {
        const links = Array.from(document.querySelectorAll(selector));
        links.forEach(link => {
          if (link.href && (link.href.includes('study') || link.href.includes('report'))) {
            // Try to extract date and type from nearby elements
            const row = link.closest('tr') || link.closest('.study-row') || link.parentElement;
            
            let studyDate = 'Unknown';
            let studyType = 'Unknown';
            
            if (row) {
              // Try to find date in the row
              const cells = Array.from(row.querySelectorAll('td, .cell, span'));
              cells.forEach(cell => {
                const text = cell.innerText || cell.textContent;
                // Look for date patterns
                if (text && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text)) {
                  studyDate = text.trim();
                }
                // Look for study type keywords
                if (text && (text.includes('Carotid') || text.includes('Aorta') || 
                           text.includes('Arterial') || text.includes('Venous'))) {
                  studyType = text.trim();
                }
              });
            }
            
            studyLinks.push({
              url: link.href,
              text: link.innerText?.trim() || link.textContent?.trim() || '',
              studyDate,
              studyType
            });
          }
        });
        
        if (studyLinks.length > 0) break; // Stop if we found links
      }
      
      // Remove duplicates based on URL
      const uniqueLinks = Array.from(new Map(studyLinks.map(item => [item.url, item])).values());
      
      return uniqueLinks;
    });

    console.log(`✅ Found ${studies.length} study links\n`);
    
    if (studies.length === 0) {
      console.warn('⚠️  No study links found on current page!');
      console.warn('    Make sure you are on a page showing a list of studies.\n');
    } else {
      console.log('📊 Studies found:');
      studies.forEach((study, idx) => {
        console.log(`   ${idx + 1}. ${study.studyDate} - ${study.studyType}`);
      });
      console.log('');
    }
    
    return studies;
  }

  /**
   * Scrape a single study page
   */
  async scrapeStudy(studyUrl, studyIndex, totalStudies) {
    console.log(`\n[${ studyIndex}/${totalStudies}] 📄 Scraping study...`);
    console.log(`   URL: ${studyUrl}`);
    
    try {
      await this.page.goto(studyUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      // Wait for study page to load
      await this.page.waitForTimeout(2000);

      // Check if we're on a study page
      const hasStudyContent = await this.page.evaluate(() => {
        return !!(
          document.querySelector('#studytabs') ||
          document.querySelector('#studyinfo') ||
          document.querySelector('#worksheet2content')
        );
      });

      if (!hasStudyContent) {
        console.log('   ⚠️  Does not look like a study page, skipping...');
        return null;
      }

      // Use your existing scraping logic
      const studyData = await this.page.evaluate(() => {
        function getStudyType() {
          const titleElement = document.querySelector('#report2 .h0, #studyTypeLink, .study-title');
          if (!titleElement) return 'unknown';
          const title = titleElement.innerText.toLowerCase();
          if (title.includes('carotid')) return 'carotid';
          if (title.includes('aorta')) return 'aorta';
          if (title.includes('arterial lower') || title.includes('lower extremity')) return 'lower_arterial';
          if (title.includes('venous')) return 'venous';
          return 'unknown';
        }

        const studyType = getStudyType();
        let patientInfo = {}, measurements = "", conclusion = "";

        function findInfoBarValue(labelText) {
          const labels = Array.from(document.querySelectorAll("#studyinfo td.lab, .info-label"));
          const foundLabel = labels.find(el => el.innerText.trim().startsWith(labelText));
          return foundLabel?.nextElementSibling?.innerText.trim() || "N/A";
        }

        patientInfo = {
          name: document.querySelector("#studyinfo h1, .patient-name")?.innerText.trim() || "N/A",
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
        
        // Scrape conclusion/findings
        const conclusionTextareas = document.querySelectorAll('textarea.findingta, textarea[name*="conclusion"], textarea[name*="impression"]');
        conclusion = Array.from(conclusionTextareas)
          .map(textarea => textarea.value.trim())
          .filter(Boolean)
          .join("\n\n---\n\n");
        
        return { studyType, patientInfo, measurements, conclusion };
      });

      // Get images from most recent study only (to save time)
      let imageData = [];
      if (studyIndex === 1) {
        console.log('   🖼️  Fetching images from most recent study...');
        imageData = await this.scrapeImages();
      }

      console.log(`   ✅ Study Type: ${studyData.studyType}`);
      console.log(`   ✅ Date: ${studyData.patientInfo.studyDate}`);
      console.log(`   ✅ Measurements: ${studyData.measurements.split('\n').length} items`);
      console.log(`   ✅ Images: ${imageData.length} fetched`);

      return { 
        ...studyData, 
        imageData,
        studyUrl 
      };

    } catch (error) {
      console.error(`   ❌ Error scraping study: ${error.message}`);
      return null;
    }
  }

  /**
   * Scrape images from the current study
   */
  async scrapeImages() {
    try {
      // Try to extract image data from the page
      const clips = await this.page.evaluate(() => {
        // Check in main window
        if (window.clips) return window.clips;
        
        // Check in iframe
        const iframe = document.getElementById('html5-embed');
        if (iframe?.contentWindow?.clips) {
          return iframe.contentWindow.clips;
        }
        
        return null;
      });

      if (!clips || Object.keys(clips).length === 0) {
        console.log('      No image clips found');
        return [];
      }

      const imageUrls = Object.values(clips)
        .map(clip => clip.furl)
        .filter(Boolean)
        .slice(0, 15); // Limit to 15 images

      const imageData = [];
      for (let i = 0; i < imageUrls.length; i++) {
        try {
          const url = imageUrls[i];
          const fullUrl = new URL(url, this.page.url()).href;
          
          const response = await this.page.goto(fullUrl, { 
            waitUntil: 'networkidle2',
            timeout: 10000 
          });
          
          const buffer = await response.buffer();
          const base64 = buffer.toString('base64');
          const mimeType = response.headers()['content-type'] || 'image/jpeg';
          
          imageData.push({ data: base64, mimeType });
        } catch (error) {
          // Skip failed images silently
        }
      }

      console.log(`      ✓ Fetched ${imageData.length}/${imageUrls.length} images`);
      return imageData;

    } catch (error) {
      console.error('      ✗ Error fetching images:', error.message);
      return [];
    }
  }

  /**
   * Main method: Scrape all studies from the current page
   */
  async scrapeAllStudiesFromCurrentPage() {
    // Get all study links
    const studyLinks = await this.getStudyLinksFromCurrentPage();
    
    if (studyLinks.length === 0) {
      return [];
    }

    console.log('━'.repeat(60));
    console.log(`🔄 Beginning to scrape ${studyLinks.length} studies...`);
    console.log('━'.repeat(60));

    const scrapedData = [];
    
    for (let i = 0; i < studyLinks.length; i++) {
      const study = studyLinks[i];
      const data = await this.scrapeStudy(study.url, i + 1, studyLinks.length);
      
      if (data) {
        scrapedData.push({
          studyDate: study.studyDate !== 'Unknown' ? study.studyDate : data.patientInfo.studyDate,
          ...data
        });
      }
      
      // Small delay between studies
      if (i < studyLinks.length - 1) {
        await this.page.waitForTimeout(500);
      }
    }

    console.log('\n' + '━'.repeat(60));
    console.log(`✅ Scraping complete! Successfully scraped ${scrapedData.length}/${studyLinks.length} studies`);
    console.log('━'.repeat(60) + '\n');

    return scrapedData;
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed.\n');
    }
  }
}