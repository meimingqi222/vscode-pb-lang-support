# GitHub Actions 工作流

本仓库配置了自动化CI/CD流程，用于构建和发布VSCode插件。

## 工作流说明

### 1. Build VSCode Extension (`.github/workflows/build-extension.yml`)
**触发条件**：
- 推送到 `main` 或 `master` 分支
- 创建/更新 Pull Request
- 创建版本标签 (`v*`)

**执行任务**：
- 在Node.js 20.x环境下构建
- 安装依赖
- 编译TypeScript
- 构建插件
- 打包插件 (.vsix文件)
- 上传构建产物

### 2. Publish to VSCode Marketplace (`.github/workflows/publish-extension.yml`)
**触发条件**：
- 手动触发 (workflow_dispatch)

**功能**：
- 更新版本号
- 转换图标为PNG格式
- 构建和打包插件
- 发布到VSCode插件市场
- 创建Git标签

### 3. PR Check (`.github/workflows/pr-check.yml`)
**触发条件**：
- 创建/更新 Pull Request

**检查项目**：
- TypeScript类型检查
- 代码质量检查
- 构建测试
- 自动评论PR状态

## 使用指南

### 自动构建
插件会在每次push时自动构建，构建产物会保存30天。

### 发布新版本
1. 访问仓库的Actions页面
2. 选择 "Publish to VSCode Marketplace" 工作流
3. 点击 "Run workflow"
4. 输入版本号 (如: 0.0.2)
5. 选择是否为预发布版本
6. 点击 "Run workflow"

### 必要的Secrets
在仓库设置中配置以下secrets：

- `VSCE_PAT`: VSCode Marketplace Personal Access Token
  - 获取方式: https://dev.azure.com/

## 发布流程
1. 代码合并到main分支后自动构建
2. 手动触发发布工作流
3. 插件自动发布到VSCode市场
4. 自动创建Git标签和Release

## 注意事项
- 确保package.json中的版本信息正确
- 发布前在本地测试功能
- 预发布版本可以先用pre-release模式测试