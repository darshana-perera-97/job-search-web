
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Default to summary-only output unless explicitly disabled
const SUMMARY_ONLY_OUTPUT = process.env.SUMMARY_ONLY_OUTPUT !== 'false';

// Get Chrome executable path
function getChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ];
  
  for (const chromePath of possiblePaths) {
    if (chromePath && fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  return null;
}

// Get Chrome user data directory
function getChromeUserDataDir() {
  const userDataDir = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  if (fs.existsSync(userDataDir)) {
    return userDataDir;
  }
  return null;
}

// Get list of Chrome profiles
function getChromeProfiles(userDataDir) {
  const profiles = [];
  
  try {
    const items = fs.readdirSync(userDataDir, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        const profilePath = path.join(userDataDir, item.name);
        // Check if it's a valid profile (has Preferences file or is Default/Profile X)
        const preferencesPath = path.join(profilePath, 'Preferences');
        if (item.name === 'Default' || item.name.startsWith('Profile ') || fs.existsSync(preferencesPath)) {
          profiles.push(item.name);
        }
      }
    }
    
    // Sort profiles: Default first, then Profile 1, Profile 2, etc.
    profiles.sort((a, b) => {
      if (a === 'Default') return -1;
      if (b === 'Default') return 1;
      return a.localeCompare(b);
    });
  } catch (error) {
    console.error('Error reading profiles:', error.message);
  }
  
  return profiles;
}

// Check if Chrome is running (Windows)
function isChromeRunning() {
  try {
    const { execSync } = require('child_process');
    const result = execSync('tasklist /FI "IMAGENAME eq chrome.exe"', { encoding: 'utf8' });
    return result.includes('chrome.exe');
  } catch (e) {
    return false;
  }
}

// Open Chrome with first profile and perform Google search
async function openChromeAndSearch() {
  const chromePath = getChromePath();
  const userDataDir = getChromeUserDataDir();
  
  if (!chromePath) {
    console.error('Chrome not found! Please install Google Chrome.');
    return;
  }
  
  // Check if Chrome is running
  if (isChromeRunning()) {
    console.log('WARNING: Chrome appears to be running. Please close all Chrome windows first!');
    console.log('Attempting to launch anyway...');
  }
  
  // Get list of profiles and use Profile 1
  let selectedProfile = null;
  let browser;
  
  if (userDataDir) {
    const profiles = getChromeProfiles(userDataDir);
    console.log('Available profiles:', profiles);
    
    // Look for Profile 1
    if (profiles.includes('Profile 1')) {
      selectedProfile = 'Profile 1';
      console.log('Using Profile 1');
    } else if (profiles.length > 0) {
      // Fallback to first profile if Profile 1 doesn't exist
      selectedProfile = profiles[0];
      console.log('Profile 1 not found. Using first available profile:', selectedProfile);
    }
  }
  
  console.log('Chrome path:', chromePath);
  if (userDataDir) {
    console.log('User data dir:', userDataDir);
  }
  
  // Try to launch Chrome with Profile 1
  if (userDataDir && selectedProfile) {
    try {
      browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath,
        args: [
          `--user-data-dir=${userDataDir}`,
          `--profile-directory=${selectedProfile}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      console.log('Chrome launched successfully with profile:', selectedProfile);
    } catch (profileError) {
      console.log('Failed to launch with existing profile:', profileError.message);
      console.log('Trying with temporary profile...');
      
      // Fallback to temporary profile
      try {
        browser = await puppeteer.launch({
          headless: false,
          executablePath: chromePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--disable-features=IsolateOrigins,site-per-process'
          ]
        });
        console.log('Chrome launched successfully with temporary profile');
      } catch (tempError) {
        console.error('Failed to launch Chrome:', tempError.message);
        throw tempError;
      }
    }
  } else {
    // Launch without profile
    browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    console.log('Chrome launched successfully with temporary profile');
  }
  
  const page = await browser.newPage();
  
  const configurePage = async (targetPage) => {
    await targetPage.setViewport({ width: 1920, height: 1080 });
    await targetPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Remove webdriver property to avoid detection
    await targetPage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });
    
    // Add Chrome property
    await targetPage.evaluateOnNewDocument(() => {
      window.chrome = {
        runtime: {}
      };
    });
    
    // Add plugins to appear more like a real browser
    await targetPage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
    });
  };
  
  await configurePage(page);
  
  let searchPage = null;
  const getSearchPage = async () => {
    if (!searchPage) {
      searchPage = await browser.newPage();
      await configurePage(searchPage);
    }
    return searchPage;
  };
  
  const dismissConsentIfPresent = async (targetPage) => {
    try {
      await targetPage.evaluate(() => {
        const selectors = [
          'button[aria-label="Accept all"]',
          'button[aria-label="Accept everything"]',
          '#L2AGLb',
          'button[jsname="higCR"]',
          'button[aria-label="I agree"]'
        ];
        for (const selector of selectors) {
          const btn = document.querySelector(selector);
          if (btn) {
            btn.click();
            return;
          }
        }
      });
    } catch (err) {
      // Ignore consent dismissal errors
    }
  };
  
  const getFirstGoogleResultLink = async (query) => {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      return '';
    }
    
    try {
      const searchTab = await getSearchPage();
      const encodedQuery = encodeURIComponent(trimmedQuery);
      await searchTab.goto(`https://www.google.com/search?q=${encodedQuery}&hl=en`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await dismissConsentIfPresent(searchTab);
      await searchTab.waitForTimeout(1500);
      
      const firstLink = await searchTab.evaluate(() => {
        const preferredSelectors = [
          '.g a',
          '.yuRUbf > a',
          'a h3'
        ];
        for (const selector of preferredSelectors) {
          const nodes = document.querySelectorAll(selector);
          for (const node of nodes) {
            const anchor = node.tagName === 'A' ? node : node.closest('a');
            if (
              anchor &&
              anchor.href &&
              !anchor.href.includes('/search?') &&
              !anchor.href.startsWith('https://www.google.com/url?q=')
            ) {
              return anchor.href;
            }
            if (anchor && anchor.href.startsWith('https://www.google.com/url?q=')) {
              try {
                const url = new URL(anchor.href);
                return url.searchParams.get('q') || '';
              } catch (e) {
                // Ignore invalid URL parsing
              }
            }
          }
        }
        const genericAnchor = document.querySelector('#search a[href]');
        return genericAnchor?.href || '';
      });
      
      return firstLink || '';
    } catch (err) {
      console.log(`Failed to fetch search result for "${trimmedQuery}": ${err.message}`);
      return '';
    }
  };
  
  // Navigate to Google with realistic delay
  console.log('Navigating to Google...');
  await page.goto('https://www.google.com', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  
  // Random delay to simulate human behavior
  await page.waitForTimeout(1000 + Math.random() * 2000);
  
  // Accept cookies if the dialog appears
  try {
    await page.waitForSelector('button:has-text("Accept"), button:has-text("I agree"), #L2AGLb', { timeout: 3000 });
    const acceptButton = await page.$('button:has-text("Accept"), button:has-text("I agree"), #L2AGLb');
    if (acceptButton) {
      await acceptButton.click();
      await page.waitForTimeout(1000 + Math.random() * 1000);
    }
  } catch (e) {
    // Cookie dialog might not appear, continue
  }
  
  // Perform search with more realistic typing
  const searchQuery = 'Software Engineer vacancies in Sri Lanka';
  console.log(`Searching for: "${searchQuery}"`);
  
  // Wait for search box and type with random delays
  await page.waitForSelector('textarea[name="q"], input[name="q"]', { timeout: 10000 });
  await page.waitForTimeout(500 + Math.random() * 1000);
  
  // Type with more realistic delays (varying between characters)
  for (const char of searchQuery) {
    await page.type('textarea[name="q"], input[name="q"]', char, { 
      delay: 50 + Math.random() * 100 
    });
  }
  
  // Wait a bit before pressing Enter (like a human would)
  await page.waitForTimeout(500 + Math.random() * 1000);
  await page.keyboard.press('Enter');
  
  // Wait for search results to load
  await page.waitForSelector('#search', { timeout: 10000 });
  await page.waitForTimeout(2000); // Additional wait for results to fully load
  
  // Extract and list all available tabs in Google search
  console.log('\n========================================');
  console.log('AVAILABLE GOOGLE SEARCH TABS');
  console.log('========================================');
  const availableTabs = await page.evaluate(() => {
    const tabs = [];
    
    // Try different selectors for tabs
    const tabSelectors = [
      '.hdtb-mitem a', // Standard tab links
      'div[role="tab"] a', // Tab role elements
      '.hdtbItm a', // Alternative tab class
      'a[data-hveid]', // Links with data-hveid (Google's tracking)
      '.hdtb-mitem', // Tab items
      '[role="tab"]' // Role-based tabs
    ];
    
    const seenTexts = new Set();
    
    for (const selector of tabSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        const text = element.innerText?.trim() || element.textContent?.trim() || '';
        const href = element.href || element.getAttribute('href') || '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        
        if (text && text.length > 0 && text.length < 50 && !seenTexts.has(text.toLowerCase())) {
          // Filter out common non-tab elements
          const lowerText = text.toLowerCase();
          if (!lowerText.includes('settings') && 
              !lowerText.includes('tools') && 
              !lowerText.includes('search') &&
              !lowerText.includes('google')) {
            seenTexts.add(text.toLowerCase());
            tabs.push({
              name: text,
              href: href,
              ariaLabel: ariaLabel || text
            });
          }
        }
      });
    }
    
    // Also try to find tabs by common Google tab names using JavaScript filtering
    const commonTabNames = ['All', 'Images', 'Videos', 'News', 'Shopping', 'Books', 'Flights', 'Finance', 'Jobs'];
    commonTabNames.forEach(tabName => {
      // Find all links and filter by text content
      const allLinks = document.querySelectorAll('a, [role="tab"], [role="link"]');
      allLinks.forEach(element => {
        const text = element.innerText?.trim() || element.textContent?.trim() || '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        
        // Check if text or aria-label contains the tab name
        if ((text.toLowerCase() === tabName.toLowerCase() || 
             ariaLabel.toLowerCase().includes(tabName.toLowerCase())) &&
            !seenTexts.has(text.toLowerCase()) && text.length > 0) {
          const href = element.href || element.getAttribute('href') || '';
          seenTexts.add(text.toLowerCase());
          tabs.push({
            name: text || tabName,
            href: href,
            ariaLabel: ariaLabel || text || tabName
          });
        }
      });
    });
    
    return tabs;
  });
  
  if (availableTabs.length > 0) {
    console.log(`Found ${availableTabs.length} tabs:\n`);
    availableTabs.forEach((tab, index) => {
      console.log(`${index + 1}. ${tab.name}`);
      if (tab.href) {
        console.log(`   Link: ${tab.href}`);
      }
    });
  } else {
    console.log('No tabs found. The page structure might be different.');
  }
  console.log('========================================\n');
  
  // Navigate to Jobs tab using the link from the tabs list
  console.log('Navigating to Jobs tab...');
  let jobsTabNavigated = false;
  
  // Find the Jobs tab from the available tabs
  const jobsTab = availableTabs.find(tab => 
    tab.name.toLowerCase() === 'jobs' || 
    tab.name.toLowerCase().includes('job')
  );
  
  if (jobsTab && jobsTab.href) {
    try {
      console.log(`Navigating to Jobs page: ${jobsTab.href}`);
      await page.goto(jobsTab.href, { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      console.log('Successfully navigated to Jobs page');
      jobsTabNavigated = true;
      await page.waitForTimeout(2000); // Wait for page to fully load
    } catch (error) {
      console.log('Error navigating to Jobs link:', error.message);
      console.log('Trying to click Jobs tab instead...');
      
      // Fallback: Try clicking the tab
      try {
        const clicked = await page.evaluate((jobsHref) => {
          const selectors = [
            `a[href="${jobsHref}"]`,
            'a[href*="tbm=jobs"]',
            'a[href*="udm=8"]',
            '.hdtb-mitem a',
            'div[role="tab"] a'
          ];
          
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const href = element.href || element.getAttribute('href') || '';
              const text = element.innerText?.trim() || element.textContent?.trim() || '';
              if ((href.includes('tbm=jobs') || href.includes('udm=8') || 
                   text.toLowerCase() === 'jobs') && text.length < 20) {
                element.click();
                return true;
              }
            }
          }
          return false;
        }, jobsTab.href);
        
        if (clicked) {
          console.log('Jobs tab clicked successfully');
          await page.waitForTimeout(3000);
          await page.waitForSelector('#search, [data-ved]', { timeout: 10000 }).catch(() => {});
          jobsTabNavigated = true;
        }
      } catch (clickError) {
        console.log('Error clicking Jobs tab:', clickError.message);
      }
    }
  } else {
    console.log('Jobs tab link not found in available tabs, trying to find and click...');
    try {
      const clicked = await page.evaluate(() => {
        const selectors = [
          'a[href*="tbm=jobs"]',
          'a[href*="udm=8"]',
          '.hdtb-mitem a',
          'div[role="tab"] a'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.innerText?.trim() || element.textContent?.trim() || '';
            const href = element.href || element.getAttribute('href') || '';
            if ((text.toLowerCase() === 'jobs' || 
                 href.includes('tbm=jobs') || 
                 href.includes('udm=8')) && 
                text.length < 20) {
              element.click();
              return true;
            }
          }
        }
        return false;
      });
      
      if (clicked) {
        console.log('Jobs tab clicked successfully');
        await page.waitForTimeout(3000);
        await page.waitForSelector('#search, [data-ved]', { timeout: 10000 }).catch(() => {});
        jobsTabNavigated = true;
      } else {
        console.log('Could not find or click Jobs tab');
      }
    } catch (error) {
      console.log('Error finding Jobs tab:', error.message);
    }
  }
  
  if (!jobsTabNavigated) {
    console.log('Continuing with regular search results...');
  }
  
  // Click on "100+ more jobs" button if it exists
  console.log('Looking for "100+ more jobs" button...');
  try {
    await page.waitForTimeout(2000); // Wait a bit for the page to fully load
    
    // Use JavaScript to find the "more jobs" button by text content
    const moreJobsClicked = await page.evaluate(() => {
      // Try different selectors
      const selectors = [
        'a',
        'button',
        '[role="button"]',
        '.PwjeAc a',
        '[data-ved] a'
      ];
      
      const searchTexts = ['100+ more jobs', 'more jobs', 'See more jobs', 'View more jobs'];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.innerText?.trim() || element.textContent?.trim() || '';
          const ariaLabel = element.getAttribute('aria-label') || '';
          
          // Check if text matches any of the search texts
          for (const searchText of searchTexts) {
            if (text.toLowerCase().includes(searchText.toLowerCase()) ||
                ariaLabel.toLowerCase().includes(searchText.toLowerCase())) {
              element.click();
              return true;
            }
          }
        }
      }
      return false;
    });
    
    if (moreJobsClicked) {
      console.log('Clicked "more jobs" button successfully');
      // Wait for the new page/results to load
      await page.waitForTimeout(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {
        console.log('Navigation completed or timed out');
      });
    } else {
      console.log('"100+ more jobs" button not found, continuing with current results...');
    }
  } catch (error) {
    console.log('Error clicking "more jobs" button:', error.message);
    console.log('Continuing with current results...');
  }
  
  // Extract and print all texts with class "tNxQIb PUpOsf"
  console.log('\n========================================');
  console.log('TEXTS WITH CLASS "tNxQIb PUpOsf"');
  console.log('========================================');
  const tNxQIbTexts = await page.evaluate(() => {
    const texts = [];
    // Find all elements with class "tNxQIb PUpOsf"
    const elements = document.querySelectorAll('.tNxQIb.PUpOsf');
    elements.forEach((element) => {
      const text = element.innerText?.trim() || element.textContent?.trim() || '';
      if (text) {
        texts.push(text);
      }
    });
    return texts;
  });
  
  if (tNxQIbTexts.length > 0) {
    console.log(`Found ${tNxQIbTexts.length} elements with class "tNxQIb PUpOsf":\n`);
    tNxQIbTexts.forEach((text, index) => {
      console.log(`${index + 1}. ${text}`);
    });
  } else {
    console.log('No elements found with class "tNxQIb PUpOsf"');
  }
  console.log('========================================\n');
  
  // Extract job info using the provided classes first
  console.log('Extracting job list using provided classes...');
  const classBasedResults = await page.evaluate(() => {
    const jobs = [];
    const seen = new Set();
    const titleElements = document.querySelectorAll('.tNxQIb.PUpOsf');
    const findApplyLink = (root) => {
      if (!root) return '';
      const special = root.querySelector('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe a, a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
      if (special?.href) {
        return special.href;
      }
      const anchors = root.querySelectorAll('a[href]');
      for (const anchor of anchors) {
        const text = anchor.innerText?.trim().toLowerCase() || '';
        const aria = anchor.getAttribute('aria-label')?.toLowerCase() || '';
        if (
          text.includes('apply') ||
          text.includes('view job') ||
          aria.includes('apply') ||
          aria.includes('view job') ||
          text.includes('learn more')
        ) {
          return anchor.href;
        }
      }
      return anchors[0]?.href || '';
    };
    
    titleElements.forEach((titleEl) => {
      const jobCard = titleEl.closest('[role="tab"], .iFjolb, .PwjeAc, .g, [data-ved], .l9oVJb') || titleEl.parentElement;
      const locationEl = jobCard?.querySelector('.wHYlTd.FqK3wc.MKCbgd');
      const companyEl = jobCard?.querySelector('.wHYlTd.MKCbgd.a3jPc');
      const descriptionEl = jobCard?.querySelector('.NgUYpe, .Yg3bIe, .s, span[style*="-webkit-line-clamp"], .VwiC3b, .tNxQIb:not(.PUpOsf)');
      const specialLinkEl = jobCard?.querySelector('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe a, a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
      const linkEl = specialLinkEl || jobCard?.querySelector('a[href]');
      
      const title = titleEl.innerText?.trim() || '';
      const company = companyEl?.innerText?.trim() || '';
      const location = locationEl?.innerText?.trim() || '';
      const rawDescription = descriptionEl?.innerText?.trim() || '';
      const description = rawDescription && rawDescription !== title && rawDescription !== company && rawDescription !== location ? rawDescription : '';
      const applyLink = findApplyLink(jobCard);
      const link = linkEl?.href || applyLink || '';
      
      const signature = `${title}__${company}__${location}`;
      if (title && !seen.has(signature)) {
        seen.add(signature);
        jobs.push({
          title,
          company,
          location,
          description,
          link,
          applyLink
        });
      }
    });
    
    return jobs;
  });
  
  let results = classBasedResults;
  
  if (!results.length) {
    console.log('No jobs found via provided classes, using fallback extraction...');
    results = await page.evaluate(() => {
      const searchResults = [];
      const seenLinks = new Set(); // To avoid duplicates
      const findApplyLink = (root) => {
        if (!root) return '';
        const special = root.querySelector('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe a, a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
        if (special?.href) {
          return special.href;
        }
        const anchors = root.querySelectorAll('a[href]');
        for (const anchor of anchors) {
          const text = anchor.innerText?.trim().toLowerCase() || '';
          const aria = anchor.getAttribute('aria-label')?.toLowerCase() || '';
          if (
            text.includes('apply') ||
            text.includes('view job') ||
            aria.includes('apply') ||
            aria.includes('view job') ||
            text.includes('learn more')
          ) {
            return anchor.href;
          }
        }
        return anchors[0]?.href || '';
      };
      
      // Multiple selectors for job listings on Google Jobs page
      const jobSelectors = [
        '.PwjeAc', // Google Jobs card
        '[data-ved]', // Search result items
        '.g', // Generic search result
        '[data-entityname]', // Entity-based results
        '.hlcw0c', // Job listing container
        '.BjJfJf', // Job title container
        'div[data-ved][data-hveid]', // VED-based results
        '.Qk80Jf', // Job info container
        '.vNEEBe' // Company name container
      ];
      
      // Try to find all job elements
      for (const selector of jobSelectors) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach((element) => {
          // Look for job title in various possible locations
          const jobTitle = element.querySelector('h3, .BjJfJf, h2, [data-attrid="title"], .B8oxKe, .BjJfJf.PUpOsf, .nDc9Hc, h4');
          
          // Look for link - could be on the title, parent, or nearby
          const specialLink = element.querySelector('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe a, a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
          let linkElement = specialLink || element.querySelector('a[href]');
          if (!linkElement && jobTitle) {
            // Try to find link near the title
            linkElement = jobTitle.closest('a[href]') || jobTitle.parentElement?.querySelector('a[href]');
          }
          if (!linkElement) {
            // Try parent element
            linkElement = element.closest('a[href]');
          }
          
          if (jobTitle && linkElement) {
            const title = jobTitle.innerText.trim();
            const link = linkElement.href;
            
            // Skip if we've seen this link before or if title is empty
            if (title && link && !seenLinks.has(link) && title.length > 3) {
              seenLinks.add(link);
              
              // Extract company name - try multiple selectors
              let companyName = '';
              const companySelectors = [
                '.vNEEBe',
                '.Qk80Jf',
                '.nDc9Hc',
                '[data-attrid="subtitle"]',
                '.s',
                '.Yg3bIe'
              ];
              for (const sel of companySelectors) {
                const companyEl = element.querySelector(sel);
                if (companyEl) {
                  const text = companyEl.innerText.trim();
                  // Company name is usually shorter and doesn't contain location keywords
                  if (text && text.length < 100 && 
                      !text.toLowerCase().includes('sri lanka') &&
                      !text.toLowerCase().includes('colombo') &&
                      !text.match(/^\d+.*ago$/)) { // Not "2 days ago" type text
                    companyName = text;
                    break;
                  }
                }
              }
              
              // Extract location - look for location indicators
              let location = '';
              const locationSelectors = [
                '.Qk80Jf',
                '.s',
                '.Yg3bIe',
                '[data-attrid]'
              ];
              for (const sel of locationSelectors) {
                const locationEls = element.querySelectorAll(sel);
                for (const locEl of locationEls) {
                  const text = locEl.innerText.trim();
                  // Location often contains place names or "Remote", "Hybrid" etc.
                  if (text && (text.toLowerCase().includes('sri lanka') ||
                      text.toLowerCase().includes('colombo') ||
                      text.toLowerCase().includes('remote') ||
                      text.toLowerCase().includes('hybrid') ||
                      text.match(/^[A-Z][a-z]+,\s*[A-Z]/) || // "City, State" pattern
                      text.match(/^\d+.*ago$/) === null)) { // Not time ago
                    if (text !== companyName) { // Don't use company name as location
                      location = text;
                      break;
                    }
                  }
                }
                if (location) break;
              }
              
              // Extract job description
              let description = '';
            const descSelectors = [
              '.NgUYpe',
              '.Yg3bIe',
              '.s',
              'span[style*="-webkit-line-clamp"]',
              '.VwiC3b',
              '[data-attrid="description"]',
              '.PwjeAc span'
            ];
              for (const sel of descSelectors) {
                const descEl = element.querySelector(sel);
                if (descEl) {
                  const text = descEl.innerText.trim();
                  // Description is usually longer and contains job details
                  if (text && text.length > 20 && 
                      text !== title && 
                      text !== companyName && 
                      text !== location &&
                      !text.match(/^\d+.*ago$/)) {
                    description = text;
                    break;
                  }
                }
              }
              
              // If we still don't have description, try getting all text and filtering
              if (!description) {
                const allText = element.innerText || element.textContent || '';
                const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                for (const line of lines) {
                  if (line !== title && 
                      line !== companyName && 
                      line !== location &&
                      line.length > 20 &&
                      !line.match(/^\d+.*ago$/) &&
                      !line.toLowerCase().includes('apply') &&
                      !line.toLowerCase().includes('view')) {
                    description = line;
                    break;
                  }
                }
              }
              
              const applyLink = findApplyLink(element);
              searchResults.push({
                title: title,
                company: companyName,
                location: location,
                description: description,
                link: link,
                applyLink
              });
            }
          }
        });
      }
      
      // Also try to find jobs by looking for h3/h4 tags with links (common pattern)
    const headingElements = document.querySelectorAll('h3, h4');
      headingElements.forEach((heading) => {
        const title = heading.innerText.trim();
        if (title && title.length > 3) {
        const specialLink = heading.closest('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe')?.querySelector('a[href], a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
        let linkElement = specialLink || heading.closest('a[href]') || heading.parentElement?.querySelector('a[href]');
          if (linkElement) {
            const link = linkElement.href;
            if (link && !seenLinks.has(link) && (link.includes('jobs') || link.includes('google.com'))) {
              seenLinks.add(link);
              // Check if this job is not already in results
              if (!searchResults.some(r => r.link === link)) {
                // Try to get additional info from parent
                const parent = heading.closest('[data-ved], .g, .PwjeAc');
                let companyName = '';
                let location = '';
                let description = '';
                
              if (parent) {
                  const parentText = parent.innerText || '';
                  const lines = parentText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                  for (const line of lines) {
                    if (line !== title) {
                      if (!companyName && line.length < 50 && !line.match(/^\d+.*ago$/)) {
                        companyName = line;
                      } else if (!location && (line.toLowerCase().includes('sri lanka') || 
                                               line.toLowerCase().includes('colombo') ||
                                               line.toLowerCase().includes('remote'))) {
                        location = line;
                      } else if (!description && line.length > 20) {
                        description = line;
                      }
                    }
                  }
                }
                
              const applyLink = findApplyLink(parent || heading);
              searchResults.push({
                  title: title,
                  company: companyName,
                  location: location,
                  description: description,
                link: link,
                applyLink
                });
              }
            }
          }
        }
      });
      
      return searchResults; // Return all results
    });
  }
  
  // Print all jobs to terminal with summary information only
  if (results.length === 0) {
    console.log('No jobs found. The page structure might be different.');
    console.log('Current page URL:', page.url());
  } else {
    const jobsToShow = results.slice(-5);
    const startIndex = Math.max(results.length - jobsToShow.length, 0);
    for (let offset = 0; offset < jobsToShow.length; offset++) {
      const result = jobsToShow[offset];
      const index = startIndex + offset;
      console.log(`Title: ${result.title || 'N/A'}`);
      console.log(`Company: ${result.company || 'N/A'}`);
      console.log(`Location: ${result.location || 'N/A'}`);
      
      const searchQueryParts = [result.title, result.company].filter(Boolean);
      if (searchQueryParts.length) {
        const searchLink = await getFirstGoogleResultLink(searchQueryParts.join(' '));
        console.log(`Search Result: ${searchLink || 'N/A'}`);
      } else {
        console.log('Search Result: N/A');
      }
      
      console.log('---------');
    }
  }
  
  if (SUMMARY_ONLY_OUTPUT) {
    await browser.close();
    console.log('Browser closed.');
    return;
  }
  
  // Sequentially click each job tab to load its details
  console.log('\nClicking through each job entry to load details...');
  const openedJobLinks = [];
  const openedJobDetails = [];
  try {
    const jobCount = await page.$$eval('.tNxQIb.PUpOsf', nodes => nodes.length);
    if (jobCount === 0) {
      console.log('No job tabs found to click.');
    } else {
      for (let idx = 0; idx < jobCount; idx++) {
        const clicked = await page.evaluate((index) => {
          const nodes = document.querySelectorAll('.tNxQIb.PUpOsf');
          const target = nodes[index];
          if (!target) {
            return false;
          }
          const tab = target.closest('[role="tab"], .iFjolb, .gws-plugins-horizon-jobs__li-ed, .nJibGY, .l9oVJb');
          const clickable = tab || target;
          clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
          clickable.click();
          return true;
        }, idx);
        
        if (clicked) {
          console.log(`Opened job tab ${idx + 1} of ${jobCount}`);
          await page.waitForTimeout(2000);
          
          // Capture the primary URL associated with the opened job
          const jobLink = await page.evaluate(() => {
            const detailPanel =
              document.querySelector('.NgUYpe, .whazf bREpEc, .KPJpj, .gws-plugins-horizon-jobs__detail-page, [data-ref-id="jobs-detail-pane"]');
            const searchLink = (root) => {
              if (!root) return '';
              const special = root.querySelector('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe a, a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
              if (special?.href) {
                return special.href;
              }
              const anchors = root.querySelectorAll('a[href]');
              for (const anchor of anchors) {
                const text = anchor.innerText?.trim().toLowerCase() || '';
                const aria = anchor.getAttribute('aria-label')?.toLowerCase() || '';
                if (
                  text.includes('apply') ||
                  text.includes('view job') ||
                  aria.includes('apply') ||
                  aria.includes('view job') ||
                  text.includes('learn more')
                ) {
                  return anchor.href;
                }
              }
              return anchors[0]?.href || '';
            };
            
            // Prefer detail pane anchors, fallback to the job card itself
            const detailLink = searchLink(detailPanel);
            if (detailLink) {
              return detailLink;
            }
            
            const activeCard =
              document.querySelector('[role="tab"][aria-selected="true"]') ||
              document.querySelector('.iFjolb[aria-selected="true"]');
            return searchLink(activeCard);
          });
          
          const fallbackUrl = await page.url();
          openedJobLinks.push({
            index: idx + 1,
            url: jobLink || fallbackUrl
          });

          const detailSnapshot = await page.evaluate(() => {
            const detailPanel =
              document.querySelector('.NgUYpe, .whazf bREpEc, .KPJpj, .gws-plugins-horizon-jobs__detail-page, [data-ref-id="jobs-detail-pane"]');
            const activeCard =
              document.querySelector('[role="tab"][aria-selected="true"]') ||
              document.querySelector('.iFjolb[aria-selected="true"]') ||
              document.querySelector('.PwjeAc[aria-selected="true"]') ||
              document.querySelector('.tNxQIb.PUpOsf');
            
            const pickText = (root, selectors) => {
              if (!root) return '';
              for (const selector of selectors) {
                const el = root.querySelector(selector);
                if (el && el.innerText?.trim()) {
                  return el.innerText.trim();
                }
              }
              return '';
            };
            
            const title = pickText(detailPanel, ['.tNxQIb.PUpOsf', 'h1', 'h2']) ||
              pickText(activeCard, ['.tNxQIb.PUpOsf', 'h1', 'h2']);
            const company = pickText(detailPanel, ['.wHYlTd.MKCbgd.a3jPc', '.nDc9Hc', '.vNEEBe']) ||
              pickText(activeCard, ['.wHYlTd.MKCbgd.a3jPc', '.nDc9Hc', '.vNEEBe']);
            const location = pickText(detailPanel, ['.wHYlTd.FqK3wc.MKCbgd', '.Qk80Jf', '.s']) ||
              pickText(activeCard, ['.wHYlTd.FqK3wc.MKCbgd', '.Qk80Jf', '.s']);
            const description = pickText(detailPanel, ['.NgUYpe', '.s', '.Yg3bIe']) ||
              pickText(activeCard, ['.NgUYpe', '.s', '.Yg3bIe']);
            const content = detailPanel?.innerText?.trim() ||
              activeCard?.innerText?.trim() ||
              '';
            
            return {
              title,
              company,
              location,
              description,
              content
            };
          });

          // Collect anchor links from the right-side detail pane/job card
          const anchorDetails = await page.evaluate(() => {
            const anchorsFound = [];
            const collectAnchors = (root) => {
              if (!root) return;
              const anchors = root.querySelectorAll('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe a, a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
              anchors.forEach((anchor) => {
                const text = anchor.innerText?.trim() || anchor.getAttribute('aria-label') || '';
                const href = anchor.href || '';
                if (text || href) {
                  anchorsFound.push({
                    text,
                    href
                  });
                }
              });
            };
            
            const detailPanel =
              document.querySelector('.NgUYpe, .whazf bREpEc, .KPJpj, .gws-plugins-horizon-jobs__detail-page, [data-ref-id="jobs-detail-pane"]');
            collectAnchors(detailPanel);
            
            const activeCard =
              document.querySelector('[role="tab"][aria-selected="true"]') ||
              document.querySelector('.iFjolb[aria-selected="true"]') ||
              document.querySelector('.tNxQIb.PUpOsf');
            collectAnchors(activeCard);
            
            return anchorsFound;
          });

          if (anchorDetails.length) {
            console.log('  Anchors found in description pane/job card:');
            anchorDetails.forEach((anchor, subIdx) => {
              console.log(`    [${idx + 1}.${subIdx + 1}] Text: ${anchor.text || 'N/A'}`);
              console.log(`            URL : ${anchor.href || 'N/A'}`);
            });
          } else {
            console.log('  No anchors detected for this job in the detail pane.');
          }

          openedJobDetails.push({
            index: idx + 1,
            url: jobLink || fallbackUrl,
            applyUrl: jobLink || fallbackUrl,
            title: detailSnapshot.title || '',
            company: detailSnapshot.company || '',
            location: detailSnapshot.location || '',
            description: detailSnapshot.description || '',
            content: detailSnapshot.content || '',
            anchors: anchorDetails
          });
        } else {
          console.log(`Unable to click job tab ${idx + 1}`);
        }
      }
    }
  } catch (tabError) {
    console.log('Error while clicking job tabs:', tabError.message);
  }
  
  if (openedJobLinks.length) {
    console.log('\n========================================');
    console.log('URLS FROM OPENED JOB TABS');
    console.log('========================================');
    openedJobLinks.forEach(({ index, url }) => {
      console.log(`Job Tab #${index}: ${url || 'URL not available'}`);
    });
    console.log('========================================\n');
  }

  if (openedJobDetails.length) {
    console.log('========================================');
    console.log('STORED JOB CONTENT');
    console.log('========================================');
    openedJobDetails.forEach((jobDetail) => {
      console.log(`\nJob Tab #${jobDetail.index}`);
      console.log(`Title      : ${jobDetail.title || 'N/A'}`);
      console.log(`Company    : ${jobDetail.company || 'N/A'}`);
      console.log(`Location   : ${jobDetail.location || 'N/A'}`);
      console.log(`Description: ${jobDetail.description || 'N/A'}`);
      console.log(`URL        : ${jobDetail.url || 'N/A'}`);
      console.log(`Apply URL  : ${jobDetail.applyUrl || jobDetail.url || 'N/A'}`);
      if (jobDetail.content) {
        console.log('\nContent:');
        console.log(jobDetail.content);
      }
      if (jobDetail.anchors?.length) {
        console.log('\nAnchors:');
        jobDetail.anchors.forEach((anchor, anchorIdx) => {
          console.log(`  [${jobDetail.index}.${anchorIdx + 1}] Text: ${anchor.text || 'N/A'}`);
          console.log(`               URL : ${anchor.href || 'N/A'}`);
        });
      }
      console.log('----------------------------------------');
    });
    console.log('========================================\n');
  }
  
  // Print every visible job text block to the terminal
  console.log('\nCollecting full text for every listed job...\n');
  try {
    const allJobTexts = await page.evaluate(() => {
      const items = [];
      const titleNodes = document.querySelectorAll('.tNxQIb.PUpOsf');
      titleNodes.forEach((titleEl, index) => {
        const container =
          titleEl.closest('[role="tab"]') ||
          titleEl.closest('.iFjolb') ||
          titleEl.closest('.PwjeAc') ||
          titleEl.closest('.gws-plugins-horizon-jobs__li-ed') ||
          titleEl.closest('.l9oVJb') ||
          titleEl.parentElement;
        if (!container) {
          return;
        }
        const locationEl = container.querySelector('.wHYlTd.FqK3wc.MKCbgd');
        const companyEl = container.querySelector('.wHYlTd.MKCbgd.a3jPc');
        const descriptionEl =
          container.querySelector('.NgUYpe, .Yg3bIe, .s, .tNxQIb:not(.PUpOsf), span[style*="-webkit-line-clamp"], .VwiC3b') ||
          container.querySelector('[data-attrid="description"]');
        const detailPanel =
          document.querySelector('.NgUYpe, .whazf bREpEc, .KPJpj, .gws-plugins-horizon-jobs__detail-page') ||
          document.querySelector('[data-ref-id="jobs-detail-pane"]');
        const detailText = detailPanel ? detailPanel.innerText.trim() : '';
        const findLink = (root) => {
          if (!root) return '';
          const special = root.querySelector('.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe a, a.nNzjpf-cS4Vcb-PvZLI-Ueh9jd-LgbsSe-Jyewjb-tlSJBe');
          if (special?.href) {
            return special.href;
          }
          const anchors = root.querySelectorAll('a[href]');
          for (const anchor of anchors) {
            const text = anchor.innerText?.trim().toLowerCase() || '';
            const aria = anchor.getAttribute('aria-label')?.toLowerCase() || '';
            if (
              text.includes('apply') ||
              text.includes('view job') ||
              aria.includes('apply') ||
              aria.includes('view job') ||
              text.includes('learn more')
            ) {
              return anchor.href;
            }
          }
          return anchors[0]?.href || '';
        };
        const linkFromDetail = findLink(detailPanel);
        const linkFromContainer = findLink(container);
        
        items.push({
          index: index + 1,
          title: titleEl.innerText.trim(),
          company: companyEl?.innerText?.trim() || '',
          location: locationEl?.innerText?.trim() || '',
          description: descriptionEl?.innerText?.trim() || '',
          detail: detailText,
          link: linkFromContainer || linkFromDetail,
          applyLink: linkFromDetail || linkFromContainer || ''
        });
      });
      return items;
    });
    
    if (!allJobTexts.length) {
      console.log('No job text blocks detected. The layout may have changed.');
    } else {
      allJobTexts.forEach((job) => {
        console.log('='.repeat(80));
        console.log(`JOB TEXT #${job.index}`);
        console.log('='.repeat(80));
        console.log(`Title      : ${job.title || 'N/A'}`);
        console.log(`Company    : ${job.company || 'N/A'}`);
        console.log(`Location   : ${job.location || 'N/A'}`);
        console.log(`Description: ${job.description || 'N/A'}`);
        if (job.detail) {
          console.log(`Detail Pane: ${job.detail}`);
        }
        console.log(`URL        : ${job.link || 'N/A'}`);
        console.log(`Apply URL : ${job.applyLink || job.link || 'N/A'}`);
        console.log('');
      });
    }
  } catch (textError) {
    console.log('Failed to gather job text blocks:', textError.message);
  }
  
  // Keep browser open for 60 seconds so user can see the full jobs page
  console.log('Browser will stay open for 60 seconds. You can view the full jobs page.');
  console.log('Current page URL:', page.url());
  await page.waitForTimeout(60000);
  
  await browser.close();
  console.log('Browser closed.');
}

// Run the function
openChromeAndSearch().catch(console.error);
