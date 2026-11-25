#!/usr/bin/env python3
"""第 3 步 对时：按配音里每个字的真时间，给每一镜定起止，写出 data.js（画面页面读它）。

用法：
  python3 对时.py <画面目录> <时间线> [--口播 口播.wav] [--force]
  python3 对时.py <画面目录> --估 [每分钟几个字，默认 310]
时间线认这几种：
  Fish 配音工具出的 时间线.json（sentences → words，单位秒）
  剪口播跑完核对那步的 剪后识别.json（result → utterances → words，单位毫秒），也可以直接给剪口播的工作目录
  还没配音：--估，按每分钟多少字估时间，先出无声预览（看画风、看开头）
读 <画面目录>/镜头.json，写 <画面目录>/data.js。--口播 给成品口播，最后一镜就到这条声音结束。

每一镜写什么：
  a   画面开始 = 这一镜第一个字出声前 0.08 秒，对齐到帧；镜和镜之间不留缝，停顿归前一镜
  b   画面结束 = 下一镜的 a；最后一镜 = 口播结束
  e   这一镜最后一个字念完
  句  每小句 [文字, 起, 止]，字幕按它换
  字  这一镜每个字（汉字、字母、数字各算一个，标点不算）出声的秒，at() 按它算
不到 1 秒的镜，画面提前进来（往前一镜借时间，前一镜至少留 1 秒），字的时间不动。
稿子和配音有对不上的字：打印出来、不写文件、退出码 1。确认要照写加 --force（对不上的字按前后插值），退出码仍是 1。
"""
import difflib, json, os, re, subprocess, sys

LEAD, MIN = 0.08, 1.0
K = re.compile(r"[^\W_]|%")
句切 = re.compile(r"(?<=[，。！？；：!?;])|(?<=[,.:])(?=\D|$)")
r3 = lambda x: round(x, 3)
fmt = lambda t: f"{int(t // 60)}:{t % 60:04.1f}"

参 = sys.argv[1:]
def 取(名):
    if 名 not in 参: return None
    i = 参.index(名); v = 参[i + 1] if i + 1 < len(参) and not 参[i + 1].startswith("--") else ""; del 参[i:i + (2 if v else 1)]; return v
def 有(名):
    if 名 in 参: 参.remove(名); return True
    return False
FORCE = 有("--force"); 口播 = 取("--口播"); 估 = 取("--估")
if not 参 or (估 is None and len(参) < 2):
    print(__doc__); sys.exit(2)
目录 = 参[0]
表路 = os.path.join(目录, "镜头.json")
if not os.path.exists(表路): sys.exit(f"{目录} 里没有 镜头.json：照分镜稿写，格式见 SKILL.md 第 2 步")
表 = json.load(open(表路, encoding="utf-8"))
镜们 = 表.get("镜") or sys.exit("镜头.json 里没有 “镜”")
FPS = 表.get("fps", 25)
for k, sh in enumerate(镜们):
    if "n" not in sh or not K.findall(sh.get("口播", "")): sys.exit(f"镜头.json 第 {k + 1} 条缺 n 或口播是空的（每一镜都要有要念的字）")
if len({sh["n"] for sh in 镜们}) != len(镜们): sys.exit("镜头.json 里有重复的镜号")


def 读声音(p):
    if os.path.isdir(p):
        q = os.path.join(p, "剪后识别.json")
        if not os.path.exists(q): sys.exit(f"{p} 里没有 剪后识别.json：剪口播要跑完核对那步才有（它把剪好的声音再识别一遍，带每个字的时间）")
        p = q
    d = json.load(open(p, encoding="utf-8")); V = []
    def 放(t, s, e):
        cs = K.findall(t or "")
        for i, c in enumerate(cs):
            dd = (e - s) / len(cs); V.append((c.lower(), s + i * dd, s + (i + 1) * dd))
    if "sentences" in d:
        for s in d["sentences"]:
            for w in s.get("words", []): 放(w["t"], w["s"], w["e"])
        来源 = "Fish 配音工具的时间线"
    elif "result" in d:
        for u in d["result"].get("utterances", []):
            for w in u.get("words", []): 放(w.get("text"), w["start_time"] / 1000, w["end_time"] / 1000)
        来源 = "剪口播的识别结果"
    else:
        sys.exit("认不出这个时间线：要 Fish 配音工具的 时间线.json，或剪口播的 剪后识别.json")
    if not V: sys.exit("时间线里没有字")
    return V, 来源, d


def 估声音(每分):
    V, t, 每字 = [], 0.3, 60.0 / 每分
    for sh in 镜们:
        for ch in sh["口播"]:
            if K.fullmatch(ch): V.append((ch.lower(), t, t + 每字)); t += 每字
            elif ch in "。！？!?": t += 0.3
            elif ch in "，；：、,;:": t += 0.12
    return V


if 估 is not None:
    每分 = float(估 or 310); V = 估声音(每分); 来源 = f"估的（每分钟 {每分:.0f} 字）"; 原 = {}
else:
    V, 来源, 原 = 读声音(参[1])

P = [(c.lower(), k) for k, sh in enumerate(镜们) for c in K.findall(sh["口播"])]
a_, b_ = [c for c, _ in P], [c for c, _, _ in V]
sm = difflib.SequenceMatcher(None, a_, b_, autojunk=False)
mp = [None] * len(P)
for blk in sm.get_matching_blocks():
    for i in range(blk.size): mp[blk.a + i] = blk.b + i
bad = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "equal": continue
    k = P[min(i1, len(P) - 1)][1]; at = V[min(j1, len(V) - 1)][1]
    bad.append(f"  镜 {镜们[k]['n']}：稿子「{''.join(a_[i1:i2])}」 声音「{''.join(b_[j1:j2])}」 约在 {at:.2f} 秒（前文“{''.join(a_[max(0, i1 - 8):i1])}”）")
print(f"{来源}：稿子 {len(P)} 字，声音 {len(V)} 字，对不上 {len(bad)} 处")
if bad:
    print("\n".join(bad[:60]) + (f"\n  …还有 {len(bad) - 60} 处" if len(bad) > 60 else ""))
    if not FORCE:
        print("没写文件。镜头.json 的口播要跟配音念的是同一版：改口播（照实际念的写），或者确认照写加 --force"); sys.exit(1)

T = [None] * len(P)                                   # 对不上的字按前后插值
for i, m in enumerate(mp):
    if m is not None: T[i] = (V[m][1], V[m][2])
i = 0
while i < len(T):
    if T[i] is None:
        j = i
        while j < len(T) and T[j] is None: j += 1
        lo = T[i - 1][1] if i else 0.0; hi = T[j][0] if j < len(T) else V[-1][2]
        for m in range(i, j): T[m] = (lo + (hi - lo) * (m - i) / (j - i), lo + (hi - lo) * (m - i + 1) / (j - i))
        i = j
    else: i += 1

idx = {}
for i, (_, k) in enumerate(P): idx.setdefault(k, []).append(i)
N = len(镜们)
st = {k: T[v[0]][0] for k, v in idx.items()}; en = {k: T[v[-1]][1] for k, v in idx.items()}
帧 = lambda x: round(round(x * FPS) / FPS, 3)
A = [0.0] + [帧(st[k] - LEAD) for k in range(1, N)]
for k in range(1, N): A[k] = max(A[k], A[k - 1] + 1 / FPS)
if 口播:
    长 = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", 口播], capture_output=True, text=True, check=True).stdout)
    END = max(长, en[N - 1])
elif 原.get("segments"):
    END = max(原["segments"][-1]["end"], en[N - 1]) + 0.2
else:
    END = en[N - 1] + (0.5 if 估 is not None else 0.3)
备注 = [""] * N
for k in range(1, N):                                 # 短镜提前进来
    nxt = A[k + 1] if k < N - 1 else END
    if nxt - A[k] < MIN:
        new = max(nxt - MIN, min(A[k - 1] + MIN, A[k]))
        if new < A[k] - 1e-6: 备注[k] = f"只有 {nxt - A[k]:.2f} 秒，提前 {A[k] - new:.2f} 秒进"; A[k] = 帧(new)
        if nxt - A[k] < MIN - 1e-6: 备注[k] += f"（借完还是只有 {nxt - A[k]:.2f} 秒）"

出 = []
for k, sh in enumerate(镜们):
    x = dict(sh)
    x["a"] = r3(A[k]); x["b"] = r3(A[k + 1] if k < N - 1 else END); x["e"] = r3(en[k]); x["时间"] = fmt(x["a"]) + "–" + fmt(x["b"])
    ks = iter(idx[k]); 句 = []
    for part in [p for p in 句切.split(sh["口播"]) if p.strip()]:
        n = len(K.findall(part))
        if not n: continue
        ii = [next(ks) for _ in range(n)]
        句.append([re.sub(r"[，。；：,.;:\s]+$", "", part.strip()), r3(T[ii[0]][0]), r3(T[ii[-1]][1])])
    x["句"] = 句; x["字"] = [r3(T[i][0]) for i in idx[k]]
    出.append(x)
头 = {k: v for k, v in 表.items() if k != "镜"}
头.update({"宽": 表.get("宽", 1080), "高": 表.get("高", 1440), "fps": FPS, "片长": r3(END), "时间来源": 来源})
s = json.dumps(头, ensure_ascii=False, indent=1)
s = s[:s.rindex("}")].rstrip() + ',\n "镜": [\n' + ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in 出) + "\n ]\n}"
with open(os.path.join(目录, "data.js"), "w", encoding="utf-8") as f:
    f.write("// 对时.py 生成的，别手改：改口播、换配音后重跑 对时.py\nwindow.DATA = " + s + ";\n")

print("镜 | 起–止（长） | 字念完 | 备注")
for x, nt in zip(出, 备注):
    print(f"{x['n']:>3} | {x['a']:7.2f}–{x['b']:7.2f}（{x['b'] - x['a']:.2f}）| {x['e']:7.2f} | {nt}")
短 = sorted((x["b"] - x["a"], x["n"]) for x in 出)
print(f"全片 {END:.2f} 秒，{len(P)} 字，{len(P) / END * 60:.0f} 字/分；最短的镜 {[(n, round(d, 2)) for d, n in 短[:3]]}")
print("写到 " + os.path.join(目录, "data.js"))
sys.exit(1 if bad else 0)
