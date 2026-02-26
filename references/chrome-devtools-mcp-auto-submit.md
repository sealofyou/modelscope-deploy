# Google Chrome DevTools MCP 自动提交（可选）

当你希望不用 Playwright 脚本，而是通过 Google 官方 MCP 控制浏览器时，可使用本方案。

## 1. 安装 MCP Server

推荐配置（来自官方 README）：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

Windows 下如果 MCP 启动慢，可增加 `startup_timeout_ms` 并设置 `PROGRAMFILES` 环境变量。

## 2. 自动化任务模板

让代理执行以下动作序列：

1. 打开 `https://modelscope.cn/studios/create?template=quick`
2. 检查是否已登录
3. 填写英文名、中文名、描述、可见性
4. 上传项目目录
5. 点击“确认创建并部署”
6. 进入部署日志页面后持续抓取日志
7. 若日志包含已知错误，输出修复方案并改本地文件

## 3. 推荐提示词

```text
使用 chrome-devtools MCP 自动创建 ModelScope Studio：
- 打开创建页并完成表单填写
- 上传目录：<project_path>
- 直接提交
- 提交后每 5 秒抓一次部署日志，持续 10 分钟
- 若出现 docker-entrypoint/corepack registry 类错误，直接修改本地 Dockerfile 并汇报改动
```

## 4. 何时选 MCP vs Playwright

- 优先 Playwright：仓库已内置脚本、可复用、参数稳定
- 选 MCP：你需要在对话里实时观察页面并逐步控制动作
