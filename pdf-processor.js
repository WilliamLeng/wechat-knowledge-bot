/**
 * PDF知识库处理器
 * 用于将PDF文件转换为文本格式，准备用于RAG架构
 *
 * 使用方法：
 * 1. 安装依赖：npm install pdf-parse
 * 2. 将PDF文件放入 pdfs/ 目录
 * 3. 运行：node pdf-processor.js
 * 4. 处理后的文本会保存到 processed/ 目录
 */

const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');

/**
 * 提取PDF文本内容
 */
async function extractPdfText(pdfPath) {
  try {
    const dataBuffer = await fs.readFile(pdfPath);
    const data = await pdfParse(dataBuffer);
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info
    };
  } catch (error) {
    console.error(`处理PDF失败 ${pdfPath}:`, error.message);
    return null;
  }
}

/**
 * 将文本分割成小块（用于RAG）
 */
function splitTextIntoChunks(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  const sentences = text.split(/[。！？.!?]+/).filter(s => s.trim());

  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }

      // 保持重叠内容
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 6)); // 粗略估算
      currentChunk = overlapWords.join(' ') + sentence;
    } else {
      currentChunk += sentence + '。';
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * 处理单个PDF文件
 */
async function processPdfFile(pdfPath, outputDir) {
  console.log(`正在处理: ${pdfPath}`);

  const result = await extractPdfText(pdfPath);
  if (!result) return null;

  const { text, pages, info } = result;

  // 分割文本
  const chunks = splitTextIntoChunks(text);

  // 生成Markdown格式
  const fileName = path.basename(pdfPath, '.pdf');
  const outputPath = path.join(outputDir, `${fileName}.md`);

  let markdown = `# ${fileName}\n\n`;
  markdown += `**文件信息:**\n`;
  markdown += `- 页数: ${pages}\n`;
  markdown += `- 创建时间: ${info?.CreationDate || '未知'}\n`;
  markdown += `- 修改时间: ${info?.ModDate || '未知'}\n\n`;
  markdown += `---\n\n`;

  // 添加文本块
  chunks.forEach((chunk, index) => {
    markdown += `## 内容块 ${index + 1}\n\n${chunk}\n\n---\n\n`;
  });

  // 保存文件
  await fs.writeFile(outputPath, markdown, 'utf8');
  console.log(`已保存: ${outputPath} (${chunks.length} 个文本块)`);

  return {
    fileName,
    outputPath,
    chunks: chunks.length,
    totalChars: text.length
  };
}

/**
 * 批量处理PDF文件
 */
async function processAllPdfs(pdfDir = './pdfs', outputDir = './processed') {
  try {
    // 确保输出目录存在
    await fs.mkdir(outputDir, { recursive: true });

    // 获取PDF文件列表
    const files = await fs.readdir(pdfDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

    console.log(`发现 ${pdfFiles.length} 个PDF文件`);

    const results = [];
    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(pdfDir, pdfFile);
      const result = await processPdfFile(pdfPath, outputDir);
      if (result) {
        results.push(result);
      }
    }

    // 生成处理报告
    const reportPath = path.join(outputDir, 'processing-report.json');
    const report = {
      processedAt: new Date().toISOString(),
      totalFiles: results.length,
      totalChunks: results.reduce((sum, r) => sum + r.chunks, 0),
      totalChars: results.reduce((sum, r) => sum + r.totalChars, 0),
      files: results
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`处理完成！共处理 ${results.length} 个文件`);
    console.log(`生成 ${report.totalChunks} 个文本块，总计 ${report.totalChars} 字符`);

  } catch (error) {
    console.error('批量处理失败:', error);
  }
}

/**
 * 向量化文本块（可选，需要OpenAI API）
 * 注意：这是一个示例，实际部署时建议使用专门的向量数据库
 */
async function vectorizeChunks(chunks) {
  // 这里应该调用OpenAI embeddings API或其他向量化服务
  // 然后将向量保存到向量数据库（如Pinecone、Chroma等）

  console.log(`准备向量化 ${chunks.length} 个文本块...`);
  // 实际实现需要：
  // 1. 调用OpenAI embeddings API
  // 2. 将向量存储到数据库
  // 3. 创建索引以便快速检索

  return chunks.map((chunk, index) => ({
    id: `chunk_${index}`,
    text: chunk,
    vector: [], // 这里应该填充实际的向量数据
    metadata: {
      source: 'pdf_processing',
      index: index
    }
  }));
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'process':
      const pdfDir = args[1] || './pdfs';
      const outputDir = args[2] || './processed';
      await processAllPdfs(pdfDir, outputDir);
      break;

    case 'vectorize':
      // 这里可以添加向量化逻辑
      console.log('向量化功能需要单独配置向量数据库');
      break;

    default:
      console.log('使用方法:');
      console.log('  处理PDF: node pdf-processor.js process [pdf目录] [输出目录]');
      console.log('  示例: node pdf-processor.js process ./pdfs ./processed');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  extractPdfText,
  splitTextIntoChunks,
  processPdfFile,
  processAllPdfs,
  vectorizeChunks
};
