# 部署后验证（日志 + 前端可用性）

部署完成后，建议固定做两步验证：

1. 拉取创空间日志最新 10 条，确认无致命错误
2. 做前端上传图片 + bbox 数据的冒烟验证

## 一键脚本

使用仓库脚本：

`scripts/modelscope-studio-healthcheck.mjs`

### 只看日志

```bash
node scripts/modelscope-studio-healthcheck.mjs \
  --studio-url "https://modelscope.cn/studios/<user>/<studio>"
```

### 日志 + 前端冒烟

```bash
node scripts/modelscope-studio-healthcheck.mjs \
  --studio-url "https://modelscope.cn/studios/<user>/<studio>" \
  --check-frontend \
  --browser-channel chrome \
  --latest-log-count 10 \
  --output-json output/healthcheck/result.json
```

## 参数说明

- `--studio-url`：必填，创空间详情页 URL
- `--latest-log-count`：日志条数，默认 `10`
- `--check-frontend`：启用前端冒烟
- `--bbox-json`：前端输入框测试 JSON（默认 `[{\"label\":\"cat\",\"bbox\":[0,0,1,1]}]`）
- `--browser-channel`：`chrome|msedge|chromium`，默认 `chrome`
- `--user-data-dir`：浏览器 profile 目录，默认 `output/playwright/modelscope-profile`
- `--timeout-ms`：页面操作超时，默认 `30000`
- `--headed`：显示浏览器窗口（默认 headless）
- `--output-json`：写入结果 JSON 文件

## 通过标准（前端）

- 图像文件可以上传
- bbox JSON 能被解析
- 图例出现目标类别（默认 `cat`）
- `mainCanvas` 可见
- 错误提示不出现
