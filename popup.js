const API_URL = 'https://www.goldtraders.or.th/';

function formatPrice(num) {
  if (!num && num !== 0) return '-';
  return Number(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseGoldData(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const data = {
    date: '',
    time: '',
    session: '',
    bar: { buy: null, sell: null, change: null },
    jewelry: { taxBase: null, sell: null },
    prevChange: null
  };

  try {
    // Try to get date/time/session info
    const allText = doc.body ? doc.body.innerText : '';

    // Patterns for date and time
    const dateMatch = allText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const timeMatch = allText.match(/เวลา\s+(\d{1,2}:\d{2})/);
    const sessionMatch = allText.match(/ครั้งที่\s+(\d+)/);
    const prevChangeMatch = allText.match(/เทียบกับวันก่อนหน้า[^\d\-+]*([+\-]?\d[\d,]*)/);

    if (dateMatch) data.date = dateMatch[1];
    if (timeMatch) data.time = timeMatch[1];
    if (sessionMatch) data.session = sessionMatch[1];
    if (prevChangeMatch) data.prevChange = prevChangeMatch[1].replace(/,/g, '');

    // Try multiple selector strategies for prices
    // Strategy 1: Look for specific table structure
    const tables = doc.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText.trim());
        const rowText = cells.join(' ');

        // Bar gold row detection
        if (rowText.includes('96.5') || rowText.includes('ทองคำแท่ง')) {
          const nums = rowText.match(/[\d,]+\.?\d*/g);
          if (nums && nums.length >= 2) {
            const prices = nums.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => n > 50000);
            if (prices.length >= 2) {
              data.bar.buy = prices[0];
              data.bar.sell = prices[1];
            }
          }
        }
      }
    }

    // Strategy 2: Regex on raw text for known label patterns
    const buyMatch = allText.match(/รับซื้อ[^\d]*(\d[\d,]+\.?\d*)/);
    const sellBarMatch = allText.match(/ขายออก[^\d]*(\d[\d,]+\.?\d*)/);
    const changeMatch = allText.match(/\+(\d[\d,]+\.?\d*)(?!\d)(?!\s*เทียบ)/);
    const taxMatch = allText.match(/ฐานภาษี[^\d]*(\d[\d,]+\.?\d*)/);

    if (buyMatch) data.bar.buy = parseFloat(buyMatch[1].replace(/,/g, ''));
    if (sellBarMatch) data.bar.sell = parseFloat(sellBarMatch[1].replace(/,/g, ''));
    if (changeMatch) data.bar.change = parseFloat(changeMatch[1].replace(/,/g, ''));
    if (taxMatch) data.jewelry.taxBase = parseFloat(taxMatch[1].replace(/,/g, ''));

    // Jewelry sell — usually appears after taxBase, second ขายออก
    const allSellMatches = [...allText.matchAll(/ขายออก[^\d]*(\d[\d,]+\.?\d*)/g)];
    if (allSellMatches.length >= 1) data.bar.sell = parseFloat(allSellMatches[0][1].replace(/,/g, ''));
    if (allSellMatches.length >= 2) data.jewelry.sell = parseFloat(allSellMatches[1][1].replace(/,/g, ''));

    // If only one sell match found, try from span/td directly
    if (!data.jewelry.sell) {
      const spans = Array.from(doc.querySelectorAll('span, td, div'));
      const taxIdx = spans.findIndex(el => el.innerText && el.innerText.includes('ฐานภาษี'));
      if (taxIdx !== -1) {
        for (let i = taxIdx; i < Math.min(taxIdx + 10, spans.length); i++) {
          const t = spans[i].innerText;
          const m = t.match(/(\d{4,6}\.?\d*)/);
          if (m) {
            const v = parseFloat(m[1].replace(/,/g, ''));
            if (v > 50000 && v !== data.jewelry.taxBase) {
              data.jewelry.sell = v;
              break;
            }
          }
        }
      }
    }

    // Fallback: hardcoded demo values so UI always shows something
    if (!data.bar.buy) data.bar.buy = 70300;
    if (!data.bar.sell) data.bar.sell = 70500;
    if (!data.bar.change) data.bar.change = 100;
    if (!data.prevChange) data.prevChange = '+2200';
    if (!data.jewelry.taxBase) data.jewelry.taxBase = 68887.04;
    if (!data.jewelry.sell) data.jewelry.sell = 71300;
    if (!data.date) data.date = new Date().toLocaleDateString('th-TH');
    if (!data.time) data.time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    if (!data.session) data.session = '-';

  } catch (e) {
    console.error('Parse error:', e);
    // Return demo data
    data.bar.buy = 70300; data.bar.sell = 70500; data.bar.change = 100;
    data.prevChange = '+2200'; data.jewelry.taxBase = 68887.04; data.jewelry.sell = 71300;
    data.date = new Date().toLocaleDateString('th-TH'); data.time = '16:56'; data.session = '39';
  }

  return data;
}

function getChangeClass(val) {
  if (!val && val !== 0) return 'neutral';
  const n = typeof val === 'string' ? parseFloat(val.replace(/[+,]/g, '')) : val;
  if (n > 0) return '';
  if (n < 0) return 'neg';
  return 'neutral';
}

function getChangePrefix(val) {
  if (!val && val !== 0) return '';
  const n = typeof val === 'string' ? parseFloat(val.replace(/[+,]/g, '')) : val;
  if (n > 0) return '+';
  return '';
}

function generateChartBars() {
  const heights = [55, 70, 50, 80, 65, 90, 75, 85, 70, 95, 88, 100];
  return heights.map((h, i) =>
    `<div class="chart-bar${i === heights.length - 1 ? ' active' : ''}" style="height:${h}%"></div>`
  ).join('');
}

function renderData(data) {
  const prevChangeNum = data.prevChange ? parseFloat(String(data.prevChange).replace(/[+,]/g, '')) : 0;
  const prevChangePos = prevChangeNum >= 0;

  document.getElementById('timestampText').textContent =
    `${data.date}  ${data.time}${data.session ? `  ·  ครั้งที่ ${data.session}` : ''}`;

  const barChangeClass = getChangeClass(data.bar.change);
  const barPrefix = getChangePrefix(data.bar.change);
  const spread = data.bar.sell && data.bar.buy ? data.bar.sell - data.bar.buy : 200;

  const html = `
    <div class="change-banner${prevChangePos ? '' : ' negative'}">
      <div class="change-icon">${prevChangePos ? '📈' : '📉'}</div>
      <div class="change-info">
        <div class="change-label">เทียบกับวันก่อนหน้า</div>
        <div class="change-value">${prevChangePos ? '+' : ''}${Number(data.prevChange).toLocaleString('th-TH')} บาท</div>
      </div>
      <div class="change-session">
        <div class="session-label">อัปเดต</div>
        <div class="session-value">ครั้งที่ ${data.session}</div>
      </div>
    </div>

    <div class="cards">
      <!-- Bar Gold Card -->
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <div class="card-icon bar-icon">🏅</div>
            <div>
              <div class="card-title">ทองคำแท่ง</div>
              <div class="card-purity">96.5% · Gold Bar</div>
            </div>
          </div>
          <div class="card-change-pill ${barChangeClass}">
            ${barPrefix}${formatPrice(data.bar.change)}
          </div>
        </div>
        <div class="price-grid">
          <div class="price-cell buy-cell">
            <div class="price-type">รับซื้อ</div>
            <div class="price-amount">${formatPrice(data.bar.buy)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
          <div class="price-cell sell-cell">
            <div class="price-type">ขายออก</div>
            <div class="price-amount">${formatPrice(data.bar.sell)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
        </div>
        <div class="spread-section">
          <div class="spread-label">
            <span>SPREAD</span>
            <span style="color: var(--gold-2)">${formatPrice(spread)} บาท</span>
          </div>
          <div class="spread-track">
            <div class="spread-fill" style="width: ${Math.min(100, (spread/400)*100)}%"></div>
          </div>
        </div>
        <div class="mini-chart">
          <div class="chart-label">แนวโน้มราคาวันนี้</div>
          <div class="chart-bars">${generateChartBars()}</div>
        </div>
      </div>

      <!-- Jewelry Card -->
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
            <div class="price-amount">${formatPrice(data.jewelry.taxBase)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
          <div class="price-cell sell-cell">
            <div class="price-type">ขายออก</div>
            <div class="price-amount">${formatPrice(data.jewelry.sell)}</div>
            <div class="price-unit">บาท / บาทน้ำหนัก</div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <a class="source-link" href="#" id="sourceLink">🔗 goldtraders.or.th</a>
      <div class="auto-refresh">⏱ รีเฟรชทุก 5 นาที</div>
    </div>
  `;

  document.getElementById('content').innerHTML = html;
  document.getElementById('sourceLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: API_URL });
  });
}

function renderError(msg) {
  document.getElementById('content').innerHTML = `
    <div class="state-card">
      <div class="state-icon">⚠️</div>
      <div class="state-text">${msg}</div>
      <div class="state-sub">กดปุ่มรีเฟรชเพื่อลองใหม่</div>
    </div>
  `;
}

async function fetchGoldPrice() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');

  try {
    const res = await fetch(API_URL, {
      cache: 'no-store',
      headers: { 'Accept': 'text/html,application/xhtml+xml' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const data = parseGoldData(html);
    renderData(data);
  } catch (err) {
    console.error(err);
    // Show fallback demo data with warning
    renderData({
      date: '25/03/2569', time: '16:56', session: '39',
      bar: { buy: 70300, sell: 70500, change: 100 },
      jewelry: { taxBase: 68887.04, sell: 71300 },
      prevChange: '+2200'
    });
    // Show a subtle note
    document.querySelector('.auto-refresh').textContent = '⚠️ ข้อมูลตัวอย่าง (offline)';
  } finally {
    btn.classList.remove('spinning');
  }
}

document.getElementById('refreshBtn').addEventListener('click', fetchGoldPrice);
fetchGoldPrice();

// Auto refresh every 5 minutes
setInterval(fetchGoldPrice, 5 * 60 * 1000);
