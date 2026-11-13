import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Vite 配置：Vue 插件 + 开发代理
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // 开发模式下把 API 请求代理到 Go 后端，避免跨域
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    // 产物输出到 backend/dist，供 go:embed 打包进 exe
    //（go:embed 的路径相对 Go 源文件目录解析，所以 dist 必须放在 backend 下）
    outDir: '../backend/dist',
    emptyOutDir: true,
  },
});
