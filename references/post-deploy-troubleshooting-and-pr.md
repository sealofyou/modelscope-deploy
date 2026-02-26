# 部署后问题复盘与 PR 更新流程

本文件用于部署完成后的排查与协作，不影响主部署流程。需要时再阅读。

## 一、空白页问题复盘（Next.js + Vite + /app 子路径）

常见现象：
* 构建和启动正常，访问 `/app/` 页面空白
* 控制台无明显报错或仅看到静态资源 404

根因与处理：
* React Router 未设置 `basename`，导致 `/app/*` 下无法匹配路由
  * 处理：在 `BrowserRouter` 加 `basename`
  * 示例：`const base = new URL(import.meta.env.BASE_URL, window.location.href).pathname.replace(/\/$/, '') || '/'`
* Vite `base` 使用绝对路径 `/app/`，在 ModelScope 带前缀的反向代理下容易 404
  * 处理：将 `base` 改为 `./`，生成相对资源路径
* 若仍白屏，检查 Network 面板资源是否 404，并确认实际访问路径是否含空间前缀

## 二、容器启动报错：`docker-entrypoint.sh: not found`

常见现象：
* 日志显示 `/bin/sh: docker-entrypoint.sh: not found`

根因与处理：
* 平台可能以 `/bin/sh -c "docker-entrypoint.sh ..."` 方式启动，未走 `ENTRYPOINT`
  * 处理：避免依赖相对路径，改为绝对路径或直接移除 entrypoint
* Windows CRLF 导致脚本在 Linux 容器中不可执行
  * 处理：构建时使用 `sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh`

## 三、在 ModelScope 通过 PR 更新内容（Git 流程）

前置：在网页创建 PR（会生成分支名 `pr/<your username>/<pull request branch id>`）

### 1) 获取 PR 分支名
* 在 PR 创建页面或列表中获取分支名（包含用户名和分支 id）

### 2) 本地更新并推送到 PR 分支
```bash
git clone https://www.modelscope.cn/<namespace>/<repo>.git
cd <repo>
git fetch
git checkout pr/<your username>/<pull request branch id>

# 更新文件后
git add .
git commit -m "your message"
git push origin pr/<your username>/<pull request branch id>
```

### 3) 如遇 `GL_HOOK_ERR` 或拒绝 push
* 通常是未使用访问令牌或权限不足
* 处理方式：
  * 使用访问令牌设置远程地址再 push：
    `git remote set-url origin https://oauth2:<token>@modelscope.cn/<namespace>/<repo>.git`
  * 或改用网页上传文件覆盖/新增并提交 PR

### 4) 查看历史 PR
* 登录 ModelScope →【首页->我创建的->我的帖子->Pull Request】
