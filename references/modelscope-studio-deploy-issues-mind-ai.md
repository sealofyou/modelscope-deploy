# ModelScope Studio 部署问题整理（mind-ai 案例）

整理日期：2026-02-11  
项目：`mind-ai`（ModelScope Studio）

## 1) 访问地址 vs Git 地址混淆
症状：
- Studio 页面地址可访问，但 `git clone` 失败或不知道用哪个地址。

原因：
- Studio 页面 URL 不是 Git 远程地址，需要使用对应的 Git 端点。

处理：
- 使用 Git 端点：
  - `https://www.modelscope.cn/studios/<owner>/<repo>.git`
- 需要推送时使用访问令牌（OAuth token）写入远程地址：
  - `git remote set-url origin https://oauth2:<token>@www.modelscope.cn/studios/<owner>/<repo>.git`

## 2) 部署后页面无样式（只显示简陋输入框）
症状：
- 页面只有基础输入框，没有 Next.js 前端样式。

原因：
- Docker 启动了 `app.py`（Gradio）而非 Next.js 前端。

处理：
- 将 Dockerfile 改为 Node/Next 构建并启动 Next：
  - 多阶段构建 + `next build` + `next start`
  - 端口必须使用 `7860`

要点：
- Docker 运行入口必须是 Next，而不是 Gradio。

## 3) 构建卡在 Corepack 下载 pnpm
症状：
- 日志停在：`Corepack is about to download ... pnpm-<version>.tgz`

原因：
- 构建环境无法稳定访问 `registry.npmjs.org`。

处理：
- 在 Dockerfile 中强制使用镜像源：
  - `COREPACK_NPM_REGISTRY=https://registry.npmmirror.com`
  - `npm_config_registry=https://registry.npmmirror.com`
  - `corepack prepare pnpm@<version> --activate`

备注：
- `pnpm` 提示 `Ignored build scripts: sharp...` 为警告，不一定阻塞构建。

## 4) ModelScope PR 分支提交流程
症状：
- 需要将修复推到 Studio 的 PR 分支。

处理流程：
1. `git fetch`
2. `git checkout pr/<user>/<pr-branch-id>`
3. 修改并提交：
   - `git add .`
   - `git commit -m "..."`  
4. 推送：
   - `git push origin pr/<user>/<pr-branch-id>`

## 5) Docker 端口要求
说明：
- ModelScope Studio 的 Docker 部署要求对外端口固定为 `7860`。
- `EXPOSE 7860` + `next start -p 7860 -H 0.0.0.0`
