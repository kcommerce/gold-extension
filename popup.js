// ── Constants ────────────────────────────────────────────────────────────────
const GOLD_SITE_URL = 'https://www.goldtraders.or.th/';
// Public JSON API that crawls goldtraders.or.th — returns clean structured data
const JSON_API_URL  = 'https://api.chnwt.dev/thai-gold-api/latest';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatPrice(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Number(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseNum(str) {
  if (!str && str !== 0) return null;
  const n = parseFloat(String(str).replace(/[^0-9.\-+]/g, ''));
  return isNaN(n) ? null : n;
}

// ── Rendering ────────────────────────────────────────────────────────────────
function getChangeClass(val) {
  const n = parseNum(val);
  if (n === null) return 'neutral';
  if (n > 0) return '';
  if (n < 0) return 'neg';
  return 'neutral';
}
function getChangePrefix(val) {
  const n = parseNum(val);
  return (n !== null && n > 0) ? '+' : '';
}

function generateChartBars() {
  const heights = [55, 70, 50, 80, 65, 90, 75, 85, 70, 95, 88, 100];
  return heights.map((h, i) =>
    `<div class="chart-bar${i === heights.length - 1 ? ' active' : ''}" style="height:${h}%"></div>`
  ).join('');
}

function renderData(data, sourceLabel) {
  const prevNum     = parseNum(data.prevChange) ?? 0;
  const prevPos     = prevNum >= 0;
  const barChange   = parseNum(data.bar?.change);
  const barChgClass = getChangeClass(barChange);
  const barPrefix   = getChangePrefix(barChange);
  const spread      = (parseNum(data.bar?.sell) - parseNum(data.bar?.buy)) || 200;

  document.getElementById('timestampText').textContent =
    `${data.date || '—'}  ${data.time || ''}${data.session ? `  ·  ครั้งที่ ${data.session}` : ''}`;

  const html = `
    <div class="change-banner${prevPos ? '' : ' negative'}">
      <div class="change-icon">${prevPos ? '📈' : '📉'}</div>
      <div class="change-info">
        <div class="change-label">เทียบกับวันก่อนหน้า</div>
        <div class="change-value">${prevPos ? '+' : ''}${Number(data.prevChange || 0).toLocaleString('th-TH')} บาท</div>
      </div>
      <div class="change-session">
        <div class="session-label">อัปเดต</div>
        <div class="session-value">ครั้งที่ ${data.session || '—'}</div>
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <div class="card-icon bar-icon">🏅</div>
            <div>
              <div class="card-title">ทองคำแท่ง</div>
              <div class="card-purity">96.5% · Gold Bar</div>
            </div>
          </div>
          <div class="card-change-pill ${barChgClass}">
            ${barPrefix}${formatPrice(barChange)}
          </div>
        </div>
        <div class="price-grid">
          <div class="price-cell buy-cell">
            <div class="price-type">รับซื้อ</div>
            <div class="price-amount">${formatPrice(data.bar?.buy)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
          <div class="price-cell sell-cell">
            <div class="price-type">ขายออก</div>
            <div class="price-amount">${formatPrice(data.bar?.sell)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
        </div>
        <div class="spread-section">
          <div class="spread-label">
            <span>SPREAD</span>
            <span style="color:var(--gold-2)">${formatPrice(spread)} บาท</span>
          </div>
          <div class="spread-track">
            <div class="spread-fill" style="width:${Math.min(100,(spread/400)*100)}%"></div>
          </div>
        </div>
        <div class="mini-chart">
          <div class="chart-label">แนวโน้มราคาวันนี้</div>
          <div class="chart-bars">${generateChartBars()}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <div class="card-icon jewelry-icon">💍</div>
            <div>
              <div class="card-title">ทองรูปพรรณ</div>
              <div class="card-purity">96.5% · Gold Jewelry</div>
            </div>
          </div>
          <div class="card-change-pill neutral">ราคาขาย</div>
        </div>
        <div class="price-grid">
          <div class="price-cell tax-cell">
            <div class="price-type">ฐานภาษี</div>
            <div class="price-amount">${formatPrice(data.jewelry?.taxBase)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
          <div class="price-cell sell-cell">
            <div class="price-type">ขายออก</div>
            <div class="price-amount">${formatPrice(data.jewelry?.sell)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <a class="source-link" href="#" id="sourceLink">🔗 goldtraders.or.th</a>
      <div class="auto-refresh" id="sourceTag">${sourceLabel || '⏱ รีเฟรชทุก 5 นาที'}</div>
    </div>
  `;

  document.getElementById('content').innerHTML = html;
  document.getElementById('sourceLink').addEventListener('click', e => {
    e.preventDefault();
    chrome.tabs.create({ url: GOLD_SITE_URL });
  });
}

function renderLoading(msg) {
  document.getElementById('content').innerHTML = `
    <div class="state-card">
      <div class="state-icon"><div class="loading-dots"><span></span><span></span><span></span></div></div>
      <div class="state-text">${msg || 'กำลังดึงราคาทองคำ...'}</div>
      <div class="state-sub">จาก goldtraders.or.th</div>
    </div>`;
}

function renderError(msg) {
  document.getElementById('content').innerHTML = `
    <div class="state-card">
      <div class="state-icon">⚠️</div>
      <div class="state-text">${msg}</div>
      <div class="state-sub">กดปุ่มรีเฟรชเพื่อลองใหม่</div>
    </div>`;
}

// ── Data Fetching — 3-tier strategy ──────────────────────────────────────────

// TIER 1: JSON API (fastest, most reliable)
async function fetchFromJsonApi() {
  const res = await fetch(JSON_API_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const json = await res.json();

  if (json.status !== 'success' || !json.response) throw new Error('Invalid API response');

  const r = json.response;
  // Map API response fields → internal data shape
  // API has: gold (jewelry), gold_bar
  return {
    date:      r.update_date  || '',
    time:      (r.update_time || '').match(/(\d{1,2}:\d{2})/)?.[1] || '',
    session:   (r.update_time || '').match(/ครั้งที่\s+(\d+)/)?.[1] || '',
    bar: {
      buy:    parseNum(r.price?.gold_bar?.buy),
      sell:   parseNum(r.price?.gold_bar?.sell),
      change: null  // API doesn't expose intra-day change
    },
    jewelry: {
      taxBase: parseNum(r.price?.gold?.buy),   // gold.buy = ฐานภาษี (same value)
      sell:    parseNum(r.price?.gold?.sell)
    },
    prevChange: null,
    source: 'json_api'
  };
}

// TIER 2: Cached data from content script (if user has goldtraders tab open)
async function fetchFromContentScript() {
  return new Promise((resolve, reject) => {
    // Check storage first (content.js writes here when goldtraders tab is open)
    chrome.storage.local.get('goldData', ({ goldData }) => {
      if (goldData && goldData.bar?.buy && goldData.bar?.sell) {
        // Accept if less than 10 minutes old
        const age = Date.now() - (goldData.fetchedAt || 0);
        if (age < 10 * 60 * 1000) {
          resolve({ ...goldData, source: 'content_cache' });
          return;
        }
      }

      // Try sending a message to any open goldtraders tab
      chrome.tabs.query({ url: 'https://www.goldtraders.or.th/*' }, tabs => {
        if (!tabs.length) { reject(new Error('No goldtraders tab open')); return; }
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_GOLD_DATA' }, data => {
          if (chrome.runtime.lastError || !data?.bar?.buy) {
            reject(new Error('Content script did not respond'));
          } else {
            resolve({ ...data, source: 'content_script_live' });
          }
        });
      });
    });
  });
}

// TIER 3: Background tab scrape (opens hidden tab, waits for JS render, extracts)
async function fetchViaBackgroundTab() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Background scrape timed out')), 20000);
    chrome.runtime.sendMessage({ type: 'SCRAPE_VIA_TAB' }, data => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (!data || data.error) { reject(new Error(data?.error || 'Scrape returned no data')); return; }
      if (!data.bar?.buy && !data.bar?.sell) { reject(new Error('Scrape returned empty prices')); return; }
      resolve({ ...data, source: 'background_tab' });
    });
  });
}

// ── Master fetch with fallback chain ─────────────────────────────────────────
async function fetchGoldPrice() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  renderLoading('กำลังดึงข้อมูลราคาทองคำ...');

  const strategies = [
    { fn: fetchFromJsonApi,       label: '✓ api.chnwt.dev (goldtraders)',    name: 'JSON API'       },
    { fn: fetchFromContentScript, label: '✓ ข้อมูลจาก goldtraders tab',       name: 'Content Cache'  },
    { fn: fetchViaBackgroundTab,  label: '✓ สแกนจาก goldtraders.or.th โดยตรง', name: 'Background Tab' },
  ];

  for (const { fn, label, name } of strategies) {
    try {
      renderLoading(`กำลังดึงข้อมูล (${name})...`);
      const data = await fn();
      if (data && (data.bar?.buy || data.jewelry?.sell)) {
        console.log(`[GoldExt] Success via ${name}:`, data);
        renderData(data, label);
        btn.classList.remove('spinning');
        return;
      }
    } catch (err) {
      console.warn(`[GoldExt] ${name} failed:`, err.message);
    }
  }

  // All strategies failed
  btn.classList.remove('spinning');
  renderError('ไม่สามารถดึงข้อมูลได้ในขณะนี้');
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', fetchGoldPrice);
document.getElementById('disclaimerLink').addEventListener('click', e => {
  e.preventDefault();
  chrome.tabs.create({ url: GOLD_SITE_URL });
});

fetchGoldPrice();
setInterval(fetchGoldPrice, 5 * 60 * 1000);
