#!/usr/bin/env python3
"""第 7 步 检查：出完片看三样——空屏、一帧闪和卡一帧、总览图。只用 ffmpeg 和 Python 标准库。

用法：python3 检查.py <成片.mp4> [--数据 <画面目录>/data.js] [--每 2.5] [--底 0.12] [--空 0.02] [--秒 1.0]
出：<成片名>-总览.jpg（每 2.5 秒一格），<成片名>-检查.txt；屏幕上一张问题表。给了 --数据，每条会写在第几镜。
  空屏：画面上“有东西”的面积不到 2%（不算底部 12% 的字幕带），连着 1 秒以上。
  一帧闪：某一帧突然变了，下一帧又变回去（多半是某个元素少画、多画了一帧）。
  卡一帧：前后两帧都在动，这一帧没动（多半是那一帧没更新）。
东西突然出现、换镜、换字幕都是正常的突变，不报。
机器挑出来的只是“要看一眼”的地方：逐个截那一秒看，是真问题就改，不是就在交付时说明。
退出码：0 没有要看的；1 有。
"""
import json, math, os, re, statistics, subprocess, sys, tempfile

参 = sys.argv[1:]
def 取(名, conv, 默认):
    if 名 not in 参: return 默认
    i = 参.index(名); v = conv(参[i + 1]); del 参[i:i + 2]; return v
数据 = 取("--数据", str, None); 每 = 取("--每", float, 2.5); 底 = 取("--底", float, 0.12); 空 = 取("--空", float, 0.02); 秒 = 取("--秒", float, 1.0)
if len(参) != 1: print(__doc__); sys.exit(2)
片 = 参[0]; 前缀 = os.path.splitext(片)[0]
FF = os.environ.get("FFMPEG", "ffmpeg"); FP = os.environ.get("FFPROBE", "ffprobe")
fmt = lambda t: f"{int(t // 60)}:{t % 60:04.1f}"

pr = json.loads(subprocess.run([FP, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", 片],
                               capture_output=True, text=True, check=True).stdout)
W0, H0 = pr["streams"][0]["width"], pr["streams"][0]["height"]
n_, d_ = pr["streams"][0]["r_frame_rate"].split("/"); FPS = float(n_) / float(d_); 长 = float(pr["format"]["duration"])
镜们 = []
if 数据:
    t = open(数据, encoding="utf-8").read(); 镜们 = json.loads(t[t.index("{"):t.rindex("}") + 1])["镜"]
def 在镜(t):
    c = [s["n"] for s in 镜们 if s["a"] <= t + 1e-6]
    return f"，第 {c[-1]} 镜" if c else ""
行 = [f"{os.path.basename(片)}：{W0}×{H0}，{FPS:g} 帧/秒，{长:.2f} 秒"]
要看 = 0

# 1. 空屏：每秒 4 帧，缩到 96 宽灰度，看跟底色不一样的像素占多少
w = 96; h = int(round(w * H0 / W0 / 2)) * 2
raw = subprocess.run([FF, "-nostdin", "-v", "error", "-i", 片, "-vf", f"fps=4,scale={w}:{h},format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
帧长 = w * h; 留 = int(h * (1 - 底)) * w; 面积 = []
for i in range(len(raw) // 帧长):
    f = raw[i * 帧长:i * 帧长 + 留]
    hist = [0] * 256
    for b in f: hist[b] += 1
    m = max(range(256), key=hist.__getitem__)
    lo, hi = max(0, m - 16), min(255, m + 16)
    面积.append(1 - sum(hist[lo:hi + 1]) / len(f))
空段, 起 = [], None
for i, a in enumerate(面积 + [1]):
    if a < 空 and 起 is None: 起 = i
    if a >= 空 and 起 is not None:
        if (i - 起) / 4 >= 秒: 空段.append((起 / 4, i / 4, min(面积[起:i])))
        起 = None
行.append(f"\n空屏（有东西的面积 < {空:.0%}，连着 {秒:g} 秒以上）：{len(空段) or '没有'}")
for a, b, m in 空段: 行.append(f"  {fmt(a)}–{fmt(b)}（{b - a:.1f} 秒{在镜(a)}，最空时 {m:.1%}）")
要看 += len(空段)

# 2. 一帧闪、卡一帧：逐帧缩到 64 宽灰度，比相邻帧
w2 = 64; h2 = int(round(w2 * H0 / W0 / 2)) * 2; L2 = w2 * h2
raw2 = subprocess.run([FF, "-nostdin", "-v", "error", "-i", 片, "-vf", f"scale={w2}:{h2},format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
帧们 = [raw2[i * L2:(i + 1) * L2] for i in range(len(raw2) // L2)]
差 = lambda x, y: sum(abs(p - q) for p, q in zip(x, y)) / L2
d1 = [0.0] + [差(帧们[i - 1], 帧们[i]) for i in range(1, len(帧们))]
闪, 卡 = [], []
for i in range(1, len(帧们) - 1):
    if d1[i] > 5 and d1[i + 1] > 5 and 差(帧们[i - 1], 帧们[i + 1]) < 0.35 * min(d1[i], d1[i + 1]):
        闪.append((i / FPS, d1[i]))                        # 变了一帧又变回去
    if i >= 2 and d1[i] < 0.02 and d1[i - 1] > 0.3 and d1[i + 1] > 0.3 and 差(帧们[i - 2], 帧们[i + 1]) > 0.5 * max(d1[i - 1], d1[i + 1]):
        卡.append((i / FPS, d1[i - 1], d1[i + 1]))          # 前后都在动，这一帧没动（来回运动在端点对称掉头时，前后两帧也一样，不算）
行.append(f"\n一帧闪（某一帧突然变了、下一帧又回去）：{len(闪) or '没有'}")
for t, v in 闪[:30]: 行.append(f"  {fmt(t)}（第 {round(t * FPS)} 帧{在镜(t)}）变化 {v:.1f}")
行.append(f"\n卡一帧（前后都在动，这一帧没动）：{len(卡) or '没有'}")
for t, a, b in 卡[:30]: 行.append(f"  {fmt(t)}（第 {round(t * FPS)} 帧{在镜(t)}）")
要看 += len(闪) + len(卡)

# 3. 总览图
格数 = max(1, math.ceil(长 / 每)); 列 = 6 if H0 >= W0 else 4; 排 = math.ceil(格数 / 列); 总览 = 前缀 + "-总览.jpg"
基 = f"fps=1/{每}:round=down,scale=240:-2"
字 = ",drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6"
for vf in (基 + 字, 基):
    r = subprocess.run([FF, "-nostdin", "-v", "error", "-y", "-i", 片, "-vf", vf + f",tile={列}x{排}", "-frames:v", "1", "-q:v", "6", 总览], capture_output=True)
    if r.returncode == 0: break
行.append(f"\n总览图：{总览}（{格数} 格，每格隔 {每:g} 秒，从左到右、从上到下）" + ("" if vf != 基 else "；这台 ffmpeg 不能写字，格子上没有秒数"))
行.append(f"\n要看一眼的：{要看} 处" + ("" if 要看 else "，没有"))
print("\n".join(行))
with open(前缀 + "-检查.txt", "w", encoding="utf-8") as f: f.write("\n".join(行) + "\n")
sys.exit(1 if 要看 else 0)
