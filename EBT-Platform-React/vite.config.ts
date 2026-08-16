import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // FastAPI/打包程序从 backend/dist 提供静态资源，构建结果必须输出到此目录。
  build: {
    outDir: 'backend/dist',
    emptyOutDir: true,
  },
})
