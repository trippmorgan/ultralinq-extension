// backend/inspect-login.mjs
import puppeteer from 'puppeteer';
import fs from 'fs/promises';

async function inspectLoginPage() {
  let browser;
  
  try {
    console.log('Starting browser...\n');
    
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox'],
      devtools: false
    });

    const page = await browser.newPage();
    
    console.log('Navigating to UltraLinq login page...');
    
    await page.goto('https://app.ultralinq.net/1/auth/login/', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    console.log(`✓ Loaded: ${page.url()}\n`);
    
    // Wait for page to fully render
    await page.waitForTimeout(3000);
    
    // Get page title
    const title = await page.title();
    console.log(`Page title: "${title}"\n`);
    
    // Take screenshot
    await page.screenshot({ path: 'ultralinq-login.png', fullPage: true });
    console.log('✓ Screenshot saved to: ultralinq-login.png\n');
    
    // Get HTML content
    const html = await page.content();
    await fs.writeFile('ultralinq-login.html', html);
    console.log('✓ HTML saved to: ultralinq-login.html\n');
    
    // Find all input fields
    console.log('='.repeat(60));
    console.log('INPUT FIELDS FOUND:');
    console.log('='.repeat(60));
    
    const inputs = await page.$$eval('input', elements => 
      elements.map((el, idx) => ({
        index: idx,
        type: el.type,
        name: el.name || '(no name)',
        id: el.id || '(no id)',
        placeholder: el.placeholder || '(no placeholder)',
        className: el.className || '(no class)',
        autocomplete: el.autocomplete || '(no autocomplete)'
      }))
    );
    
    if (inputs.length === 0) {
      console.log('⚠️  NO INPUT FIELDS FOUND!\n');
    } else {
      inputs.forEach(input => {
        console.log(`\nInput #${input.index}:`);
        console.log(`  Type: ${input.type}`);
        console.log(`  Name: ${input.name}`);
        console.log(`  ID: ${input.id}`);
        console.log(`  Placeholder: ${input.placeholder}`);
        console.log(`  Class: ${input.className}`);
        console.log(`  Autocomplete: ${input.autocomplete}`);
      });
    }
    
    // Find all buttons
    console.log('\n' + '='.repeat(60));
    console.log('BUTTONS FOUND:');
    console.log('='.repeat(60));
    
    const buttons = await page.$$eval('button, input[type="submit"]', elements =>
      elements.map((el, idx) => ({
        index: idx,
        type: el.type || 'button',
        text: (el.innerText || el.textContent || el.value || '(no text)').substring(0, 50),
        id: el.id || '(no id)',
        className: el.className || '(no class)',
        name: el.name || '(no name)'
      }))
    );
    
    if (buttons.length === 0) {
      console.log('⚠️  NO BUTTONS FOUND!\n');
    } else {
      buttons.forEach(button => {
        console.log(`\nButton #${button.index}:`);
        console.log(`  Type: ${button.type}`);
        console.log(`  Text: ${button.text}`);
        console.log(`  ID: ${button.id}`);
        console.log(`  Class: ${button.className}`);
        console.log(`  Name: ${button.name}`);
      });
    }
    
    // Find the form
    console.log('\n' + '='.repeat(60));
    console.log('FORMS FOUND:');
    console.log('='.repeat(60));
    
    const forms = await page.$$eval('form', elements =>
      elements.map((el, idx) => ({
        index: idx,
        id: el.id || '(no id)',
        className: el.className || '(no class)',
        action: el.action || '(no action)',
        method: el.method || '(no method)'
      }))
    );
    
    if (forms.length === 0) {
      console.log('⚠️  NO FORMS FOUND!\n');
    } else {
      forms.forEach(form => {
        console.log(`\nForm #${form.index}:`);
        console.log(`  ID: ${form.id}`);
        console.log(`  Class: ${form.className}`);
        console.log(`  Action: ${form.action}`);
        console.log(`  Method: ${form.method}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('INSPECTION COMPLETE');
    console.log('='.repeat(60));
    console.log('\nFiles created:');
    console.log('  - ultralinq-login.png (screenshot)');
    console.log('  - ultralinq-login.html (full HTML)');
    console.log('\n⏳ Browser will remain open for 2 minutes...');
    console.log('   Use this time to manually inspect the page.');
    console.log('   Press Ctrl+C to close early.\n');
    
    // Keep browser open for 2 minutes
    await page.waitForTimeout(120000);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (browser) {
      const pages = await browser.pages();
      if (pages[0]) {
        await pages[0].screenshot({ path: 'error-screenshot.png' });
        console.log('Error screenshot saved to: error-screenshot.png');
      }
    }
  } finally {
    if (browser) {
      console.log('\nClosing browser...');
      await browser.close();
      console.log('✓ Browser closed.\n');
    }
  }
}

// Run and handle any unhandled errors
inspectLoginPage().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});