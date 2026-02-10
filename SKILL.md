---
name: modelscope-deploy
description: Help users deploy projects to ModelScope Studio (魔搭创空间). Use when user mentions deploying to ModelScope, 魔搭创空间, or creating ms_deploy.json. Handles configuration for static sites, Gradio, Streamlit, and Docker deployments.
---

# ModelScope Studio Deployment Helper

帮助用户配置项目并部署到魔搭创空间。

## 触发条件

当用户提到以下内容时触发：
- "部署到魔搭创空间"
- "上传到 ModelScope Studio"
- "创建 ms_deploy.json"
- "modelscope deploy"

## 工作流程

### 步骤 1：检查项目结构

首先检查当前工作目录中的项目：

```bash
# 检查项目目录
ls -la

# 查找主要文件
ls index.html app.py Dockerfile README.md 2>/dev/null
```

**检测项目类型：**

| 检测到文件 | 推荐类型 | sdk_type |
|-----------|----------|----------|
| `index.html` | 静态网页 | `static` |
| `app.py` (包含 gradio) | Gradio | `gradio` |
| `app.py` (包含 streamlit) | Streamlit | `streamlit` |
| `Dockerfile` | Docker | `docker` |

获取项目路径：`pwd` 或使用当前工作目录

### 步骤 2：创建/更新 ms_deploy.json

根据项目类型生成对应的配置。

#### Static 类型（静态网页）

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

**重要：Docker 类型必须使用 7860 作为外部端口，这是魔搭创空间的规定。**

**资源配置选项：**
- `platform/2v-cpu-16g-mem` - 免费，所有用户可用
- `xgpu/8v-cpu-32g-mem-16g` - GPU，需要申请
- `xgpu/8v-cpu-64g-mem-48g` - GPU，需要申请

### 步骤 3：检查并补充必要文件

#### 检查 README.md

```bash
ls README.md
```

如果不存在，询问用户是否需要创建。

#### 检查部署所需文件

| sdk_type | 必需文件 | 缺失时操作 |
|----------|----------|-----------|
| `static` | `index.html` | 提示用户 |
| `gradio` | `app.py` | 提示用户 |
| `streamlit` | `app.py` | 提示用户 |
| `docker` | `Dockerfile` | **询问用户是否需要创建模板** |

**Dockerfile 模板（询问用户同意后创建）：**

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 7860

CMD ["python", "app.py"]
```

### 步骤 4：输出部署指南

根据应用内容生成以下变量：

| 变量 | 说明 | 生成规则 |
|------|------|----------|
| `{english_name}` | 英文创空间名称 | 项目名转 kebab-case（如 `my-project`） |
| `{chinese_name}` | 中文创空间名称 | 根据应用功能生成 |
| `{description}` | 创空间描述 | 根据应用功能生成简短描述 |
| `{project_path}` | 本地项目路径 | `pwd` 获取完整路径 |

**输出模板（直接在 CLI 输出，不要写入文件）：**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 部署到魔搭创空间
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 访问部署页面：
   https://modelscope.cn/studios/create?template=quick

2️⃣ 填写基本信息：
   • 英文名称：{english_name}
   • 中文名称：{chinese_name}
   • 可见性：公开 / 私有
   • 描述：{description}

3️⃣ 上传项目文件：
   • 选择整个项目文件夹上传
   • 项目路径：{project_path}

4️⃣ 点击 "确认创建并部署"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 提示：部署完成后，如需使用 Git 维护项目，可运行：
   git init && git add . && git commit -m "Initial commit"
   然后在魔搭创空间的 Git 仓库页面获取远程地址并连接。
```

**重要：所有部署方式都使用同一个页面：https://modelscope.cn/studios/create?template=quick**

## 变量生成示例

| 项目 | english_name | chinese_name | description |
|------|--------------|--------------|-------------|
| bbox-viz | bbox-visualizer | 边界框可视化工具 | 纯前端边界框可视化工具，支持多种坐标格式 |
| chat-app | chat-assistant | 智能对话助手 | 基于 Qwen 的智能对话应用 |
| image-gen | image-generator | AI图像生成器 | 文本生成图像的 AI 工具 |

## 注意事项

1. **不自动上传** - 只配置文件，让用户手动上传
2. **用合理默认值** - 减少用户输入，使用免费资源配置
3. **智能检测** - 根据现有文件推断项目类型
4. **缺失文件提醒** - 特别注意 Dockerfile 需要询问确认
5. **Docker 端口** - Docker 类型必须使用 7860 端口
6. **CLI 输出** - 部署指南直接在 CLI 输出，不要写入文件
