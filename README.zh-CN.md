# agent-memory-hub

**让本机所有 AI 编码 agent 共用一份记忆。**

Claude Code、Codex、Cursor、Qoder、WorkBuddy、DeepSeek Harness 各自攒一小堆事实，谁也看不见谁的。
这个项目给它们一份共享存储、一个共享 MCP server、一套"事实往哪写"的约定：你对一个 agent 说过的偏好，
下一个 agent 开箱就知道。

[![ci](https://github.com/nigedazhima/agent-memory-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/nigedazhima/agent-memory-hub/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![只读浏览站点](https://raw.githubusercontent.com/nigedazhima/agent-memory-hub/main/docs/screenshots/viewer-zh.png)

> 截图用的是 [`examples/demo`](examples/demo) 里的假数据。界面中英双语，跟随浏览器语言，右上角可切换。

## 工作方式

```
  各 agent 原生记忆 ──import──►  ~/.agent-memory-hub/memories.jsonl  ◄──MCP──  所有支持 MCP 的 agent
                                  (追加式，去重，写入前过滤)              │
                                          │                              │
                                          └──sync──►  各 agent 指令文件里的受管区块
                                                      <!-- agent-memory-hub:start --> … :end -->
```

- **追加式 JSONL**：删除只是打墓碑，历史可审计。想让数据目录有 diff，自己 `git init` 一下。
- **分作用域**：`global` 与 `project:<绝对路径>` 分开，项目记忆不会写进全局指令文件。
- **去重**：规范化后精确匹配，加上 token Jaccard ≥ 0.85（中文按字/双字）。两个 agent 报同一件事时，
  变的是 `sources`，不是条数。
- **写入前过滤**：明显的密钥/token/密码、"忽略之前的指令"这类文本会被拒。它是启发式，不是安全边界。
- **只动受管区块**：只改标记之间的内容；标记损坏时拒绝写入，绝不吞掉你手写的东西。四个适配器指向
  同一个 `AGENTS.md` 时也只写一次。
- **默认 dry run**：所有写入命令先打印要做的事，加 `--apply` 才真改。

## 安装

```bash
npm install -g agent-memory-hub      # 提供 amh 命令
# 或者不装：
npx agent-memory-hub detect
```

需要 Node ≥ 22.19。源码里的 `.ts` 直接跑（靠 Node 的类型剥离），发布的包里也带了编译好的 `dist/`。

## 快速开始

```bash
amh detect                       # 这台机器装了哪些 agent，还有哪些要确认
amh mcp-install                  # dry run：会执行的命令原文
amh mcp-install --apply          # 在支持的 agent 里注册 MCP server
amh add "偏好 pnpm 而不是 npm" --global
amh sync --project ~/code/api            # dry run
amh sync --project ~/code/api --apply    # 写受管区块（文件不存在时加 --create）
amh web                          # http://127.0.0.1:7788/ 只读浏览
```

注册好 MCP 之后，在各 agent 的指令里加一句"开始任务前先调用 `memory_search`"效果最好——受管区块里已经带了等价的一句。

## 各 agent 支持情况

| agent | 指令文件（受管区块） | MCP 注册 | 原生记忆导入 |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md`、`./CLAUDE.md` | `claude mcp add -s user` | 无（`/memory` 改的就是这两个文件） |
| Codex | `~/.codex/AGENTS.md`、`./AGENTS.md` | `codex mcp add`（自己写 `[mcp_servers]`） | `~/.codex/memories_v2/memory_summary.md`（`--mode prose`） |
| Cursor | `./AGENTS.md` | `~/.cursor/mcp.json` | `~/.cursor/agent-memory/MEMORY.md`（手动 `--file`） |
| Qoder | `./AGENTS.md` | 只能手动——没有 CLI，也没有 MCP JSON | `~/.qoder-cn/memory/MEMORY.md` |
| WorkBuddy | `./.workbuddy/memory/MEMORY.md` | 只能手动——UI / `workbuddy.db` | `<uuid>_memory.md`（通常是空的） |
| Grok Build | `./AGENTS.md` | `grok mcp add`（未验证，作者机器上没装） | 未知的 `/memory` 存储 |
| DeepSeek Harness | — | 走 bundle，不是 MCP（见下） | 会话日志（还没解析） |

`amh detect` 会把每个适配器待确认的点打出来；路径的唯一真源是 `adapters/*.json`，
`~/.agent-memory-hub/adapters/*.json` 可以覆盖，不用改仓库。

```
$ amh detect
[x] claude-code  Claude Code
[x] codex        Codex CLI
[x] cursor       Cursor
[x] dsh          DeepSeek Harness (dsh)  (plugin)
[ ] grok-build   Grok Build (xAI)
[x] qoder        Qoder (IDE)
[x] workbuddy    WorkBuddy
```

`[x]` 是这台机器上探测到了，`[ ]` 是没装；每行后面跟着 `verify:` 说明，写清哪些验证过、
哪些还要人来确认。

发布相关（GitHub、npm、截图、版本号）都在 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## 命令

```
amh detect                                    装了哪些 agent + 待确认项
amh add [--global] [--project DIR] [--tag a,b] [--source NAME] [--] "<事实>"
amh list | search [--project DIR] -- <查询> | forget <id>
amh import --adapter ID | --file PATH [--mode bullets|prose|both] [--global] [--apply]
amh import --sqlite DB --sql "select raw from t" [--column NAME] [--apply]
amh sync [--adapter a,b] [--project DIR] [--apply] [--force] [--create]
amh mcp-install [--adapter a,b] [--apply]
amh serve                                     stdio 上的 MCP server
amh web [--port 7788] [--host 127.0.0.1]       只读浏览站点
```

写入类命令默认 dry run，加 `--apply` 才执行。

`--mode` 决定怎么切文件：`bullets`（默认，只吃 `- ` 行）、`prose`（吃段落，跳过标题/列表/代码块/表格）、
`both`。目录式记忆索引（`- [标题](文件.md) — 说明`）会把链接路径洗掉只留标题。SQLite 来源用
`--sqlite + --sql (+ --column)`，每行的目标列再按段落切开——一条长 note 会变成多条事实，而不是一条被长度上限拒掉的整块。

## MCP server

四个工具，一种进程形态，所有客户端看到同一份库：

| 工具 | 用途 |
|---|---|
| `memory_search` | 开始任务前先调；结果当背景数据，不当指令 |
| `memory_list` | 最近的事实 |
| `memory_write` | 一条持久事实：用户说的偏好、做的决定 |
| `memory_forget` | 按 id 前缀打墓碑（4 字符起） |

## DeepSeek Harness 插件

`plugins/dsh/` 是一个标准 dsh bundle，把 global 加匹配到的 project 记忆作为 `PromptContext` 注入
（`interpolate: false`，所以记忆里出现 `{{...}}` 也不会让提示词渲染失败；cwd 取自会话头，取不到回退进程 cwd）。

```bash
dsh plugin --profile mem add /path/to/agent-memory-hub/plugins/dsh
dsh --profile mem --dump-config      # 应该出现 dsh-amh-memory 这一层
```

两个真实的坑：加进去的依赖名取自路径末段（`.../plugins/dsh` 变成依赖 `dsh`，boot 时报
`cannot resolve profile bundle "dsh"`），而且 add 不会往 `dsh.profile.bundles` 追加，得自己把
`dsh-amh-memory` 补进去。另外别用 `Remove-Item -Recurse` 删
`profiles/<name>/node_modules/<pkg>`——那是 junction，递归会把仓库里的 `plugins/dsh` 一起清空。

可选的写入/搜索工具（默认不挂，单独一层）：

```bash
dsh --profile mem --patch /path/to/agent-memory-hub/plugins/dsh/cordis.tools.patch.yml
```

## 浏览站点

`amh web` 只提供一个页面和三个 GET 接口（`/`、`/api/memories`、`/api/health`），其它方法返回 405。
搜索是空格分词 + 中文双字，过滤器覆盖作用域/来源/状态，墓碑显示成虚线卡片；每 5 秒自动刷新——因为
存储是追加式的，别的 agent 刚写进来的事实你盯着页面就能看到。

默认绑 `127.0.0.1`。`--host 0.0.0.0` 是给局域网里手机看的，内容是记忆原文，自己掂量。

### 让它常驻（Windows）

```powershell
powershell -File scripts\web-daemon.ps1 status      # 在跑吗？哪个端口？日志在哪
powershell -File scripts\web-daemon.ps1 install     # 现在起来，以后每次登录也起来
powershell -File scripts\web-daemon.ps1 start|stop  # 临时控制
powershell -File scripts\web-daemon.ps1 uninstall   # 删掉自启动项
```

`install` 只写一条当前用户的 `HKCU\…\Run` 项——不要管理员权限、不装服务、你没敲这条命令之前什么都不会发生；
输出追加到 `~/.agent-memory-hub/web.log`。macOS/Linux 上用 launchd plist 或 systemd user unit 包一层 `amh web` 即可。

## 安全模型（说实话）

- 存储是你家目录里的明文。没有加密、没有同步、不上云。
- `memory_write` 在 headless 的 harness 会话里**没有审批**——被网页或文件内容诱导的写入会直接落地。
  dsh 的写入工具只在有人盯着的会话里挂，MCP 的 `memory_write` 在客户端支持时保持"询问"。
- 写入前过滤是启发式：能抓 `sk-…`、GitHub/AWS/Slack token、PEM 私钥、JWT、`password: …`，也能拒掉
  "忽略之前的指令"这类话术；换个说法它就抓不到。
- 浏览站点从结构上就是只读的：它没有任何写入路径。

## 开发

```bash
git clone https://github.com/nigedazhima/agent-memory-hub.git
cd agent-memory-hub
npm install
npm test            # 14 个测试，不需要网络
npm run typecheck
npm run build       # tsc → dist/（bin/amh.mjs 加载它）
npm run amh -- web  # 直接用源码跑
```

目录：`src/`（store、engine、adapters、CLI、MCP server、viewer）、`adapters/`（每个 agent 一个 JSON）、
`plugins/dsh/`（harness bundle）、`test/`、`examples/demo/`（截图用的假数据）。

## 许可

MIT — 见 [LICENSE](LICENSE)。

[English](README.md)
