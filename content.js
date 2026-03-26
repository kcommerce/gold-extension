// content.js — injected into https://www.goldtraders.or.th/
// Reads the live rendered DOM and posts gold price data back via chrome.storage

function extractFromDOM() {
  const data = {
    date: '',
    time: '',
    session: '',
    bar: { buy: null, sell: null, change: null },
    jewelry: { taxBase: null, sell: null },
    prevChange: null,
    source: 'content_script',
    fetchedAt: Date.now()
  };

  try {
    const bodyText = document.body.innerText || '';

    // ── Date / Time / Session ──────────────────────────────────────────
    const dateMatch = bodyText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const timeMatch = bodyText.match(/เวลา\s+(\d{1,2}:\d{2})/);
    const sessionMatch = bodyText.match(/ครั้งที่\s+(\d+)/);

    if (dateMatch) data.date = dateMatch[1];
    if (timeMatch) data.time = timeMatch[1];
    if (sessionMatch) data.session = sessionMatch[1];

    // ── Prices via DOM selectors (goldtraders uses specific span IDs / classes) ──
    // Try ID-based selectors first (most reliable)
    const selMap = {
      barBuy:    ['#lblBidBar', '#lblBuyBar', '[id*="BidBar"]', '[id*="BuyBar"]'],
      barSell:   ['#lblAskBar', '#lblSellBar', '[id*="AskBar"]', '[id*="SellBar"]'],
      barChange: ['#lblChangeBar', '[id*="ChangeBar"]'],
      taxBase:   ['#lblTaxBase', '[id*="TaxBase"]', '[id*="taxBase"]'],
      jwlSell:   ['#lblAskGold', '#lblSellGold', '[id*="AskGold"]', '[id*="SellGold"]'],
      prevChg:   ['#lblChangeDay', '[id*="ChangeDay"]', '[id*="changeDay"]']
    };

    function trySelectors(selectors) {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim()) return el.innerText.trim();
        } catch (_) {}
      }
      return null;
    }

    function parsePrice(str) {
      if (!str) return null;
      return parseFloat(str.replace(/[^0-9.\-+]/g, '')) || null;
    }

    data.bar.buy     = parsePrice(trySelectors(selMap.barBuy));
    data.bar.sell    = parsePrice(trySelectors(selMap.barSell));
    data.bar.change  = parsePrice(trySelectors(selMap.barChange));
    data.jewelry.taxBase = parsePrice(trySelectors(selMap.taxBase));
    data.jewelry.sell    = parsePrice(trySelectors(selMap.jwlSell));
    data.prevChange  = trySelectors(selMap.prevChg);

    // ── Fallback: scan all table cells for Thai gold keywords ─────────
    if (!data.bar.buy || !data.bar.sell) {
      const allRows = document.querySelectorAll('tr');
      let barFound = false, jwlFound = false;

      allRows.forEach(row => {
        const rowText = row.innerText || '';
        const nums = [...rowText.matchAll(/[\d,]+\.?\d*/g)]
          .map(m => parseFloat(m[0].replace(/,/g, '')))
          .filter(n => n >= 50000 && n <= 200000);

        if (!barFound && (rowText.includes('ทองคำแท่ง') || rowText.includes('แท่ง')) && nums.length >= 2) {
          data.bar.buy  = data.bar.buy  || nums[0];
          data.bar.sell = data.bar.sell || nums[1];
          barFound = true;
        }
        if (!jwlFound && (rowText.includes('รูปพรรณ') || rowText.includes('ทองรูป')) && nums.length >= 2) {
          data.jewelry.taxBase = data.jewelry.taxBase || nums[0];
          data.jewelry.sell    = data.jewelry.sell    || nums[1];
          jwlFound = true;
        }
      });
    }

    // ── Fallback: regex on full body text ─────────────────────────────
    if (!data.bar.buy) {
      const m = bodyText.match(/รับซื้อ[^\d]*([\d,]+\.?\d*)/);
      if (m) data.bar.buy = parseFloat(m[1].replace(/,/g, ''));
    }
    const allSells = [...bodyText.matchAll(/ขายออก[^\d]*([\d,]+\.?\d*)/g)];
    if (!data.bar.sell  && allSells[0]) data.bar.sell  = parseFloat(allSells[0][1].replace(/,/g, ''));
    if (!data.jewelry.sell && allSells[1]) data.jewelry.sell = parseFloat(allSells[1][1].replace(/,/g, ''));

    if (!data.jewelry.taxBase) {
      const m = bodyText.match(/ฐานภาษี[^\d]*([\d,]+\.?\d*)/);
      if (m) data.jewelry.taxBase = parseFloat(m[1].replace(/,/g, ''));
    }
    if (!data.bar.change) {
      // Look for standalone +NNN before "เทียบ"
      const m = bodyText.match(/\+(\d[\d,]*)\s*\n.*เทียบ/);
      if (m) data.bar.change = parseFloat(m[1].replace(/,/g, ''));
    }
    if (!data.prevChange) {
      const m = bodyText.match(/เทียบกับวันก่อนหน้า[^\d\-+]*([+\-]?\d[\d,]*)/);
      if (m) data.prevChange = m[1].replace(/,/g, '');
    }

  } catch (e) {
    console.error('[GoldExt] content script error:', e);
  }

  return data;
}

// Save to chrome.storage so popup can read it
function saveData() {
  const data = extractFromDOM();
  const hasRealData = data.bar.buy && data.bar.sell;
  if (hasRealData) {
    chrome.storage.local.set({ goldData: data }, () => {
      console.log('[GoldExt] Saved gold data from DOM:', data);
    });
  }
}

// Run on load, and watch for DOM changes (site may update prices via JS)
saveData();

// MutationObserver to re-extract when the site updates prices dynamically
const observer = new MutationObserver(() => {
  saveData();
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

// Also listen for popup asking for a fresh read
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_GOLD_DATA') {
    sendResponse(extractFromDOM());
  }
  return true;
});
