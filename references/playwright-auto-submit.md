# Playwright 自动提交 ModelScope Studio

这个脚本用于自动填写 ModelScope Studio 创建空间表单，并上传项目目录。  
支持三段式流程：

- `dry run`：自动填表 + 上传，但不点击最终提交按钮（默认）
- `auto submit`：自动填表 + 上传 + 点击“确认创建并部署”（加 `--auto-submit`）
- `post submit monitor`：提交后自动抓取部署日志并分析错误（加 `--monitor-deploy`）

如需“发现报错后直接改本地文件”，再加 `--auto-fix`。

## 1. 前置条件

1. 本机已安装 Node.js（建议 18+）
2. 安装 Playwright：

```bash
npm install --save-dev playwright
```

3. 默认推荐复用本机 Chrome（避免 Playwright 浏览器下载卡住）：

```bash
node scripts/modelscope-auto-submit.mjs --help
# 使用默认 --browser-channel chrome
```

4. 只有在你明确使用 `--browser-channel chromium` 时，才需要安装 Playwright Chromium：

```bash
npx playwright install chromium
```

## 2. 基础用法（只填表+上传，不提交）

在仓库根目录执行：

```bash
node scripts/modelscope-auto-submit.mjs \
  --project-path ../mind-ai \
  --english-name mind-ai \
  --chinese-name "小当家" \
  --description "AI 小当家示例应用" \
  --visibility private
```

默认会弹出浏览器（headed）并在关键步骤停下来让你确认。

## 3. 自动提交 + 日志监控 + 自动修复

```bash
node scripts/modelscope-auto-submit.mjs \
  --project-path ../mind-ai \
  --english-name mind-ai \
  --chinese-name "小当家" \
  --description "AI 小当家示例应用" \
  --browser-channel chrome \
  --visibility private \
  --auto-submit \
  --monitor-deploy \
  --auto-fix
```

说明：

- `--auto-submit`：点击“确认创建并部署”
- `--monitor-deploy`：提交后抓取部署日志并在终端输出诊断
- `--auto-fix`：命中已知问题后，自动修改本地项目文件
- `--browser-channel`：浏览器通道，默认 `chrome`（可选 `chrome|msedge|chromium`）

当前内置自动修复：

- `docker-entrypoint.sh: not found`
  - 将相对 `ENTRYPOINT ["docker-entrypoint.sh"]` 改为绝对路径
  - 自动加入 CRLF 归一化与可执行权限命令
- `corepack/pnpm registry` 网络问题
  - 在 Dockerfile 注入 `npmmirror` 镜像源环境变量

## 4. 常用参数

- `--visibility <private|public>`：空间可见性，默认 `private`
- `--browser-channel <chrome|msedge|chromium>`：浏览器通道，默认 `chrome`
- `--timeout-ms <number>`：元素等待超时，默认 `180000`
- `--prompt-timeout-ms <number>`：人工确认等待超时，默认 `300000`
- `--run-timeout-ms <number>`：整次脚本最大执行时间，默认 `1200000`
- `--wait-after-upload-ms <number>`：上传后额外等待，默认 `3000`
- `--headed / --no-headed`：是否显示浏览器窗口，默认显示
- `--auto-submit`：是否点击最终提交按钮，默认不点击
- `--monitor-deploy`：提交后是否监控日志，默认不监控
- `--auto-fix`：发现已知错误后是否自动修复，默认不修复
- `--deploy-timeout-ms <number>`：部署监控最长等待，默认 `600000`
- `--log-poll-interval-ms <number>`：日志轮询间隔，默认 `5000`
- `--no-interactive`：不等待人工确认，适合半自动/CI 场景
- `--output-dir <dir>`：截图/日志输出目录，默认 `output/playwright`
- `--user-data-dir <dir>`：浏览器用户数据目录，默认 `output/playwright/modelscope-profile`
- `--create-url <url>`：创建空间页面地址

## 5. 输出结果

脚本会输出：

- 提交前截图：`modelscope-before-submit-*.png`
- 提交后截图：`modelscope-after-submit-*.png`（仅 `--auto-submit`）
- 部署日志：`modelscope-deploy-log-*.txt`（仅 `--monitor-deploy`）

如果触发自动修复，终端会打印被修改的文件路径与修复说明。修复后请重新运行脚本发起新一轮部署。
