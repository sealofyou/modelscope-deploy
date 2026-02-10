# ModelScope Studio Git 推送故障排查

## 常见问题：Git 历史冲突导致无法推送

### 症状

```
remote: GitLab: You are not allowed to force push code to a protected branch
```

### 原因

- 用户通过 UI 文件上传创建了 Studio
- 这创建了一个与本地开发历史无关的 git 仓库
- 本地 master 和远程 master 有不同的历史（分叉）
- `force push` 被禁止，但普通 push 可以

### 正确解决方法：reset + copy + push

```bash
# 1. 切换到 master
git checkout master

# 2. 重置为远程 master 的状态
git reset --hard origin/master

# 3. 复制开发分支的所有文件
git checkout dev -- .    # 或从其他分支复制文件

# 4. 提交
git add -A
git commit -m "描述更改"

# 5. 推送（这是 fast-forward 合并，不需要 force）
git push origin master
```

### 为什么不使用 PR/MR 方式

- ModelScope Studio 的 UI 可能没有 Merge Request 功能
- PR 分支即使推送成功，在 Studio 界面中也可能看不到
- 直接操作 master 更简单可靠

### 沟通原则

当遇到 Git 错误时：
1. **先解释错误的真正原因**，不要立即绕道
2. **优先选择简单路径** - reset + copy 比 PR/MR 更直接
3. **不要创建多个分支** - 直接在目标分支上操作

### 用户指令参考

| 用户指令 | 含义 |
|---------|------|
| "解释这个错误，不要绕道" | 先解释错误真正原因 |
| "直接改 master" | 直接在 master 分支上操作 |
| "不要创建新分支" | 避免创建 PR/MR 分支 |
