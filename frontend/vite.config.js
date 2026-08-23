import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the built site runs from any subdirectory -- a GitHub
  // Pages project site lives under /<repo>/ and absolute '/assets/...' would 404.
  // This works without the build knowing the repo name.
  base: './',
  plugins: [react()],
})
