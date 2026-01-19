# 企业微信知识库机器人

基于企业微信 + DeepSeek AI + RAG 的智能知识库问答机器人

## 🎯 功能特性

- 🤖 **企业微信集成**：支持群聊@机器人提问
- 🧠 **AI智能回答**：基于DeepSeek大模型生成回答
- 📚 **RAG架构**：支持大规模PDF知识库（200MB+）
- 🔍 **智能检索**：向量搜索找到最相关内容
- 🚀 **云端部署**：支持Vercel免费部署
- 🔒 **安全可靠**：支持消息加密验证

## 🏗️ 系统架构

### 基础版（适合小规模知识库）
```
用户提问 → 企业微信 → Vercel服务 → GitHub知识库 → DeepSeek AI → 智能回答
```

### RAG版（适合大规模PDF知识库）
```
用户提问 → 企业微信 → Vercel服务 → 向量检索 → 相关文档片段 → DeepSeek AI → 智能回答
                                      ↓
知识库处理 ← PDF解析 ← 文档分块 ← 向量化 ← 向量数据库
```

## ⚠️ 重要提醒：200MB PDF知识库的处理方案

**您的知识库有200MB的PDF文件，之前的简单方案无法直接使用！**

### 🔧 推荐解决方案

对于大规模PDF知识库，需要使用 **RAG (Retrieval-Augmented Generation) 架构**：

1. **PDF文本提取**：将PDF转换为可搜索的文本
2. **文档分块**：将长文档分割成小块
3. **向量化**：转换为向量表示
4. **智能检索**：提问时快速找到相关内容
5. **AI生成**：基于检索结果生成回答

### 💡 为什么需要RAG？

- **性能问题**：无法每次都下载200MB内容
- **API限制**：DeepSeek API无法处理如此大量的内容
- **效率问题**：需要快速找到相关信息，而不是每次都搜索全部内容

## 📋 前置准备

### 1. 企业微信机器人配置
1. 登录企业微信管理后台
2. 创建应用/机器人
3. 获取以下信息：
   - **Token**: 用于验证消息签名
   - **Encoding AES Key**: 用于消息加密（可选）
   - **回调URL**: Vercel部署后的URL

### 2. GitHub知识库准备
1. 创建一个公开仓库用于存储知识库
2. 在仓库中创建 `knowledge/` 目录
3. 将知识文档（.md或.txt格式）放入该目录

### 3. API密钥准备
- **DeepSeek API Key**: 从[DeepSeek平台](https://platform.deepseek.com)获取
- **GitHub Personal Access Token**: 用于访问私有仓库（可选）

## 🎯 方案C：管理页面手动触发（已实现）

### 工作流程
1. **上传PDF到GitHub**：在GitHub仓库的`pdfs/`目录上传PDF文件
2. **打开管理页面**：访问 `https://your-project.vercel.app/admin`
3. **点击更新按钮**：点击"更新知识库"按钮
4. **自动处理**：系统自动检测新增/更新/删除的文件并处理
5. **完成**：处理完成后，机器人可以使用新内容

### 管理页面功能
- 📁 查看当前知识库文件列表
- 🔄 一键更新知识库（增量处理）
- 📊 查看处理状态和日志
- 🔍 自动检测文件变化

### 增量处理说明
- ✅ **新增文件**：自动处理新上传的PDF
- ✅ **更新文件**：检测到文件SHA变化时重新处理
- ✅ **删除文件**：自动清理已删除的文件
- ⚡ **高效**：只处理变化的文件，节省时间

## 🚀 部署步骤

### 1. 克隆项目
```bash
git clone <repository-url>
cd wechat-knowledge-bot
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
复制环境变量模板：
```bash
cp env-example.txt .env
```

编辑 `.env` 文件，填入你的配置：

```env
# 企业微信配置
WECHAT_TOKEN=your_wechat_token_here
WECHAT_ENCODING_AES_KEY=your_encoding_aes_key_here

# DeepSeek API配置
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# GitHub配置
GITHUB_REPO=your_username/your_knowledge_repo
GITHUB_TOKEN=your_github_personal_access_token

# 知识库配置（重要：200MB PDF需要设置为rag模式）
KNOWLEDGE_BASE_TYPE=rag  # simple 或 rag
PDF_PROCESSING_ENABLED=true

# 向量数据库配置（可选，用于大规模PDF知识库）
VECTOR_DB_TYPE=chroma  # chroma, pinecone, faiss
VECTOR_DB_URL=http://localhost:8000  # 如果使用远程向量数据库
OPENAI_API_KEY=your_openai_api_key  # 用于向量化（可选）

# 服务器配置
PORT=3000
```

### 4. Vercel部署
1. 安装Vercel CLI：
```bash
npm i -g vercel
```

2. 登录Vercel：
```bash
vercel login
```

3. 部署项目：
```bash
vercel --prod
```

4. 配置环境变量（在Vercel控制台中设置）：
   - `WECHAT_TOKEN`
   - `WECHAT_ENCODING_AES_KEY`
   - `DEEPSEEK_API_KEY`
   - `GITHUB_REPO`
   - `GITHUB_TOKEN`

5. 获取部署URL（类似：`https://your-project.vercel.app`）

### 5. 处理PDF知识库（重要！）
如果您使用PDF知识库，需要先处理PDF文件：

```bash
# 1. 安装PDF处理依赖
npm install pdf-parse

# 2. 创建目录结构
mkdir -p pdfs processed

# 3. 将PDF文件放入pdfs目录
cp your-knowledge-files/*.pdf ./pdfs/

# 4. 处理PDF文件
node pdf-processor.js process ./pdfs ./processed

# 5. 上传处理后的文件到GitHub
# 将processed目录的内容上传到GitHub仓库的processed/目录
```

### 6. 企业微信回调配置
1. 返回企业微信管理后台
2. 配置机器人回调URL：`https://your-project.vercel.app/`
3. 填入Token和Encoding AES Key

### 7. 添加机器人到群聊
1. 在企业微信中创建或选择群聊
2. 添加应用/机器人到群聊
3. 设置机器人权限

## 📚 知识库管理

### 小规模知识库（文本格式）
```
your-knowledge-repo/
├── knowledge/
│   ├── 产品介绍.md
│   ├── 使用指南.txt
│   ├── FAQ.md
│   └── ...
└── README.md
```

### 大规模PDF知识库（推荐）
```
your-knowledge-repo/
├── pdfs/           # 原始PDF文件
│   ├── 文档1.pdf
│   ├── 文档2.pdf
│   └── ...
├── processed/      # 处理后的文本（自动生成）
│   ├── 文档1.md
│   ├── 文档2.md
│   └── ...
└── vectors/        # 向量数据（可选）
```

### 支持格式
- **小规模**：Markdown（.md）、纯文本（.txt）
- **大规模**：PDF文件（推荐使用RAG架构）

### 知识库处理流程
1. **PDF处理**：自动提取PDF文本内容
2. **文档分块**：将长文档分割成小块
3. **向量化**：转换为向量表示
4. **存储**：保存到向量数据库
5. **检索**：提问时快速找到相关内容

### 更新知识库
1. 上传新PDF到GitHub仓库的`pdfs/`目录
2. 系统自动处理并更新向量索引
3. 无需重新部署服务

## 💬 使用方法

### 在群聊中提问
```
@机器人 什么是XXX？
@机器人 如何使用YYY功能？
```

### 机器人回复
机器人会基于知识库内容智能回答问题，如果知识库中没有相关信息，会明确告知。

## 🔧 开发调试

### 本地开发
```bash
npm run dev
```

### 查看日志
在Vercel控制台查看部署日志，或者使用：
```bash
vercel logs
```

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个项目！

## 📄 许可证

MIT License
