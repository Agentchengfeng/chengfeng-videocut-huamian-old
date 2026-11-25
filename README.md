# 成峰出画面 chengfeng-videocut-huamian

> 照分镜稿，让 AI 用代码把讲解视频的画面一镜一镜画出来：念到哪个词，哪个东西才出来；一帧一帧截图出片，混进口播、带上字幕。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

用 AI 做讲解视频，难的是画面：要跟着口播走，念到哪露到哪，还要能一镜一镜改。

成峰出画面是一个给 Claude Code / Codex 等 Agent 用的 Skill。画面是一个网页，给它一个时刻，它就把那一帧摆出来。工具把配音里每个字的时间对到每一镜上，AI 照分镜稿写每一镜的画面；工具再开浏览器一帧一帧截下来，接成 mp4，混进口播。能只出一段、只出开头，改一镜只重出那一段。

## 需要什么

- Node.js 18 以上、`python3`、`ffmpeg`（macOS：`brew install node ffmpeg`）
- 一个 Chrome 系浏览器：Google Chrome、Edge、Chromium 都行
- 配好的口播和它的逐字时间：用 [成峰 Fish 配音](https://github.com/Agentchengfeng/chengfeng-videocut-fish) 配的，或自己录、用 [成峰剪口播](https://github.com/Agentchengfeng/chengfeng-videocut-koubo) 剪的都能直接用；还没配音也能按估的时间先出无声预览

## 安装

最简单的方式：把这句发给你的 AI，它会照着命令装好：

```text
帮我运行这条命令，安装成峰出画面 Skill：npx -y github:Agentchengfeng/chengfeng-videocut-huamian install
```

自己在终端装也行：

```sh
npx -y github:Agentchengfeng/chengfeng-videocut-huamian install
```

安装器会顺手装上 `playwright-core`（开浏览器截图用），放在 `~/.chengfeng-videocut-huamian/`。装好后重启 Agent，让它重新加载 Skill 列表。

## 怎么用

直接说：

```text
用出画面 skill，照这份分镜稿出画面：~/视频/分镜稿.md，配音在 ~/视频/口播稿-配音/
```

它会一步步做：

1. **建目录**：拷一份模板。模板里有一条能直接跑的示例片，先跑一遍确认环境。
2. **镜头表**：照分镜稿写每一镜念什么、画什么。
3. **对时**：把配音里每个字的时间对到每一镜上。
4. **写画面**：一镜一段代码，念到哪个词就出哪个东西。
5. **边做边看**：截几秒、拼一张总览图看。
6. **出片**：出一段或整片，混进口播，带字幕。
7. **检查**：查空屏、一帧闪、卡一帧，出一张总览图。

想先看画风，就说“先出开头 30 秒看看”：还没配音也行，按估的语速出无声预览。

## 出来什么

| 文件 | 是什么 |
|---|---|
| `成片.mp4` | 画面 + 口播 + 字幕的基础片（不带配乐、音效） |
| `成片-总览.jpg` | 每 2.5 秒一格的总览图 |
| `成片-检查.txt` | 空屏、一帧闪、卡一帧的检查结果 |
| `<片名>-画面/` | 画面工程：镜头表、每镜的画面代码、素材，改了能重出 |

## 画面规矩

做的时候照着 [画面规矩](skills/chengfeng-videocut-huamian/references/画面规矩.md) 来，都是作者审片时一条条改出来的。比如：

- 念到哪露到哪：没念到的不出现，念过的压暗。
- 3 秒看懂：不懂英文的观众刷到这 3 秒也要看得懂。
- 界面用真录屏、真截图；没有就先问你要，生成的只能占位。
- 主体占画面宽度一半以上，别退到远景露出大片空背景。

## 不做什么

- 不写分镜稿、不配音、不加配乐和音效。
- 不替你找素材：要用的截图、录屏放进画面目录的 `素材/`。
- 机器检查挑出来的只是“要看一眼”的地方；没人看过的，报告里照实说。

## 检查与卸载

```sh
npx -y github:Agentchengfeng/chengfeng-videocut-huamian doctor
npx -y github:Agentchengfeng/chengfeng-videocut-huamian uninstall
```

`doctor` 会查 Skill 装好没有，Node.js、python3、ffmpeg、playwright-core 和浏览器在不在。包里只有说明文件、模板和脚本，不含任何个人数据。

## 脚本也能单独用

```sh
S=~/.claude/skills/chengfeng-videocut-huamian/scripts
cp -R ~/.claude/skills/chengfeng-videocut-huamian/assets/模板 我的片-画面
python3 $S/对时.py 我的片-画面 口播稿-配音/时间线.json --口播 口播稿-配音/口播.wav
node $S/出片.cjs 我的片-画面 截 我的片-画面/看 每 2.5
node $S/出片.cjs 我的片-画面 0 end 成片.mp4 --口播 口播稿-配音/口播.wav
python3 $S/检查.py 成片.mp4 --数据 我的片-画面/data.js
```

## 仓库结构

```text
chengfeng-videocut-huamian/
├── SKILL.md
├── LICENSE / NOTICE.md / CITATION.cff
├── package.json
├── bin/install.js
└── skills/chengfeng-videocut-huamian/
    ├── SKILL.md
    ├── 更新日志.md
    ├── agents/openai.yaml
    ├── references/画面规矩.md
    ├── assets/模板/           # 页面、引擎、示例片
    └── scripts/               # 对时、出片、检查
```

## 来源

- 作者做讲解视频的出片做法，《迪士尼动画十二法则》等片子就是这么出的。
- 开浏览器截图用 [Playwright](https://github.com/microsoft/playwright)（Apache-2.0），接视频用 [FFmpeg](https://ffmpeg.org)。

## 官方来源

由 **成峰 / AI产品自由** 创建和维护。

- GitHub：[Agentchengfeng](https://github.com/Agentchengfeng) —— 安装问题和 bug 请提 Issue。
- X：[@chengfeng240928](https://x.com/chengfeng240928)
- 小红书 / 公众号 / B站 / 抖音 / 视频号：AI产品自由

## License

Apache-2.0。见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。使用、翻译、转载或改编时，请保留署名与 NOTICE。
