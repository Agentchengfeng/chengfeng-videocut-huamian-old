// 镜头.js：照分镜稿一镜一段写。画面[镜号] = (t, T, 镜) => { … }
//   t = 这一镜开始后的秒，T = 全片的秒，镜 = data.js 里这一镜（a 起、b 止、口播…）
//   念到哪个词才出哪个东西：at(镜号, '词') 是这个词开始念的秒，进度(T, at(…)) 从 0 走到 1。
//   用得上的：层(n)、建(层, html)、摆(元素, {x, y, s, r, o})、at、念完、进度、缓.出/进/进出/弹、clamp、lerp、W、H、预载
// 下面是示例片（《迪士尼动画十二法则》开头三镜），换成你的分镜稿时整个文件重写。

const 金 = '#ffd27a', 灰 = '#8f8b82', 白 = '#f2ede3';

// 第 1 镜：念到哪出到哪；金色大字砸下来时，前一行压暗
画面[1] = (t, T) => {
  const e = 建(层(1), `
    <div data-k="前" style="font-size:72px;font-weight:600">这可能是学 AI 剪辑</div>
    <div data-k="大" style="font-size:170px;font-weight:900;color:${金}">最重要的</div>
    <div data-k="后" style="font-size:110px;font-weight:800">一个理论</div>`);
  const a = 进度(T, 镜(1).a, .35), b = 进度(T, at(1, '最重要'), .45, 缓.弹), c = 进度(T, at(1, '一个理论'), .35);
  摆(e.前, { y: 470 + (1 - a) * 40, o: a * (1 - .55 * 进度(T, at(1, '最重要'), .3)) });
  摆(e.大, { y: 660, s: lerp(1.6, 1, b), o: 进度(T, at(1, '最重要'), .12) });
  摆(e.后, { y: 860 + (1 - c) * 40, o: c });
};

// 第 2 镜：十二个格子一格一格亮，念到“十二”时开始
画面[2] = (t, T) => {
  const L = 层(2);
  const e = 建(L, `<div data-k="题" style="font-size:96px;font-weight:900">迪士尼动画<span style="color:${金}">十二法则</span></div>` +
    Array.from({ length: 12 }, (_, i) => `<div data-k="g${i}" style="width:200px;height:200px;border-radius:24px;background:#24242a;border:4px solid #3a3a42"></div>`).join(''));
  摆(e.题, { y: 380, o: 进度(T, 镜(2).a, .3), s: lerp(.92, 1, 进度(T, 镜(2).a, .5)) });
  const 起 = at(2, '十二');
  for (let i = 0; i < 12; i++) {
    const k = 进度(T, 起 + i * .07, .25, 缓.弹), 列 = i % 4, 行 = Math.floor(i / 4);
    const g = e['g' + i];
    g.style.background = k > .5 ? 金 : '#24242a'; g.style.borderColor = k > .5 ? '#fff3c8' : '#3a3a42';
    摆(g, { x: W / 2 + (列 - 1.5) * 230, y: 680 + 行 * 230, s: lerp(.6, 1, k), o: .25 + .75 * k });
  }
};

// 第 3 镜：上半一开始就有方块，像 PPT 一样匀速来回平移；念到“十二条”，下半小球带挤压拉伸地弹，上半压暗
画面[3] = (t, T) => {
  const e = 建(层(3), `
    <div data-k="上题" style="font-size:64px;color:${灰}">PPT 式：匀速平移</div>
    <div data-k="方" style="width:190px;height:190px;background:#7090ff;border-radius:16px"></div>
    <div data-k="下题" style="font-size:64px;font-weight:700;color:${金}">十二法则：挤压拉伸</div>
    <div data-k="球" style="width:190px;height:190px;background:${金};border-radius:50%"></div>
    <div data-k="地" style="width:640px;height:6px;background:#3a3a42"></div>`);
  const 上 = 进度(T, 镜(3).a, .3), 下 = 进度(T, at(3, '十二条'), .3), 压 = 1 - .6 * 下;
  摆(e.上题, { y: 200, o: 上 * 压 });
  const 走 = (t * .8) % 2, 段 = 走 < 1 ? 走 : 2 - 走;                        // 0→1→0 来回，匀速、到头硬掉头
  摆(e.方, { x: 250 + 段 * 580, y: 400, o: 上 * 压 });                        // 没有加减速，看着像幻灯片
  const 周 = .8, p = (t % 周) / 周, 高 = Math.sin(p * Math.PI);            // 0 在地上，1 在最高点
  const 贴地 = clamp(1 - 高 / .18), 速 = Math.abs(Math.cos(p * Math.PI));
  摆(e.下题, { y: 620, o: 下 });
  摆(e.球, { y: 1140 - 95 - 高 * 270 + 贴地 * 35, sx: 1 + .35 * 贴地 - .12 * 速 * (1 - 贴地), sy: 1 - .35 * 贴地 + .2 * 速 * (1 - 贴地), o: 下 });
  摆(e.地, { y: 1143, o: 下 });
};
