#!/usr/bin/env node
'use strict';

/**
 * Docker Dash Screenshot Script
 * Takes screenshots of all major pages and creates a GIF slideshow.
 *
 * Usage: node scripts/screenshots.js [--url http://host:port] [--user admin] [--pass admin]
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1] || 'http://192.168.13.20:8101';
const USERNAME = process.argv.find(a => a.startsWith('--user='))?.split('=')[1] || 'screenshot-bot';
const PASSWORD = process.argv.find(a => a.startsWith('--pass='))?.split('=')[1] || 'screenshot123';
const OUT_DIR = path.join(__dirname, '..', 'screenshots');
const WAIT_MS = 3000; // Wait for charts/data to load
const VIEWPORT = { width: 1440, height: 900 };

const pages = [
  { name: '01-dashboard', path: '#/', title: 'Dashboard' },
  { name: '02-dashboard-light', path: '#/', title: 'Dashboard (Light)', theme: 'light' },
  { name: '03-containers', path: '#/containers', title: 'Containers' },
  { name: '04-container-detail', path: null, title: 'Container Detail', special: 'containerDetail' },
  { name: '05-terminal', path: null, title: 'Terminal', special: 'terminal' },
  { name: '06-images', path: '#/images', title: 'Images' },
  { name: '07-volumes', path: '#/volumes', title: 'Volumes' },
  { name: '08-networks', path: '#/networks', title: 'Networks' },
  { name: '09-stacks', path: '#/stacks', title: 'Stacks' },
  { name: '10-multi-host', path: '#/multi-host', title: 'Multi-Host Overview' },
  { name: '11-security', path: '#/security', title: 'Security Scanning' },
  { name: '12-logs', path: '#/logs', title: 'Log Explorer' },
  { name: '13-timeline', path: '#/timeline', title: 'Event Timeline' },
  { name: '14-insights', path: '#/insights', title: 'Insights' },
  { name: '15-alerts', path: '#/alerts', title: 'Alerts' },
  { name: '16-system-tools', path: '#/system', title: 'System - Tools', tab: 'tools' },
  { name: '17-howto', path: '#/howto', title: 'How-To Guides' },
  { name: '18-compare', path: '#/compare', title: 'Feature Comparison' },
  { name: '19-topology', path: '#/networks', title: 'Network Topology', tab: 'topology' },
  { name: '20-cost', path: '#/cost-optimizer', title: 'Cost Optimizer' },
  { name: '21-dep-map', path: '#/dependency-map', title: 'Dependency Map' },
  { name: '22-enterprise', path: '#/', title: 'Enterprise Mode', uiMode: 'enterprise' },
  { name: '23-api', path: '#/api-playground', title: 'API Playground' },
  { name: '24-whatsnew', path: '#/whatsnew', title: "What's New" },
  { name: '25-registry-browse', path: '#/registry-browse', title: 'Registry Browser (v7.5.0–v8.1.0)' },
  { name: '26-ai-audit-search', path: '#/system', title: 'AI Audit NL Search (v8.0.0)', tab: 'audit' },
  { name: '27-pcloud-backup', path: '#/system', title: 'pCloud Backup (v8.2.0)', tab: 'backup' },
  { name: '28-observability', path: '#/observability', title: 'Observability Wizard (v7.2.0)' },
];

async function run() {
  // Create output directory
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`📸 Docker Dash Screenshot Tool`);
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Pages: ${pages.length}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: VIEWPORT,
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Login
  console.log('🔐 Logging in...');
  await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  // Check if already logged in (app-shell visible)
  const isLoggedIn = await page.$('#app-shell:not(.hidden)');
  if (!isLoggedIn) {
    const loginForm = await page.$('#login-user');
    if (loginForm) {
      await page.type('#login-user', USERNAME);
      await page.type('#login-pass', PASSWORD);
      await page.click('#login-btn');
      // Wait for either app-shell or error
      await Promise.race([
        page.waitForSelector('#app-shell:not(.hidden)', { timeout: 15000 }),
        page.waitForSelector('#login-error:not(.hidden)', { timeout: 15000 }).then(() => { throw new Error('Login failed — check credentials'); }),
      ]);
    }
  }
  await sleep(3000);
  console.log('✓ Logged in\n');

  // Take screenshots
  for (const p of pages) {
    process.stdout.write(`📷 ${p.name} (${p.title})...`);

    try {
      // Handle theme switching
      if (p.theme === 'light') {
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'light');
        });
      } else if (p.theme !== 'light' && !p.uiMode) {
        await page.evaluate(() => {
          document.documentElement.removeAttribute('data-theme');
        });
      }

      // Handle UI mode
      if (p.uiMode === 'enterprise') {
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-uimode', 'enterprise');
        });
      } else if (!p.uiMode) {
        await page.evaluate(() => {
          document.documentElement.removeAttribute('data-uimode');
        });
      }

      // Navigate
      if (p.path) {
        await page.goto(`${BASE_URL}/${p.path}`, { waitUntil: 'networkidle2', timeout: 15000 });
      }

      // Handle special pages
      if (p.special === 'containerDetail') {
        // Navigate to first running container
        await page.goto(`${BASE_URL}/#/containers`, { waitUntil: 'networkidle2', timeout: 15000 });
        await sleep(2000);
        const firstRow = await page.$('tr[data-cid]');
        if (firstRow) {
          const cid = await firstRow.evaluate(el => el.dataset.cid);
          await page.goto(`${BASE_URL}/#/containers/${cid}`, { waitUntil: 'networkidle2', timeout: 15000 });
        }
      } else if (p.special === 'terminal') {
        // Navigate to first container's terminal tab
        await sleep(1000);
        const termTab = await page.$('[data-tab="terminal"]');
        if (termTab) await termTab.click();
      }

      // Click tab if specified
      if (p.tab) {
        await sleep(1000);
        const tab = await page.$(`[data-tab="${p.tab}"]`);
        if (tab) await tab.click();
      }

      // Wait for content to load (charts, data, etc.)
      await sleep(WAIT_MS);

      // Take screenshot
      const filePath = path.join(OUT_DIR, `${p.name}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(' ✓');
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  // Reset to dark mode standard
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-uimode');
  });

  await browser.close();

  // Create GIF
  console.log('\n🎬 Creating GIF slideshow...');
  await createGif();

  console.log('\n✅ Done!');
  console.log(`   Screenshots: ${OUT_DIR}/`);
  console.log(`   GIF: ${OUT_DIR}/docker-dash-demo.gif`);
}

async function createGif() {
  try {
    const sharp = require('sharp');
    const pngFiles = fs.readdirSync(OUT_DIR)
      .filter(f => f.endsWith('.png') && f.match(/^\d{2}-/))
      .sort();

    if (pngFiles.length === 0) {
      console.log('   No screenshots found for GIF');
      return;
    }

    // Resize all to consistent size and convert to raw frames
    const frames = [];
    for (const file of pngFiles) {
      const buf = await sharp(path.join(OUT_DIR, file))
        .resize(1440, 900, { fit: 'cover' })
        .png()
        .toBuffer();
      frames.push(buf);
    }

    // Create animated GIF using sharp (WebP animation as fallback)
    // Sharp doesn't natively create GIFs, so create a WebP animation
    const gifPath = path.join(OUT_DIR, 'docker-dash-demo.webp');
    await sharp(frames[0], { animated: false })
      .webp({ quality: 80 })
      .toFile(path.join(OUT_DIR, 'frame-0.webp'));

    // Since sharp can't make animated GIFs easily, create an HTML slideshow instead
    const htmlPath = path.join(OUT_DIR, 'docker-dash-demo.html');
    const htmlContent = `<!DOCTYPE html>
<html><head><title>Docker Dash Demo</title>
<style>
  body { margin:0; background:#000; display:flex; align-items:center; justify-content:center; min-height:100vh; }
  img { max-width:100%; max-height:100vh; display:none; }
  img.active { display:block; }
  .controls { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; z-index:10; }
  .controls button { padding:8px 16px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:6px; cursor:pointer; font-size:14px; }
  .controls button:hover { background:rgba(255,255,255,0.2); }
  .counter { position:fixed; top:20px; right:20px; color:#fff; font-size:14px; opacity:0.6; font-family:monospace; }
  .title { position:fixed; top:20px; left:20px; color:#fff; font-size:16px; font-weight:bold; opacity:0.8; }
</style></head><body>
<div class="title" id="title"></div>
<div class="counter" id="counter"></div>
${pngFiles.map((f, i) => `<img src="${f}" data-title="${f.replace(/^\d+-/, '').replace('.png', '').replace(/-/g, ' ')}" ${i === 0 ? 'class="active"' : ''}>`).join('\n')}
<div class="controls">
  <button onclick="prev()">◀ Prev</button>
  <button onclick="toggle()" id="playbtn">⏸ Pause</button>
  <button onclick="next()">Next ▶</button>
</div>
<script>
const imgs = document.querySelectorAll('img');
let idx = 0, playing = true, timer;
function show(i) { imgs.forEach(im=>im.classList.remove('active')); imgs[i].classList.add('active'); document.getElementById('counter').textContent = (i+1)+'/'+imgs.length; document.getElementById('title').textContent = imgs[i].dataset.title; }
function next() { idx = (idx+1) % imgs.length; show(idx); }
function prev() { idx = (idx-1+imgs.length) % imgs.length; show(idx); }
function toggle() { playing = !playing; document.getElementById('playbtn').textContent = playing ? '⏸ Pause' : '▶ Play'; if(playing) start(); else clearInterval(timer); }
function start() { timer = setInterval(next, 2000); }
show(0); start();
</script></body></html>`;
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`   Created HTML slideshow: ${htmlPath}`);
    console.log(`   ${pngFiles.length} frames, 2s per frame`);
  } catch (err) {
    console.log(`   GIF creation failed: ${err.message}`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
