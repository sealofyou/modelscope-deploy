---
name: modelscope-deploy
description: Help users deploy projects to ModelScope Studio (魔搭创空间). Use when user mentions deploying to ModelScope, 魔搭创空间, or creating ms_deploy.json. Handles configuration for static sites, Gradio, Streamlit, and Docker deployments. Also handles switching from file upload to git push deployment, and troubleshooting git push issues.
---

# ModelScope Studio Deployment Helper

帮助用户配置项目并部署到魔搭创空间。

## 工作流程

### 步骤 1：检查项目结构

```bash
ls -la
ls index.html app.py Dockerfile README.md 2>/dev/null
```

**检测项目类型：**

| 检测到文件 | 推荐类型 | sdk_type |
|-----------|----------|----------|
| `index.html` | 静态网页 | `static` |
| `app.py` (包含 gradio) | Gradio | `gradio` |
| `app.py` (包含 streamlit) | Streamlit | `streamlit` |
| `Dockerfile` | Docker | `docker` |

### 步骤 2：创建/更新 ms_deploy.json

根据项目类型生成对应的配置。

#### Static 类型

```json
{
  "$schema": "https://modelscope.cn/api/v1/studios/deploy_schema.json",
  "sdk_type": "static",
  "resource_configuration": "platform/2v-cpu-16g-mem",
  "base_image": "ubuntu22.04-py311-torch2.3.1-modelscope1.31.0"
}
```

#### Gradio 类型

```json
{
  "$schema": "https://modelscope.cn/api/v1/studios/deploy_schema.json",
  "sdk_type": "gradio",
  "sdk_version": "5.49.1",
  "resource_configuration": "platform/2v-cpu-16g-mem",
  "base_image": "ubuntu22.04-py311-torch2.3.1-modelscope1.31.0"
}
```

#### Streamlit 类型

```json
{
  "$schema": "https://modelscope.cn/api/v1/studios/deploy_schema.json",
  "sdk_type": "streamlit",
  "resource_configuration": "platform/2v-cpu-16g-mem",
  "base_image": "ubuntu22.04-py311-torch2.3.1-modelscope1.31.0"
}
```

#### Docker 类型

```json
{
  "$schema": "https://modelscope.cn/api/v1/studios/deploy_schema.json",
  "sdk_type": "docker",
  "resource_configuration": "platform/2v-cpu-16g-mem",
  "port": 7860
}
```

### 步骤 3：检查必要文件

| sdk_type | 必需文件 |
|----------|----------|
| `static` | `index.html` |
| `gradio` | `app.py` |
| `streamlit` | `app.py` |
| `docker` | `Dockerfile` |

### 步骤 4：选择部署方式

#### 方式 A：文件上传（首次部署）

访问 https://modelscope.cn/studios/create?template=quick

填写：
- 英文名称：项目名转 kebab-case（如 `my-project`）
- 中文名称：根据应用功能生成
- 描述：简短描述应用功能
- 上传项目文件夹

#### 方式 B：Git 推送（持续部署）

**切换到 Git 推送方式：**

```bash
# 1. 配置远程仓库（在 Studio 设置中获取 Git 仓库地址）
git remote add origin https://www.modelscope.cn/studios/用户名/项目名.git

# 2. 如果遇到 Git 历史冲突，见 [Git 故障排查](references/git-troubleshooting.md)

# 3. 推送代码
git push origin master
```

**注意**：
- 如果 Studio 是通过 UI 上传创建的，本地 master 和远程 master 历史可能不兼容
- 遇到 "protected branch" 错误时，**不要**绕道创建 PR/MR 分支
- 使用 `reset + copy + push` 方法（见故障排查文档）

### Git 推送故障排查

当遇到以下问题时，**先读取 [故障排查文档](references/git-troubleshooting.md)**：

- `You are not allowed to force push code to a protected branch`
- 本地和远程历史冲突
- 用户说"拉取 master 分支去实现修改"但推送失败

**关键原则**：
- `protected branch` 错误 ≠ 不能 push，只是不能 force push
- 先解释错误真正原因，不要绕道
- 优先选择简单路径

### 环境变量配置

**重要**：当 `sdk_type` 为 `docker` 时，`ms_deploy.json` 中的 `environment_variables` 字段**不会生效**。

只有以下类型支持在 JSON 中配置环境变量：
- `gradio`
- `streamlit`
- `static`

Docker 类型需要在部署后通过 Studio UI 手动设置环境变量。

### 资源配置选项

- `platform/2v-cpu-16g-mem` - 免费，所有用户可用
- `xgpu/8v-cpu-32g-mem-16g` - GPU，需要申请
- `xgpu/8v-cpu-64g-mem-48g` - GPU，需要申请
