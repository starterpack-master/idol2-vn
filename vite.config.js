import { defineConfig } from 'vite';

// base './' : GitHub Pages(https://<user>.github.io/<repo>/)처럼 하위 경로에 올려도 그대로 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1000, // three.js 포함 번들(약 590KB)이라 기본 경고 기준을 올림
  },
});
