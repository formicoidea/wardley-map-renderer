import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: './src',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'next/router': path.resolve(__dirname, 'src/shims/next-router.js'),
      '@mui/styles': path.resolve(__dirname, 'src/shims/mui-styles.js'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'esbuild',
    assetsInlineLimit: Infinity, // inline everything
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.html'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
