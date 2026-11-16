import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' so the build also works on GitHub Pages under /snickerei/
export default defineConfig({
  base: './',
  plugins: [react()],
})
