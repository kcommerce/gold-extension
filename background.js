// background.js — service worker
// Handles opening a goldtraders tab, injecting content script, and relaying data

const GOLD_URL = 'https://www.goldtraders.or.th/';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GoldExt] Extension installed v1.1');
});

// Listen for popup requesting a fresh scrape via hidden tab
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCRAPE_VIA_TAB') {
    scrapeViaTab().then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async
  }
});

async function scrapeViaTab() {
  // Check if goldtraders tab already open
  const existing = await chrome.tabs.query({ url: GOLD_URL + '*' });

  let tab;
  if (existing.length > 0) {
    tab = existing[0];
    // Reload to get fresh data
    await chrome.tabs.reload(tab.id);
  } else {
    // Open a background tab (not focused)
    tab = await chrome.tabs.create({ url: GOLD_URL, active: false });
  }

  // Wait for page to fully load
  await waitForTabLoad(tab.id);

  // Execute content script extraction directly
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractGoldDataFromPage
  });

  // Close the tab if we opened it ourselves
  if (existing.length === 0) {
    chrome.tabs.remove(tab.id).catch(() => {});
  }

  const data = results?.[0]?.result;
  if (data) {
    data.source = 'background_tab';
    data.fetchedAt = Date.now();
    await chrome.storage.local.set({ goldData: data });
  }
  return data || null;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function check(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(check);
        // Extra wait for JS-rendered content
        setTimeout(resolve, 2000);
      }
    }
    chrome.tabs.onUpdated.addListener(check);
    // Fallback timeout
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(check);
      resolve();
    }, 12000);
  });
}

// This function runs inside the goldtraders.or.th page context
function extractGoldDataFromPage() {
  const data = {
    date: '', time: '', session: '',
    bar: { buy: null, sell: null, change: null },
    jewelry: { taxBase: null, sell: null },
    prevChange: null
  };

  try {
    const bodyText = document.body.innerText || '';

    const dateMatch = bodyText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const timeMatch = bodyText.match(/เวลา\s+(\d{1,2}:\d{2})/);
    const sessionMatch = bodyText.match(/ครั้งที่\s+(\d+)/);

    if (dateMatch) data.date = dateMatch[1];
    if (timeMatch) data.time = timeMatch[1];
    if (sessionMatch) data.session = sessionMatch[1];

    function parsePrice(str) {
      if (!str) return null;
      return parseFloat(str.replace(/[^0-9.\-+]/g, '')) || null;
    }

    // Try known element IDs / classes that goldtraders.or.th uses
    const idPatterns = [
      ['bar.buy',         ['#lblBidBar','#lblBuyBar','[id*="BidBar"]','[id*="BuyBar"]']],
      ['bar.sell',        ['#lblAskBar','#lblSellBar','[id*="AskBar"]','[id*="SellBar"]']],
      ['bar.change',      ['#lblChangeBar','[id*="ChangeBar"]']],
      ['jewelry.taxBase', ['#lblTaxBase','[id*="TaxBase"]']],
      ['jewelry.sell',    ['#lblAskGold','#lblSellGold','[id*="AskGold"]','[id*="SellGold"]']],
      ['prevChange',      ['#lblChangeDay','[id*="ChangeDay"]']]
    ];

    for (const [path, sels] of idPatterns) {
      for (const sel of sels) {
        try {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim()) {
            const val = el.innerText.trim();
            const parts = path.split('.');
            if (parts.length === 2) data[parts[0]][parts[1]] = parsePrice(val) ?? val;
            else data[path] = val;
            break;
          }
        } catch (_) {}
      }
    }

    // Table row fallback
    if (!data.bar.buy || !data.bar.sell) {
      document.querySelectorAll('tr').forEach(row => {
        const rowText = row.innerText || '';
        const nums = [...rowText.matchAll(/[\d,]+\.?\d*/g)]
          .map(m => parseFloat(m[0].replace(/,/g, '')))
          .filter(n => n >= 50000 && n <= 200000);

        if (!data.bar.buy && rowText.includes('แท่ง') && nums.length >= 2) {
          data.bar.buy = nums[0]; data.bar.sell = nums[1];
        }
        if (!data.jewelry.taxBase && rowText.includes('รูปพรรณ') && nums.length >= 2) {
          data.jewelry.taxBase = nums[0]; data.jewelry.sell = nums[1];
        }
      });
    }

    // Regex fallback
    if (!data.bar.buy) {
      const m = bodyText.match(/รับซื้อ[^\d]*([\d,]+\.?\d*)/);
      if (m) data.bar.buy = parseFloat(m[1].replace(/,/g, ''));
    }
    const sells = [...bodyText.matchAll(/ขายออก[^\d]*([\d,]+\.?\d*)/g)];
    if (!data.bar.sell && sells[0])      data.bar.sell      = parseFloat(sells[0][1].replace(/,/g, ''));
    if (!data.jewelry.sell && sells[1])  data.jewelry.sell  = parseFloat(sells[1][1].replace(/,/g, ''));

    if (!data.jewelry.taxBase) {
      const m = bodyText.match(/ฐานภาษี[^\d]*([\d,]+\.?\d*)/);
      if (m) data.jewelry.taxBase = parseFloat(m[1].replace(/,/g, ''));
    }
    if (!data.prevChange) {
      const m = bodyText.match(/เทียบกับวันก่อนหน้า[^\d\-+]*([+\-]?\d[\d,]*)/);
      if (m) data.prevChange = m[1].replace(/,/g, '');
    }
    if (!data.bar.change) {
      const m = bodyText.match(/\+(\d[\d,]+)\s*\n/);
      if (m) data.bar.change = parseFloat(m[1].replace(/,/g, ''));
    }

  } catch (e) {
    console.error('[GoldExt] extraction error:', e);
  }

  return data;
}
