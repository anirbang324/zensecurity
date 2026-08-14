(async () => {
  const { default: puppeteer } = await import('puppeteer-core');
  console.log('Launching Chrome...');
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (e) {
    console.error('Failed to launch Chrome from Program Files, trying default channel path...', e);
    browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1200, height: 900 });

  // Listen to console events
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  console.log('Navigating to test runner...');
  await page.goto('http://localhost:3000/Productivity_tracker/#test', { waitUntil: 'networkidle2' });

  console.log('Waiting 1 second before starting...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Clicking the "Run Test Suite" button...');
  await page.click('#run-tests-btn');

  console.log('Waiting for tests to complete...');
  // We can wait until the button text contains "Re-run" or tests finish
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('run-tests-btn');
      return btn && btn.textContent.includes('Re-run');
    },
    { timeout: 35000 }
  );

  console.log('Fetching test results...');
  const results = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.test-step-card'));
    return cards.map(step => {
      const titleEl = step.querySelector('div div div span:nth-child(2)');
      const title = titleEl ? titleEl.textContent : 'Unknown';
      const badge = step.querySelector('.badge')?.textContent || '';
      const logs = Array.from(step.querySelectorAll('.test-log-line')).map(l => l.textContent);
      return { title, badge, logs };
    });
  });

  console.log('\n=========================================');
  console.log('          E2E TEST RUNNER REPORT         ');
  console.log('=========================================');
  let allPassed = true;
  results.forEach(res => {
    console.log(`\nStep: ${res.title.trim()}`);
    console.log(`Status: ${res.badge.trim()}`);
    res.logs.forEach(log => console.log(`  ${log}`));
    if (!res.badge.includes('Passed')) {
      allPassed = false;
    }
  });
  console.log('=========================================');

  // Take a screenshot of the results
  console.log('\nTaking screenshot of the test runner UI...');
  const screenshotPath = 'C:/Users/anirb/.gemini/antigravity-ide/brain/cf9c642f-d0ac-4790-83d0-b2d668ec6cd9/test_results.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();

  if (allPassed) {
    console.log('\n🎉 ALL CORE FUNCTIONALITIES AND NEW FEATURES ARE 100% OPERATIONAL!');
    process.exit(0);
  } else {
    console.log('\n❌ ONE OR MORE TEST STEPS FAILED.');
    process.exit(1);
  }
})();
