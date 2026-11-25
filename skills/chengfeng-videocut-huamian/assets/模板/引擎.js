// 引擎.js：出画面工具的页面引擎，一般不用改。镜头写在 镜头.js。
// 出片.cjs 一帧一帧调 window.render(T)（T 是全片的秒）再截图，所以画面里的一切都只按 T 算：
// 不用 CSS 动画、transition、setTimeout、requestAnimationFrame，也不读真实时间。这样同一个 T 截几次都一样，也能从任何一秒开始出。

// ---------- 固定时钟和随机数：页面里谁读时间、要随机数，每次都一样 ----------
(() => {
  let seed = 20261125;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  Date.now = () => 1.7e12; performance.now = () => 0;
  window.requestAnimationFrame = () => 0; window.cancelAnimationFrame = () => {};
})();

const D = window.DATA;
if (!D) throw new Error('没有 DATA：先跑 对时.py 生成 data.js');
const W = D.宽, H = D.高;
const 台 = document.getElementById('台'), 画 = document.getElementById('画'), 字幕条 = document.getElementById('字幕');
台.style.width = W + 'px'; 台.style.height = H + 'px';

// ---------- 小工具 ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const 缓 = {
  直: k => k,
  出: k => 1 - Math.pow(1 - k, 3),                        // 快进慢停：东西出现、落位
  进: k => k * k * k,                                      // 慢起快走：东西离开
  进出: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,   // 两头慢：镜头推拉
  弹: k => { const c = 1.70158, d = c + 1; return 1 + d * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },  // 冲过头再回来：大字砸下
};
// 从「起」开始、用「长」秒走完的进度，0→1，带缓动
function 进度(T, 起, 长 = 0.4, 曲线 = 缓.出) { return 曲线(clamp((T - 起) / 长)); }

// ---------- 镜和字的时间 ----------
const 镜表 = {}; for (const s of D.镜) 镜表[s.n] = s;
function 镜(n) { const s = 镜表[n]; if (!s) throw new Error('没有第 ' + n + ' 镜'); return s; }
const 是字 = c => /[\p{L}\p{N}%]/u.test(c);
let 收集 = [];                       // 当前这一帧的问题
const 启动问题 = []; 收集 = 启动问题;
// 「词」在第 n 镜口播里从第几个字开始（标点不算字）；找不到记一条问题、返回 -1
function 字号(n, 词, 第几次 = 1) {
  const s = 镜(n); let i = -1;
  for (let k = 0; k < 第几次; k++) { i = s.口播.indexOf(词, i + 1); if (i < 0) break; }
  if (i < 0) { 收集.push(`第 ${n} 镜口播里没有「${词}」${第几次 > 1 ? '（第 ' + 第几次 + ' 次）' : ''}`); return -1; }
  return [...s.口播.slice(0, i)].filter(是字).length;
}
// 第 n 镜口播里「词」开始念的时刻（全片的秒）。同一个词出现几次，用「第几次」挑；「偏」是往后挪几秒
function at(n, 词, 第几次 = 1, 偏 = 0) {
  const s = 镜(n), k = 字号(n, 词, 第几次);
  return (k < 0 ? s.a : (s.字[k] ?? s.e)) + 偏;
}
// 第 n 镜口播里「词」念完的时刻
function 念完(n, 词, 第几次 = 1) {
  const s = 镜(n), k = 字号(n, 词, 第几次);
  if (k < 0) return s.e;
  const 末 = k + [...词].filter(是字).length;
  return 末 < s.字.length ? s.字[末] : s.e;
}

// ---------- 层和元素 ----------
const 层们 = {}; let 用了 = {};
// 第 n 镜的图层（一个铺满画面的 div）。这一帧谁调了 层(n)，谁就显示，别的都藏起来
function 层(n) {
  if (!层们[n]) { const d = document.createElement('div'); d.className = '层'; d.dataset.n = n; 画.appendChild(d); 层们[n] = d; }
  用了[n] = 1; return 层们[n];
}
// 第一次调用时把 html 放进图层，以后直接拿；返回 data-k 名字 → 元素
function 建(L, html) {
  if (!L._元素) { L.innerHTML = html; L._元素 = {}; L.querySelectorAll('[data-k]').forEach(e => { L._元素[e.dataset.k] = e; }); }
  return L._元素;
}
// 摆放：x、y 是元素中心在画面上的位置（像素），s 缩放（sx、sy 分开缩），r 旋转（度），o 不透明度
function 摆(el, { x = W / 2, y = H / 2, s = 1, sx = s, sy = s, r = 0, o = 1 } = {}) {
  el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${r}deg) scale(${sx},${sy})`;
  el.style.opacity = clamp(o);
  el.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
}
// 图片、视频截图要先加载完才出片：在 镜头.js 顶上写 预载('素材/a.png', …)
const 预载们 = [];
function 预载(...srcs) { for (const src of srcs) { const i = new Image(); i.src = src; 预载们.push(i.decode().catch(() => 启动问题.push('图片没加载出来：' + src))); } }

// ---------- 字幕：按小句换，念完一句停 0.45 秒再收 ----------
const 句们 = [];
for (const s of D.镜) (s.句 || []).forEach((c, i, arr) => 句们.push({ a: i ? c[1] : s.a, b: i < arr.length - 1 ? arr[i + 1][1] : c[2], 文: c[0] }));
function 字幕(T) {
  if (D.字幕 === false) { 字幕条.style.display = 'none'; return; }
  let s = 句们.find(x => T >= x.a && T < x.b);
  if (!s) { const p = 句们.filter(x => x.b <= T).pop(); if (p && T - p.b < 0.45) s = p; }
  字幕条.style.display = s ? 'block' : 'none';
  if (s && 字幕条.textContent !== s.文) {
    字幕条.textContent = s.文; 字幕条.style.fontSize = '';
    const 宽 = 字幕条.clientWidth; if (字幕条.scrollWidth > 宽) 字幕条.style.fontSize = Math.floor(60 * 宽 / 字幕条.scrollWidth) + 'px';
  }
}

// ---------- 每一帧 ----------
const 画面 = {};   // 镜头.js 往里填：画面[镜号] = (t, T, 镜) => { … }；另有 画面.底(T)、画面.顶(T) 每帧都画（铺底、跨镜的东西）
function 当前镜(T) { let c = D.镜[0]; for (const s of D.镜) if (T >= s.a) c = s; return c; }
window.render = T => {
  收集 = []; 用了 = {};
  const s = 当前镜(T);
  try {
    if (画面.底) 画面.底(T);
    if (画面[s.n]) 画面[s.n](T - s.a, T, s); else 收集.push(`第 ${s.n} 镜还没写画面`);
    if (画面.顶) 画面.顶(T);
  } catch (e) { 收集.push(`第 ${s.n} 镜出错：${e.message}`); }
  for (const k in 层们) 层们[k].style.display = 用了[k] ? '' : 'none';
  字幕(T);
  return [...new Set(收集)].join('；');
};

// ---------- 出片前的检查（出片.cjs 调） ----------
function 有字体(名) {
  const c = document.createElement('canvas').getContext('2d'), t = '永和九年岁在癸丑AaBb0123';
  return ['monospace', 'serif'].some(b => { c.font = `40px ${b}`; const w0 = c.measureText(t).width; c.font = `40px "${名}", ${b}`; return c.measureText(t).width !== w0; });
}
window.CHECK = () => {
  const out = [...启动问题];
  const 名们 = getComputedStyle(台).fontFamily.split(',').map(x => x.trim().replace(/^["']|["']$/g, ''));
  const 具名 = 名们.filter(x => !/^(sans-serif|serif|monospace|system-ui|cursive|fantasy)$/.test(x));
  if (具名.length && !具名.some(有字体)) out.push(`index.html 里写的字体（${具名.join('、')}）这台电脑一个都没有，画面会用默认字体顶上：装上一个，或改 index.html`);
  if (document.getAnimations && document.getAnimations().length) out.push('页面里有 CSS 动画或 transition 在跑：改成按 T 算，不然出片会抖');
  const 没写 = D.镜.filter(s => !画面[s.n]).map(s => s.n);
  if (没写.length) out.push('还没写画面的镜：' + 没写.join('、'));
  return [...new Set(out)];
};
window.addEventListener('load', () => {
  Promise.all([document.fonts.ready, ...预载们, ...[...document.images].map(i => i.decode().catch(() => 启动问题.push('图片没加载出来：' + i.src)))])
    .then(() => { 收集 = []; window.READY = true; });
});
