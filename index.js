/**
 * 企业微信知识库机器人服务
 * 支持两种模式：简单文本知识库 + RAG架构（PDF处理）
 */

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 配置参数（从环境变量读取）
const WECHAT_TOKEN = process.env.WECHAT_TOKEN;
const WECHAT_ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GITHUB_REPO = process.env.GITHUB_REPO; // 格式: username/repo
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// RAG配置
const KNOWLEDGE_BASE_TYPE = process.env.KNOWLEDGE_BASE_TYPE || 'simple'; // simple 或 rag
const PDF_PROCESSING_ENABLED = process.env.PDF_PROCESSING_ENABLED === 'true';
const VECTOR_DB_TYPE = process.env.VECTOR_DB_TYPE || 'chroma';
const VECTOR_DB_URL = process.env.VECTOR_DB_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 中间件
app.use(express.text({ type: 'text/xml' }));
app.use(express.json());
app.use(express.static('public')); // 静态文件服务（用于管理页面）

/**
 * 验证微信服务器签名
 */
function verifySignature(signature, timestamp, nonce, echostr) {
  const token = WECHAT_TOKEN;
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const sha1 = crypto.createHash('sha1');
  sha1.update(str);
  const signatureCalculated = sha1.digest('hex');

  return signatureCalculated === signature;
}

/**
 * 微信消息解密（如果使用了加密）
 */
function decryptMessage(encrypt, aesKey) {
  // 简化版，实际需要实现AES解密
  return encrypt;
}

/**
 * 从GitHub获取知识库内容（简单模式）
 */
async function getKnowledgeBaseSimple() {
  try {
    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/knowledge`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const files = response.data.filter(file => file.name.endsWith('.md') || file.name.endsWith('.txt'));

    let knowledge = '';
    for (const file of files) {
      const contentResponse = await axios.get(file.download_url);
      knowledge += `\n--- ${file.name} ---\n${contentResponse.data}\n`;
    }

    return knowledge;
  } catch (error) {
    console.error('获取知识库失败:', error.message);
    return '知识库暂时不可用，请稍后重试。';
  }
}

/**
 * 从GitHub获取PDF知识库内容（RAG模式）
 */
async function getKnowledgeBaseRAG() {
  try {
    // 获取processed目录中的处理后文本
    const processedResponse = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/processed`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const files = processedResponse.data.filter(file => file.name.endsWith('.md'));

    let knowledge = '';
    for (const file of files) {
      try {
        const contentResponse = await axios.get(file.download_url);
        knowledge += `\n--- ${file.name} ---\n${contentResponse.data}\n`;
      } catch (e) {
        console.warn(`跳过文件 ${file.name}:`, e.message);
      }
    }

    return knowledge || '知识库正在处理中，请稍后重试。';
  } catch (error) {
    console.error('获取RAG知识库失败:', error.message);
    // 回退到简单模式
    console.log('回退到简单知识库模式...');
    return await getKnowledgeBaseSimple();
  }
}

/**
 * 统一的知识库获取函数
 */
async function getKnowledgeBase() {
  if (KNOWLEDGE_BASE_TYPE === 'rag') {
    return await getKnowledgeBaseRAG();
  } else {
    return await getKnowledgeBaseSimple();
  }
}

/**
 * 向量检索（简化版）
 * 注意：在Vercel环境中，建议使用Pinecone等云向量数据库
 */
async function vectorSearch(question, knowledge) {
  // 这里是简化的关键词匹配
  // 实际应该使用向量相似度搜索
  const keywords = question.split(' ').filter(word => word.length > 1);
  const chunks = knowledge.split('\n--- ').filter(chunk => chunk.trim());

  const relevantChunks = chunks.filter(chunk => {
    return keywords.some(keyword =>
      chunk.toLowerCase().includes(keyword.toLowerCase())
    );
  });

  // 限制内容长度，避免超出API限制
  const maxLength = 8000; // 留出空间给问题和回答
  let selectedContent = relevantChunks.slice(0, 3).join('\n\n');

  if (selectedContent.length > maxLength) {
    selectedContent = selectedContent.substring(0, maxLength) + '...';
  }

  return selectedContent || knowledge.substring(0, maxLength);
}

/**
 * 调用DeepSeek API生成回答
 */
async function generateAnswer(question, knowledge) {
  try {
    let context = knowledge;

    // RAG模式：先进行向量检索
    if (KNOWLEDGE_BASE_TYPE === 'rag') {
      console.log('使用RAG模式进行检索...');
      context = await vectorSearch(question, knowledge);
      console.log(`检索到 ${context.length} 字符的相关内容`);
    }

    const prompt = `基于以下知识库内容回答问题：

知识库内容：
${context}

用户问题：${question}

请基于知识库内容提供准确、简洁的回答。如果知识库中没有相关信息，请说明无法回答。`;

    // 检查token长度（DeepSeek API限制）
    const estimatedTokens = prompt.length / 4; // 粗略估算
    if (estimatedTokens > 32000) {
      console.warn(`提示长度过长: ${estimatedTokens} tokens，截断内容`);
      // 截断context
      const truncatedContext = context.substring(0, 10000) + '...';
      prompt = `基于以下知识库内容回答问题：

知识库内容：
${truncatedContext}

用户问题：${question}

请基于知识库内容提供准确、简洁的回答。如果知识库中没有相关信息，请说明无法回答。`;
    }

    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('调用DeepSeek API失败:', error.message);
    return '抱歉，我暂时无法回答您的问题，请稍后重试。';
  }
}

/**
 * 处理微信消息
 */
async function handleMessage(xmlData) {
  try {
    const result = await xml2js.parseStringPromise(xmlData);
    const message = result.xml;

    const msgType = message.MsgType[0];
    const fromUser = message.FromUserName[0];
    const toUser = message.ToUserName[0];

    if (msgType === 'text') {
      const content = message.Content[0];

      // 检查是否@机器人
      if (content.includes('@机器人') || content.includes('@bot')) {
        const question = content.replace(/@机器人|@bot/g, '').trim();

        if (question) {
          // 获取知识库
          const knowledge = await getKnowledgeBase();

          // 生成回答
          const answer = await generateAnswer(question, knowledge);

          // 返回回复消息
          return {
            ToUserName: fromUser,
            FromUserName: toUser,
            CreateTime: Math.floor(Date.now() / 1000),
            MsgType: 'text',
            Content: answer
          };
        }
      }
    }

    // 默认回复
    return {
      ToUserName: fromUser,
      FromUserName: toUser,
      CreateTime: Math.floor(Date.now() / 1000),
      MsgType: 'text',
      Content: '您好！我是知识库机器人，请@我并提出您的问题。'
    };
  } catch (error) {
    console.error('处理消息失败:', error);
    return null;
  }
}

/**
 * 将对象转换为XML
 */
function buildXml(obj) {
  const builder = new xml2js.Builder({
    rootName: 'xml',
    headless: true,
    renderOpts: {
      pretty: false
    }
  });

  return builder.buildObject(obj);
}

// 微信服务器验证接口
app.get('/', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;

  if (verifySignature(signature, timestamp, nonce, echostr)) {
    res.send(echostr);
  } else {
    res.status(403).send('Forbidden');
  }
});

// 微信消息处理接口
app.post('/', async (req, res) => {
  try {
    const xmlData = req.body;
    console.log('收到消息:', xmlData);

    const replyMessage = await handleMessage(xmlData);

    if (replyMessage) {
      const xmlResponse = buildXml(replyMessage);
      res.type('text/xml').send(xmlResponse);
    } else {
      res.send('');
    }
  } catch (error) {
    console.error('处理请求失败:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ==================== 管理页面功能 ====================

// 文件处理状态存储（实际部署时应该用数据库，这里用内存存储）
let fileStatus = {}; // { filename: { sha: 'xxx', processedAt: 'xxx', status: 'processed' } }
let processingStatus = {
  isProcessing: false,
  startTime: null,
  currentFile: null,
  totalFiles: 0,
  processedFiles: 0,
  logs: []
};

/**
 * 获取GitHub仓库中的PDF文件列表
 */
async function getGitHubPdfFiles() {
  try {
    const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/pdfs`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    return response.data.filter(file => 
      file.name.toLowerCase().endsWith('.pdf') && file.type === 'file'
    );
  } catch (error) {
    console.error('获取GitHub文件列表失败:', error.message);
    return [];
  }
}

/**
 * 检测需要处理的文件（增量检测）
 */
async function detectChangedFiles() {
  const githubFiles = await getGitHubPdfFiles();
  const changedFiles = {
    new: [],
    updated: [],
    deleted: []
  };

  // 检测新增和更新的文件
  for (const file of githubFiles) {
    const existing = fileStatus[file.name];
    if (!existing) {
      changedFiles.new.push(file);
    } else if (existing.sha !== file.sha) {
      changedFiles.updated.push(file);
    }
  }

  // 检测删除的文件
  const githubFileNames = new Set(githubFiles.map(f => f.name));
  for (const fileName in fileStatus) {
    if (!githubFileNames.has(fileName)) {
      changedFiles.deleted.push(fileName);
    }
  }

  return changedFiles;
}

/**
 * 处理单个PDF文件（从GitHub下载并处理）
 * 注意：Vercel环境限制，PDF文本提取需要额外配置
 */
async function processPdfFromGitHub(file) {
  try {
    processingStatus.currentFile = file.name;
    processingStatus.logs.push(`开始处理: ${file.name}`);

    // 检查processed目录是否已有处理后的文件
    // 如果有，直接使用；如果没有，需要先处理PDF
    try {
      const processedFile = await axios.get(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/processed/${file.name.replace('.pdf', '.md')}`,
        {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      // 如果已有处理后的文件，直接使用
      processingStatus.logs.push(`找到已处理的文件: ${file.name.replace('.pdf', '.md')}`);
      
      fileStatus[file.name] = {
        sha: file.sha,
        processedAt: new Date().toISOString(),
        status: 'processed',
        size: file.size,
        processedFile: file.name.replace('.pdf', '.md')
      };

      processingStatus.processedFiles++;
      processingStatus.logs.push(`完成处理: ${file.name}`);
      return { success: true, fileName: file.name, note: '使用已处理的文件' };
    } catch (e) {
      // 如果没有处理后的文件，记录需要处理
      processingStatus.logs.push(`⚠️ 未找到处理后的文件，需要先处理PDF: ${file.name}`);
      processingStatus.logs.push(`💡 提示：请在本地运行 pdf-processor.js 处理PDF，然后上传到GitHub的processed/目录`);
      
      // 仍然记录文件状态，标记为需要处理
      fileStatus[file.name] = {
        sha: file.sha,
        processedAt: new Date().toISOString(),
        status: 'needs_processing',
        size: file.size
      };

      processingStatus.processedFiles++;
      return { success: true, fileName: file.name, note: '需要先处理PDF' };
    }
  } catch (error) {
    processingStatus.logs.push(`处理失败 ${file.name}: ${error.message}`);
    return { success: false, fileName: file.name, error: error.message };
  }
}

/**
 * 后台处理任务（增量处理）
 */
async function processKnowledgeBase() {
  if (processingStatus.isProcessing) {
    return { error: '正在处理中，请稍候...' };
  }

  processingStatus.isProcessing = true;
  processingStatus.startTime = new Date().toISOString();
  processingStatus.processedFiles = 0;
  processingStatus.logs = [];

  try {
    // 检测变化的文件
    processingStatus.logs.push('正在检测文件变化...');
    const changedFiles = await detectChangedFiles();

    const totalFiles = changedFiles.new.length + changedFiles.updated.length;
    processingStatus.totalFiles = totalFiles;

    processingStatus.logs.push(`发现 ${changedFiles.new.length} 个新文件`);
    processingStatus.logs.push(`发现 ${changedFiles.updated.length} 个更新文件`);
    processingStatus.logs.push(`发现 ${changedFiles.deleted.length} 个删除文件`);

    // 处理新文件和更新文件
    const filesToProcess = [...changedFiles.new, ...changedFiles.updated];
    
    for (const file of filesToProcess) {
      await processPdfFromGitHub(file);
    }

    // 清理删除的文件
    for (const fileName of changedFiles.deleted) {
      delete fileStatus[fileName];
      processingStatus.logs.push(`已删除: ${fileName}`);
    }

    processingStatus.isProcessing = false;
    processingStatus.logs.push('处理完成！');

    return {
      success: true,
      processed: processingStatus.processedFiles,
      total: totalFiles,
      deleted: changedFiles.deleted.length,
      logs: processingStatus.logs
    };
  } catch (error) {
    processingStatus.isProcessing = false;
    processingStatus.logs.push(`处理出错: ${error.message}`);
    return {
      success: false,
      error: error.message,
      logs: processingStatus.logs
    };
  }
}

/**
 * 管理页面 - 首页
 */
app.get('/admin', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>知识库管理后台</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 30px;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 10px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            color: #666;
            font-size: 18px;
            margin-bottom: 15px;
        }
        .file-list {
            background: #f9f9f9;
            border-radius: 4px;
            padding: 15px;
            max-height: 300px;
            overflow-y: auto;
        }
        .file-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .file-item:last-child {
            border-bottom: none;
        }
        .file-name {
            font-weight: 500;
            color: #333;
        }
        .file-status {
            font-size: 12px;
            color: #666;
        }
        .btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin-right: 10px;
        }
        .btn:hover {
            background: #45a049;
        }
        .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 4px;
            background: #e3f2fd;
        }
        .status.processing {
            background: #fff3e0;
        }
        .status.success {
            background: #e8f5e9;
        }
        .status.error {
            background: #ffebee;
        }
        .logs {
            margin-top: 15px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
        }
        .log-item {
            padding: 2px 0;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📚 知识库管理后台</h1>
        
        <div class="section">
            <h2>📁 当前知识库文件</h2>
            <div class="file-list" id="fileList">
                <div style="text-align: center; padding: 20px; color: #999;">加载中...</div>
            </div>
        </div>

        <div class="section">
            <h2>🔄 操作</h2>
            <button class="btn" id="updateBtn" onclick="updateKnowledgeBase()">更新知识库</button>
            <button class="btn" onclick="refreshFileList()">刷新文件列表</button>
        </div>

        <div class="section">
            <div id="status" class="status" style="display: none;"></div>
            <div id="logs" class="logs" style="display: none;"></div>
        </div>
    </div>

    <script>
        async function refreshFileList() {
            try {
                const response = await fetch('/admin/files');
                const data = await response.json();
                
                const fileList = document.getElementById('fileList');
                if (data.files && data.files.length > 0) {
                    fileList.innerHTML = data.files.map(file => \`
                        <div class="file-item">
                            <span class="file-name">\${file.name}</span>
                            <span class="file-status">\${file.status || '未处理'}</span>
                        </div>
                    \`).join('');
                } else {
                    fileList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">暂无文件</div>';
                }
            } catch (error) {
                console.error('刷新失败:', error);
            }
        }

        async function updateKnowledgeBase() {
            const btn = document.getElementById('updateBtn');
            const status = document.getElementById('status');
            const logs = document.getElementById('logs');
            
            btn.disabled = true;
            status.style.display = 'block';
            status.className = 'status processing';
            status.innerHTML = '⏳ 正在处理中，请稍候...';
            logs.style.display = 'block';
            logs.innerHTML = '';

            try {
                const response = await fetch('/admin/process', { method: 'POST' });
                const data = await response.json();

                if (data.success) {
                    status.className = 'status success';
                    status.innerHTML = \`✅ 处理完成！共处理 \${data.processed || 0} 个文件，删除 \${data.deleted || 0} 个文件\`;
                } else {
                    status.className = 'status error';
                    status.innerHTML = \`❌ 处理失败: \${data.error || '未知错误'}\`;
                }

                if (data.logs) {
                    logs.innerHTML = data.logs.map(log => \`<div class="log-item">\${log}</div>\`).join('');
                }

                // 刷新文件列表
                await refreshFileList();
            } catch (error) {
                status.className = 'status error';
                status.innerHTML = \`❌ 请求失败: \${error.message}\`;
            } finally {
                btn.disabled = false;
            }
        }

        // 页面加载时刷新文件列表
        refreshFileList();
        
        // 每30秒自动刷新状态
        setInterval(async () => {
            const response = await fetch('/admin/status');
            const data = await response.json();
            if (data.isProcessing) {
                document.getElementById('updateBtn').disabled = true;
            }
        }, 30000);
    </script>
</body>
</html>
  `);
});

/**
 * 管理API - 获取文件列表
 */
app.get('/admin/files', async (req, res) => {
  try {
    const files = await getGitHubPdfFiles();
    const filesWithStatus = files.map(file => ({
      name: file.name,
      size: file.size,
      status: fileStatus[file.name] ? '已处理' : '未处理',
      processedAt: fileStatus[file.name]?.processedAt
    }));

    res.json({ files: filesWithStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 管理API - 触发处理
 */
app.post('/admin/process', async (req, res) => {
  // 异步处理，立即返回
  processKnowledgeBase().then(result => {
    console.log('处理完成:', result);
  }).catch(error => {
    console.error('处理失败:', error);
  });

  res.json({ 
    message: '处理任务已启动，请稍候查看状态',
    isProcessing: true 
  });
});

/**
 * 管理API - 获取处理状态
 */
app.get('/admin/status', (req, res) => {
  res.json({
    isProcessing: processingStatus.isProcessing,
    startTime: processingStatus.startTime,
    currentFile: processingStatus.currentFile,
    totalFiles: processingStatus.totalFiles,
    processedFiles: processingStatus.processedFiles,
    logs: processingStatus.logs.slice(-20) // 只返回最近20条日志
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`企业微信知识库机器人服务已启动，端口: ${PORT}`);
  console.log(`请在企业微信中配置回调URL: https://your-domain.vercel.app/`);
});

module.exports = app;
