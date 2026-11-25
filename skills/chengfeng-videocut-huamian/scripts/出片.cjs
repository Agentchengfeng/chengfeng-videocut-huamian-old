#!/usr/bin/env node
// 出片.cjs：把画面页面一帧一帧截下来出 mp4，或者只截几张图看。
// 用法：
//   node 出片.cjs <画面目录> <起秒> <止秒|end> <输出.mp4> [--口播 口播.wav] [--路 4] [--定格 1]
//       整片写 0 end；只看一段就写那段的秒数。给了 --口播，就从起秒切同一段声音混进去。出到片尾再定格 --定格 秒。
//   node 出片.cjs <画面目录> 截 <输出目录> <秒 …> [--两次]
//   node 出片.cjs <画面目录> 截 <输出目录> 每 2.5 [--两次]
//       截成 jpg（文件名是秒），再拼一张 总览.jpg。--两次：每个时刻在另一个页面（先跳到别的秒再回来）再截一次比一比，
//       明显不一样就是画面没全按 T 算。字边上差一两级的抗锯齿毛边不算（放大过的字会有，看不出来）。
// 画面目录里要有 index.html 和 data.js（对时.py 出的）；页面给 window.render(T)，准备好以后 window.READY = true（模板的 引擎.js 都做好了）。
// 浏览器：环境变量 CHROME_PATH → 本机的 Chrome / Edge / Chromium → Playwright 自己下的浏览器。ffmpeg：环境变量 FFMPEG → PATH 里的。
// 页面报错、口播里找不到的词、字体没装、截两次不一样，都列在最后的“问题”里；有问题退出码 1。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const 退出 = (话, 码 = 2) => { console.log(话); process.exit(码); };
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const 参 = process.argv.slice(2);
function 取(名, 默认) { const i = 参.indexOf(名); if (i < 0) return 默认; const v = 参[i + 1]; 参.splice(i, 2); return v; }
function 有(名) { const i = 参.indexOf(名); if (i < 0) return false; 参.splice(i, 1); return true; }
const 口播 = 取('--口播'), 路 = Math.max(1, +取('--路', 4)), 定格 = +取('--定格', 1), 两次 = 有('--两次');
if (参.length < 3) 退出('用法：\n  node 出片.cjs <画面目录> <起秒> <止秒|end> <输出.mp4> [--口播 口播.wav] [--路 4] [--定格 1]\n  node 出片.cjs <画面目录> 截 <输出目录> <秒 …>|每 <间隔> [--两次]');

let DIR = path.resolve(参[0]), HTML = path.join(DIR, 'index.html');
if (fs.existsSync(DIR) && fs.statSync(DIR).isFile()) { HTML = DIR; DIR = path.dirname(DIR); }
if (!fs.existsSync(HTML)) 退出(`找不到 ${HTML}`);
const DJ = path.join(DIR, 'data.js');
if (!fs.existsSync(DJ)) 退出(`${DIR} 里没有 data.js：先跑 对时.py`);
const 文 = fs.readFileSync(DJ, 'utf8');
const DATA = JSON.parse(文.slice(文.indexOf('{'), 文.lastIndexOf('}') + 1));
const W = DATA.宽, H = DATA.高, FPS = DATA.fps || 25, END = DATA.片长;

function 找playwright() {
  const 家 = process.env.CHENGFENG_VIDEOCUT_HUAMIAN_HOME || os.homedir();
  for (const c of [process.env.PLAYWRIGHT_CORE, path.join(家, '.chengfeng-videocut-huamian', 'node_modules', 'playwright-core'), 'playwright-core', 'playwright']) {
    if (!c) continue; try { return require(c); } catch { }
  }
  退出('找不到 playwright-core（用它开浏览器截图）。装一下：\n  npm install --prefix ~/.chengfeng-videocut-huamian playwright-core');
}
function 找浏览器() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const 候选 = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
    win32: [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).flatMap(p => [path.join(p, 'Google/Chrome/Application/chrome.exe'), path.join(p, 'Microsoft/Edge/Application/msedge.exe')]),
  }[process.platform] || [];
  return 候选.find(p => fs.existsSync(p)) || null;
}
function 找ffmpeg() {
  for (const c of [process.env.FFMPEG, 'ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (c && !spawnSync(c, ['-version'], { stdio: 'ignore' }).error) return c;
  }
  退出('找不到 ffmpeg：macOS 用 brew install ffmpeg，别的系统去 https://ffmpeg.org 下');
}

const 问题 = [];
async function 开浏览器() {
  const { chromium } = 找playwright(), 路径 = 找浏览器();
  const args = ['--allow-file-access-from-files', '--hide-scrollbars', '--mute-audio', '--disable-gpu', '--force-color-profile=srgb', '--run-all-compositor-stages-before-draw',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  try { return await chromium.launch({ executablePath: 路径 || undefined, args }); }
  catch (e) { 退出(`浏览器开不起来（${路径 || 'Playwright 自带的'}）：${String(e.message).split('\n')[0]}\n装 Google Chrome，或运行 npx playwright install chromium；装在别处就设 CHROME_PATH`); }
}
async function 开页(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', x => 问题.push('页面报错 ' + x.message));
  page.on('console', m => { if (m.type() === 'error') 问题.push('控制台 ' + m.text()); });
  await page.goto(pathToFileURL(HTML).href);
  try { await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 }); }
  catch { 退出('页面 60 秒没准备好（window.READY 没变 true）：\n' + [...new Set(问题)].slice(0, 10).join('\n'), 1); }
  return page;
}
async function 画(page, T) { const r = await page.evaluate(T => window.render(T), T); if (r) 问题.push(`${T.toFixed(2)} 秒：${r}`); }
async function 查页(page, T) { await 画(page, T); 问题.push(...await page.evaluate(() => (window.CHECK ? window.CHECK() : []))); }
function 收尾(话) {
  // 同一句问题在很多帧都报：按内容合并，记第一次出现的秒
  const 并 = new Map();
  for (const x of 问题) { const m = x.match(/^([\d.]+) 秒：(.*)$/); const k = m ? m[2] : x; if (!并.has(k)) 并.set(k, m ? `${m[1]} 秒起：${m[2]}` : x); }
  const 列 = [...并.values()];
  console.log(话);
  console.log(列.length ? `问题 ${列.length}：\n` + 列.slice(0, 40).join('\n') : '问题 无');
  process.exit(列.length ? 1 : 0);
}

async function 截图模式() {
  const OUTD = path.resolve(参[2]); fs.mkdirSync(OUTD, { recursive: true });
  let ts = 参.slice(3);
  if (ts[0] === '每') { const d = +ts[1]; ts = []; for (let t = 0; t < END - 1e-6; t += d) ts.push(+t.toFixed(3)); }
  else ts = ts.map(Number);
  if (!ts.length || ts.some(x => isNaN(x))) 退出('截哪几秒？写秒数，或者 每 2.5');
  const browser = await 开浏览器(), p1 = await 开页(browser), p2 = 两次 ? await 开页(browser) : null, 比页 = 两次 ? await browser.newPage() : null;
  await 查页(p1, ts[0]);
  const 名们 = []; let 不同 = 0;
  for (const T of ts) {
    await 画(p1, T);
    const 名 = T.toFixed(2).padStart(7, '0') + '.jpg';
    await p1.screenshot({ path: path.join(OUTD, 名), type: 'jpeg', quality: 88 });
    名们.push([名, T]);
    if (p2) {
      const a = await p1.screenshot({ type: 'png' });
      await 画(p2, Math.min(END, T + 1.37)); await 画(p2, T);
      const b = await p2.screenshot({ type: 'png' });
      if (!a.equals(b)) {
        const r = await 比页.evaluate(async ([a, b]) => {
          const 读 = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
          const [ia, ib] = await Promise.all([读(a), 读(b)]), cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
          const g = cv.getContext('2d'); g.drawImage(ia, 0, 0); const A = g.getImageData(0, 0, cv.width, cv.height).data; g.drawImage(ib, 0, 0); const B = g.getImageData(0, 0, cv.width, cv.height).data;
          let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
          for (let i = 0; i < A.length; i += 4) {
            if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) <= 30) continue;
            const p = i / 4, x = p % cv.width, y = (p / cv.width) | 0; n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
          return { n, 框: [x0, y0, x1, y1] };
        }, [a.toString('base64'), b.toString('base64')]);
        if (r.n > 30) { 不同++; 问题.push(`${T.toFixed(2)} 秒截两次不一样（${r.n} 个像素，在 x ${r.框[0]}–${r.框[2]}、y ${r.框[1]}–${r.框[3]}）：画面里有东西没按 T 算（随机数、真实时间、CSS 动画、上一帧留下的状态）`); }
      }
    }
  }
  const 列数 = W >= H ? 3 : 4, 格 = 360;
  const html = `<!DOCTYPE html><meta charset="UTF-8"><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${列数},${格}px);gap:4px;padding:4px;font:600 18px sans-serif;color:#fff">` +
    名们.map(([n, T]) => `<div style="position:relative"><img src="${encodeURIComponent(n)}" style="width:${格}px;display:block"><span style="position:absolute;left:4px;top:4px;background:#000b;padding:1px 6px">${fmt(T)}</span></div>`).join('') + '</body>';
  const hp = path.join(OUTD, '_总览.html'); fs.writeFileSync(hp, html);
  const pg = await browser.newPage({ viewport: { width: 列数 * (格 + 4) + 4, height: 300 } });
  await pg.goto(pathToFileURL(hp).href); await pg.waitForLoadState('load');
  await pg.screenshot({ path: path.join(OUTD, '总览.jpg'), type: 'jpeg', quality: 70, fullPage: true });
  fs.unlinkSync(hp); await browser.close();
  收尾(`截了 ${名们.length} 张 → ${OUTD}（总览.jpg 是拼好的一张）${p2 ? `；截两次比过，不一样 ${不同} 张` : ''}`);
}

async function 出片模式() {
  const FF = 找ffmpeg();
  const a0 = +参[1], b0 = 参[2] === 'end' ? END : Math.min(+参[2], END), OUT = path.resolve(参[3]);
  if (!参[3] || isNaN(a0) || isNaN(b0) || b0 <= a0) 退出('起秒、止秒不对：止秒要比起秒大，整片写 0 end');
  if (口播 && !fs.existsSync(口播)) 退出('找不到 ' + 口播);
  const 到尾 = b0 >= END - 1e-6, t0 = Date.now(), N = Math.round((b0 - a0) * FPS), 每路 = Math.ceil(N / 路), 尾帧 = 到尾 ? Math.round(定格 * FPS) : 0;
  const od = path.dirname(OUT), tag = `_段-${process.pid}-`; fs.mkdirSync(od, { recursive: true });
  const browser = await 开浏览器(), parts = [];
  await Promise.all([...Array(路)].map(async (_, w) => {
    const s = w * 每路, e = Math.min(N, (w + 1) * 每路); if (s >= e) return;
    const page = await 开页(browser);
    if (w === 0) await 查页(page, a0);
    const seg = path.join(od, `${tag}${w}.mp4`); parts[w] = seg;
    const ff = spawn(FF, ['-nostdin', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), seg]);
    ff.stderr.on('data', d => 问题.push('ffmpeg ' + d));
    const 送 = async buf => { if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); };
    let buf;
    for (let i = s; i < e; i++) {
      await 画(page, +(a0 + i / FPS).toFixed(4));
      buf = await page.screenshot({ type: 'png' }); await 送(buf);
      if ((i - s) % 250 === 249) console.log(`第 ${w + 1} 路 ${i - s + 1}/${e - s} 帧，${Math.round((Date.now() - t0) / 1000)} 秒`);
    }
    if (e === N) for (let i = 0; i < 尾帧; i++) await 送(buf);
    ff.stdin.end(); await new Promise(r => ff.on('close', r)); await page.close();
  }));
  await browser.close();
  const 表 = path.join(od, `${tag}表.txt`); fs.writeFileSync(表, parts.filter(Boolean).map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const 无声 = 口播 ? path.join(od, `${tag}无声.mp4`) : OUT;
  const c = spawnSync(FF, ['-nostdin', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 表, '-c', 'copy', '-movflags', '+faststart', 无声]);
  if (c.status) 问题.push('接段 ' + c.stderr);
  if (口播 && !c.status) {
    const 长 = ((N + 尾帧) / FPS).toFixed(3);
    const fl = `anullsrc=r=48000:cl=stereo,atrim=0:${长}[底];[1:a]atrim=start=${a0},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[声];[底][声]amix=inputs=2:duration=first:normalize=0[a]`;
    const m = spawnSync(FF, ['-nostdin', '-y', '-loglevel', 'error', '-i', 无声, '-i', path.resolve(口播), '-filter_complex', fl, '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', 长, '-movflags', '+faststart', OUT]);
    if (m.status) 问题.push('混口播 ' + m.stderr); else fs.unlinkSync(无声);
  }
  parts.filter(Boolean).forEach(p => fs.existsSync(p) && fs.unlinkSync(p)); fs.unlinkSync(表);
  收尾(`${fmt(a0)}–${fmt(b0)}，${N} 帧${尾帧 ? ' + 定格 ' + 尾帧 + ' 帧' : ''}，${路} 路，用了 ${Math.round((Date.now() - t0) / 1000)} 秒 → ${OUT}${口播 ? '（带口播）' : '（无声）'}`);
}

(参[1] === '截' ? 截图模式() : 出片模式()).catch(e => 退出('出错：' + (e && e.stack || e), 1));
