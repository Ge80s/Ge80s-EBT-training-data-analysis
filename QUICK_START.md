# EBT 平台 React 版本 - 快速启动指南

## 📋 前置条件

### 需要安装的工具
- **Node.js** 18+ (https://nodejs.org/)
- **Python** 3.9+ (https://www.python.org/)
- **Git** (可选，用于版本控制)

### 验证安装
```bash
node --version      # 应该显示 v18.x 或更高
npm --version       # 应该显示 9.x 或更高
python --version    # 应该显示 3.9+ 或更高
```

---

## 🚀 快速启动 (5 分钟)

### 1️⃣ 项目目录结构创建

```bash
# 在 d:\EBT训练数据分析工具 目录执行以下命令

# 创建项目结构
mkdir EBT-Platform-React\frontend\src\{components,pages,store/slices,services,styles,types,hooks,utils}
mkdir EBT-Platform-React\frontend\public
mkdir EBT-Platform-React\electron
mkdir EBT-Platform-React\backend\app\{routes,services,models,utils,schemas}
mkdir EBT-Platform-React\backend\tests
```

### 2️⃣ 前端依赖安装

```bash
cd EBT-Platform-React

# 复制 package.json (如果还没有)
# 从本工程中获取 package.json 内容

npm install
```

### 3️⃣ 后端依赖安装

```bash
cd backend

# 创建 Python 虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 4️⃣ 启动开发服务

**终端 1 - 启动后端 FastAPI 服务**
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

✅ 看到 `Uvicorn running on http://127.0.0.1:8000` 即成功

**终端 2 - 启动前端开发服务器**
```bash
cd EBT-Platform-React
npm run dev:vite
```

✅ 看到 `Local: http://localhost:5173` 即成功

**终端 3 - 启动 Electron 应用** (可选，或访问浏览器地址)
```bash
cd EBT-Platform-React
npm run dev:electron
```

---

## 📁 项目文件对应表

| 文件/目录 | 位置 | 作用 |
|---------|------|------|
| `package.json` | 项目根 | npm 依赖配置 |
| `src/App.tsx` | 前端 | React 主应用 |
| `src/store/` | 前端 | Redux 状态管理 |
| `src/components/` | 前端 | 可复用 UI 组件 |
| `src/pages/` | 前端 | 6 个标签页 |
| `electron/main.ts` | 桌面 | Electron 主进程 |
| `electron/preload.ts` | 桌面 | Electron 预加载脚本 |
| `backend/main.py` | 后端 | FastAPI 应用入口 |
| `backend/app/routes/` | 后端 | API 路由定义 |
| `api_service.tsx` | 前端 | API 调用客户端 |

---

## 🔗 API 端点

| 端点 | 方法 | 作用 |
|------|------|------|
| `/api/upload` | POST | 上传 Excel/CSV 文件 |
| `/api/data/pilots` | GET | 获取飞行员列表 |
| `/api/data/summary` | GET | 获取仪表板摘要 |
| `/api/ai/analyze` | POST | AI 分析 (流式 SSE) |
| `/api/files/list` | GET | 获取上传文件列表 |
| `/api/analysis/export` | POST | 导出分析结果 |

### 示例：上传文件

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@2024下半年EBT胜任力评估带OB项.xlsx"
```

### 示例：获取飞行员列表

```bash
curl http://localhost:8000/api/data/pilots?skip=0&limit=10
```

### 示例：AI 分析 (SSE 流式)

```bash
curl -X POST http://localhost:8000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt": "分析这些飞行员的技能水平"}'
```

---

## 🧪 测试

### 前端测试

```bash
cd EBT-Platform-React
npm run type-check    # TypeScript 类型检查
npm run lint          # ESLint 代码检查
```

### 后端测试

```bash
cd backend
pytest tests/         # 运行单元测试 (需要安装 pytest)
```

---

## 🔧 开发工作流

### 修改前端代码

1. 编辑 `src/` 下的文件
2. Vite 会自动热重载 (HMR)
3. 浏览器/Electron 窗口会自动刷新

### 修改后端代码

1. 编辑 `backend/` 下的文件
2. Uvicorn 会自动重载 (`--reload` 模式)
3. 前端通过 API 重新调用

### 调试

**前端调试：**
- 在浏览器打开 DevTools (F12)
- 或在 Electron 中打开内置 DevTools

**后端调试：**
- 查看 Uvicorn 日志
- 或使用 Python 调试器 (pdb)

---

## 📦 构建生产版本

### 打包为 Windows 可执行文件

```bash
npm run build
```

输出文件：
- `dist-electron/` - Electron 主进程
- `dist/` - React 前端
- 生成的 `.exe` 文件可在 `release/` 目录找到

---

## 🆘 常见问题

### Q: 无法连接到后端

**A:** 检查：
1. 后端是否运行：`http://localhost:8000` 是否可访问
2. CORS 配置是否正确（见 `backend/main.py` 的 `CORSMiddleware`）
3. 端口 8000 是否被占用：`netstat -an | grep 8000`

### Q: npm install 失败

**A:** 尝试：
```bash
npm cache clean --force
npm install
```

或使用 Yarn:
```bash
yarn install
```

### Q: 导入文件失败

**A:** 检查：
1. Excel 文件是否是双行表头格式
2. 文件编码是否为 UTF-8 或 GBK
3. 查看浏览器控制台的错误信息

---

## 🚢 部署

### 本地离线使用

1. 构建项目：`npm run build`
2. 用户下载 `.exe` 文件即可运行
3. 无需安装 Node.js 或 Python

### 企业内网部署

1. 后端部署到内网服务器（需要 Python 环境）
2. 修改 API 地址指向服务器
3. 前端打包为静态文件或继续使用 Electron

---

## 📞 支持

有问题？查看以下资源：
- [Vite 文档](https://vitejs.dev/)
- [React 文档](https://react.dev/)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [Electron 文档](https://www.electronjs.org/docs)
