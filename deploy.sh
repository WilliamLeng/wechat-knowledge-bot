#!/bin/bash

echo "🚀 开始部署企业微信知识库机器人..."

# 检查是否安装了vercel
if ! command -v vercel &> /dev/null; then
    echo "❌ 请先安装Vercel CLI: npm i -g vercel"
    exit 1
fi

# 检查是否已登录
if ! vercel whoami &> /dev/null; then
    echo "📝 请先登录Vercel:"
    vercel login
fi

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，请根据 env-example.txt 配置环境变量"
    echo "   复制命令: cp env-example.txt .env"
    echo "   然后编辑 .env 文件填入你的配置"
    exit 1
fi

echo "📦 安装依赖..."
npm install

echo "🔧 配置Vercel环境变量..."
# 读取.env文件并设置到Vercel
while IFS='=' read -r key value; do
    # 跳过注释和空行
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z $key ]] && continue

    echo "设置环境变量: $key"
    vercel env add $key production
done < .env

echo "🚀 部署到Vercel..."
vercel --prod

echo "✅ 部署完成！"
echo "📋 接下来步骤:"
echo "1. 复制上方显示的部署URL"
echo "2. 去企业微信管理后台配置回调URL"
echo "3. 将机器人添加到群聊"
echo "4. 在GitHub创建知识库仓库并添加内容"
echo ""
echo "🎉 享受你的智能知识库机器人吧！"
