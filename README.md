# ModelScope Studio Deploy Skill

这是一个用于将项目部署到 [ModelScope Studio (魔搭创空间)](https://modelscope.cn/studios) 的 [Claude Code](https://claude.ai/code) Skill。

## 功能特性

- 帮助生成 `ms_deploy.json` 配置文件
- 支持 Static、Gradio、Streamlit、Docker 等多种部署类型
- 提供部署问题排查指南
- 支持 Git push 和文件上传两种部署方式
- 支持 Playwright 自动填表、自动提交、部署日志监控与已知错误自动修复
- 支持接入 Google 官方 Chrome DevTools MCP 执行浏览器自动化

## 安装方法

### 1. 找到你的 Claude Code Skills 目录

| 操作系统 | Skills 目录位置 |
|---------|---------------|
| **Windows** | `C:\Users\<你的用户名>\.claude\skills` |
| **macOS / Linux** | `~/.claude/skills` |

### 2. 安装 Skill

```bash
# 克隆此仓库到你的 Skills 目录
git clone https://github.com/sealofyou/modelscope-deploy.git ~/.claude/skills/modelscope-deploy

# 或者手动下载后，将 modelscope-deploy 文件夹复制到 Skills 目录
```

### 3. 重启 Claude Code

重启 Claude Code 后，输入 `/modelscope` 即可使用此 Skill。

## 使用方法

### 基本用法

在 Claude Code 中：

```
/modelscope 帮我部署这个项目到魔搭创空间
```

### 支持的部署类型

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| `static` | 静态网站 | HTML/CSS/JS 项目 |
| `gradio` | Gradio 应用 | Python ML/AI 应用 |
| `streamlit` | Streamlit 应用 | Python 数据应用 |
| `docker` | Docker 容器 | 复杂应用部署 |

### 示例

```
# 部署静态网站
/modelscope 这是一个 React 静态网站，帮我配置部署

# 部署 Gradio 应用
/modelscope 这是一个 Gradio 图像分类应用，需要配置 GPU

# 切换到 Git push 部署
/modelscope 从文件上传切换到 Git push 部署方式
```

## 重要提示

### 环境变量配置

当 `sdk_type` 为 `docker` 时，`ms_deploy.json` 中的 `environment_variables` 字段**不会生效**。

只有以下类型支持在 JSON 中配置环境变量：
- `gradio`
- `streamlit`
- `static`

**解决方案**：

1. **方案一（推荐）**: 部署后在魔搭界面上手动设置环境变量
2. **方案二**: 在 Dockerfile 中使用 `ENV` 指令（注意密钥安全）

## 部署问题排查

如果遇到 Git 历史冲突（本地与远程分叉），可以使用以下方法：

```bash
# 正确做法：reset + copy + push
git checkout master
git reset --hard origin/master
git checkout dev -- .    # 或从其他分支复制文件
git add -A
git commit -m "描述"
git push origin master    # fast-forward，不需要 force
```

更多问题排查方法请参考 [references/git-troubleshooting.md](./references/git-troubleshooting.md)。

## Playwright 自动提交（可选）

仓库已提供自动提交流程脚本：

- 脚本：`scripts/modelscope-auto-submit.mjs`
- 登录助手：`scripts/open-modelscope-login.mjs`
- 说明：`references/playwright-auto-submit.md`

这个脚本支持自动填写 ModelScope 创建空间表单、上传目录，并可选点击最终提交按钮（`--auto-submit`）。

新增能力：
- `--monitor-deploy`：提交后自动抓取部署日志
- `--auto-fix`：命中已知问题后自动修复本地文件（例如 Docker entrypoint、corepack registry）
- `--browser-channel`：默认 `chrome`，优先复用本机浏览器，避免下载 Playwright Chromium 卡住
- `--run-timeout-ms` / `--prompt-timeout-ms`：限制脚本总时长与交互等待时长，避免无上限阻塞

示例：

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

## Google Chrome DevTools MCP（可选）

如果你希望使用 Google 官方 MCP 作为浏览器自动化通道，请参考：

- [references/chrome-devtools-mcp-auto-submit.md](./references/chrome-devtools-mcp-auto-submit.md)

## 许可证

MIT License

---

**Made with ❤️ for Claude Code users**
