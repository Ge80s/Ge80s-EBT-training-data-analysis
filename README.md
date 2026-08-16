# 📚 EBT 平台项目 - 文档索引与快速导航

> **最后更新**: 2026-05-21  
> **项目版本**: v1.0.0 Alpha - Phase 1 完成  
> **生成文件数**: 41 个

---

## 🎯 我应该从哪里开始？

### 👨‍💼 如果你是项目经理或非技术人员
1. **先读这个**: [PROJECT_STATUS.md](PROJECT_STATUS.md) - 项目进度和成果总结
2. **然后看**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - 实现内容和下一步计划
3. **最后了解**: [FILES_CHECKLIST.md](FILES_CHECKLIST.md) - 交付物清单

### 👨‍💻 如果你是开发人员（立即开始开发）
1. **必读**: [QUICK_START.md](QUICK_START.md) - 5 分钟快速启动
2. **对照**: [FILES_CHECKLIST.md](FILES_CHECKLIST.md) - 文件结构与位置
3. **开始编码**: 按照 [QUICK_START.md](QUICK_START.md) 的 4 步启动项目

### 🔧 如果你需要技术深度
1. **架构**: 查看 Session 文件夹中的 `platform_migration_plan.md`
2. **API**: 参考 [backend_complete.py](backend_complete.py) 的路由文档
3. **代码**: 参考各个源代码文件

---

## 📂 文件导航

### 📋 文档（按重要性排序）

| 文件 | 用途 | 阅读时间 |
|------|------|---------|
| **[QUICK_START.md](QUICK_START.md)** | 🚀 **新手必读** - 5 分钟启动项目 | 5 分钟 |
| **[PROJECT_STATUS.md](PROJECT_STATUS.md)** | 📊 项目进度、成果、技术栈 | 10 分钟 |
| **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** | 📈 实现总结、下一步计划 | 15 分钟 |
| **[FILES_CHECKLIST.md](FILES_CHECKLIST.md)** | 📁 交付物清单、文件结构 | 5 分钟 |
| README_FIXUP.md | 🐛 之前的 Streamlit JSON 修复说明 | 5 分钟 |

### 🚀 启动脚本

| 文件 | 系统 | 用途 |
|------|------|------|
| **[setup.py](setup.py)** | Windows/Mac/Linux | 自动创建目录+安装依赖 |
| **[start_dev.bat](start_dev.bat)** | Windows | 一键启动 3 个终端 |
| **[init-project.sh](init-project.sh)** | Mac/Linux | Bash 项目初始化 |

### 💻 源代码文件（37 个）

#### 前端 - React/TypeScript (17 个)
```
核心应用:
  - App.tsx                    主应用入口 + 路由
  - main.tsx                   React 启动点
  
状态管理 (Redux):
  - store/index.ts             Redux 配置
  - store/slices/dataSlice.ts  飞行员数据状态
  - store/slices/filterSlice.ts 过滤条件状态
  - store/slices/uiSlice.ts    UI 状态管理

页面 (6 个标签):
  - pages/Dashboard.tsx                仪表板
  - pages/ComparativeAnalysis.tsx      对标分析
  - pages/IndividualProfile.tsx        飞行员档案
  - pages/SmartComments.tsx            智能评论
  - pages/OBAnalysis.tsx               OB 分析
  - pages/ExaminerAnalysis.tsx         教员分析

组件库:
  - components/Sidebar.tsx             导航侧边栏
  - UIComponents.tsx                   13 个基础组件
  - ChartComponents.tsx                7 个图表组件

服务:
  - api_service.tsx                    API 客户端 + Hooks
  - hooks.tsx                          自定义 Hooks
```

#### 后端 - Python/FastAPI (4 个)
```
主应用:
  - backend_complete.py                完整的 FastAPI 应用
  - backend_main.py                    轻量版应用
  
业务逻辑:
  - business_logic.py                  迁移自 Streamlit app.py
  
数据库:
  - models_database.py                 SQLAlchemy ORM 模型
```

#### 桌面 - Electron (2 个)
```
Electron 进程:
  - electron/main.ts                   主进程
  - electron/preload.ts                预加载脚本 (安全隔离)
```

#### 项目配置 (8 个)
```
前端配置:
  - package.json                       npm 依赖 + 脚本
  - tsconfig.json                      TypeScript 配置
  - vite.config.ts                     Vite 构建配置
  - tailwind.config.js                 Tailwind CSS 配置
  - postcss.config.js                  PostCSS 配置
  - index.html                         HTML 入口

后端配置:
  - backend_requirements.txt            Python 依赖列表
  - tsconfig.node.json                 Node TypeScript 配置
```

---

## 🚀 快速操作指南

### 我想立即启动项目 (5 分钟)
```bash
# 1. 准备目录结构
python setup.py

# 2. 安装依赖 (自动完成，或手动)
cd EBT-Platform-React
npm install

# 3. 启动三个终端
# 终端 1:
cd backend && python main.py

# 终端 2:
npm run dev:vite

# 终端 3 (可选):
npm run dev:electron
```
👉 **查看详细步骤**: [QUICK_START.md](QUICK_START.md#-快速启动-5-分钟)

### 我想理解项目架构
1. 👉 **查看**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md#-当前架构)
2. 👉 **阅读**: Session 文件夹中的 `platform_migration_plan.md`

### 我想修改 API 端点
1. 👉 **编辑**: `backend_complete.py`
2. 👉 **参考**: [API 端点文档](#-api-端点文档)

### 我想添加新的 React 页面
1. 👉 **复制**: `pages/Dashboard.tsx` 作为模板
2. 👉 **参考**: `src/App.tsx` 中的路由配置
3. 👉 **查看**: `components/Sidebar.tsx` 的导航菜单

### 我想测试后端 API
```bash
# 健康检查
curl http://localhost:8000/health

# 获取数据
curl http://localhost:8000/api/data/summary

# 上传文件
curl -X POST -F "file=@data.xlsx" \
  http://localhost:8000/api/upload
```

---

## 📊 API 端点文档

### 文件管理
- **POST** `/api/upload` - 上传 Excel/CSV 文件
- **GET** `/api/files/list` - 获取已上传文件列表
- **DELETE** `/api/files/{id}` - 删除文件

### 数据查询
- **GET** `/api/data/pilots` - 获取飞行员列表 (分页)
- **GET** `/api/data/summary` - 获取仪表板摘要数据
- **GET** `/api/data/pilot/{name}` - 获取单个飞行员档案

### AI 分析
- **POST** `/api/ai/analyze` - AI 分析 (SSE 流式响应)
- **POST** `/api/analysis/comments` - 评论智能分析

### 导出
- **POST** `/api/analysis/export` - 导出分析结果 (Excel/CSV)

### 系统
- **GET** `/health` - 服务健康检查

👉 **详细 API 调用示例**: [QUICK_START.md](QUICK_START.md#-api-端点)

---

## 🔍 代码文件速查表

### 需要修改什么？

| 需求 | 文件 | 位置 |
|------|------|------|
| 修改 UI 样式 | `styles/App.css` | 前端 |
| 添加新组件 | `UIComponents.tsx` | 前端 |
| 添加新页面 | `pages/*.tsx` | 前端 |
| 修改路由 | `App.tsx` | 前端 |
| 改变状态管理 | `store/slices/*.ts` | 前端 |
| 添加 API 端点 | `backend_complete.py` | 后端 |
| 修改业务逻辑 | `business_logic.py` | 后端 |
| 添加数据库表 | `models_database.py` | 后端 |
| 修改图表 | `ChartComponents.tsx` | 前端 |
| 创建 Hooks | `hooks.tsx` | 前端 |

---

## 📈 项目进度追踪

### Phase 1 - 基础框架 (✅ 完成)
- [x] 系统架构设计
- [x] Electron 配置
- [x] 前端项目搭建
- ✅ **当前阶段**: 框架完成，准备开发

### Phase 2-7 - 详细功能 (⏳ 待启动)
- [ ] UI 设计系统完善
- [ ] 图表功能完整实现
- [ ] 后端业务逻辑完整迁移
- [ ] AI 集成与流式输出
- [ ] 完整功能测试
- [ ] 打包部署

👉 **详细计划**: [PROJECT_STATUS.md](PROJECT_STATUS.md#-后续计划)

---

## 🎓 学习资源

### 技术栈官方文档
- [React 18 官方文档](https://react.dev) - UI 框架
- [Redux Toolkit 文档](https://redux-toolkit.js.org) - 状态管理
- [FastAPI 文档](https://fastapi.tiangolo.com) - 后端框架
- [Electron 文档](https://www.electronjs.org) - 桌面应用
- [Vite 文档](https://vitejs.dev) - 构建工具
- [Tailwind CSS 文档](https://tailwindcss.com) - 样式框架

### 项目相关文档
- 👉 [快速启动](QUICK_START.md) - 5 分钟上手
- 👉 [项目状态](PROJECT_STATUS.md) - 进度和成果
- 👉 [文件清单](FILES_CHECKLIST.md) - 交付物

---

## 🆘 故障排查

### 常见问题

**Q: npm install 失败**
👉 [查看解决方案](QUICK_START.md#-常见问题)

**Q: 后端无法启动**
👉 [查看解决方案](QUICK_START.md#-常见问题)

**Q: 前端无法连接到后端**
👉 [查看解决方案](QUICK_START.md#-常见问题)

**Q: 文件上传出错**
👉 [查看解决方案](QUICK_START.md#-常见问题)

### 获取帮助
1. 查看 [QUICK_START.md](QUICK_START.md) 的"常见问题"部分
2. 查看 [PROJECT_STATUS.md](PROJECT_STATUS.md) 的"常见问题"部分
3. 检查浏览器开发者工具 (F12) 的错误信息
4. 查看后端和前端的日志输出

---

## ✨ 关键特性

### ✅ 已实现
- ✨ React 18 现代化框架
- 🎨 响应式 UI 设计
- 📊 交互式图表组件
- 🔄 Redux 无状态丢失架构
- 🌊 AI 流式输出支持
- 📱 Electron 本地应用
- 🔌 FastAPI 异步后端
- 📡 实时数据同步

### 🎯 即将实现
- [ ] 完整的 6 个分析页面
- [ ] 高级图表交互
- [ ] 数据导出 (Excel/CSV/PDF)
- [ ] 用户偏好保存
- [ ] 离线数据持久化
- [ ] 打包为 .exe 可执行文件

---

## 📞 支持

### 需要帮助？
1. **快速查询**: 使用本索引的导航快速找到你需要的文件
2. **阅读文档**: [QUICK_START.md](QUICK_START.md) 包含最常见的问题
3. **查看代码**: 每个源代码文件都有详细的中文注释
4. **检查日志**: 浏览器控制台 (F12) 和后端终端输出

### 关键文档一览
| 文档 | 用途 |
|------|------|
| [QUICK_START.md](QUICK_START.md) | 快速启动与常见问题 |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | 项目整体进度和成果 |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | 详细实现总结 |
| [FILES_CHECKLIST.md](FILES_CHECKLIST.md) | 交付物清单 |

---

## 🎉 下一步

### 立即开始 (现在就做)
1. ✅ 阅读 [QUICK_START.md](QUICK_START.md)
2. ✅ 运行 `python setup.py` 或按照步骤创建项目
3. ✅ 启动三个终端运行应用
4. ✅ 验证 http://localhost:5173 可访问

### 深入了解 (今天完成)
1. ✅ 阅读 [PROJECT_STATUS.md](PROJECT_STATUS.md)
2. ✅ 浏览源代码注释
3. ✅ 理解 Redux 和 API 流

### 开始开发 (本周开始)
1. ✅ 根据 [FILES_CHECKLIST.md](FILES_CHECKLIST.md) 添加功能
2. ✅ 实现 Phase 2 的 UI 完善
3. ✅ 集成真实数据

---

**🚀 准备好了吗？现在就打开 [QUICK_START.md](QUICK_START.md) 启动项目吧！**

---

*最后更新: 2026-05-21 | 项目版本: v1.0.0 Alpha*
