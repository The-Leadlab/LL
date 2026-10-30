import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isMobileBuild = env.VITE_MOBILE === '1' || process.env.VITE_MOBILE === '1';
  
  return {
    plugins: [
      react(),
      {
        name: 'leadlab-mobile-base-href',
        transformIndexHtml(html) {
          if (!isMobileBuild) return html;
          return html.replace(/<base\s+href="\/"\s*\/?>/i, '<base href="./" />');
        },
      },
    ],
    // Capacitor WebView needs relative asset URLs; Vercel web keeps absolute `/`.
    base: isMobileBuild ? './' : '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'crypto': 'crypto-browserify',
        'stream': 'stream-browserify',
        'buffer': 'buffer',
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'import.meta.env.MODE': JSON.stringify(mode),
      'process.env': {},
      global: 'globalThis',
      // LinkedIn OAuth Environment Variables
      'import.meta.env.VITE_LINKEDIN_CLIENT_ID': JSON.stringify(env.VITE_LINKEDIN_CLIENT_ID || '77ndp90oa63xyn'),
      'import.meta.env.VITE_LINKEDIN_REDIRECT_URI': JSON.stringify(env.VITE_LINKEDIN_REDIRECT_URI || 'https://the-leadlab.com/linkedin/callback'),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'https://api.the-leadlab.com'),
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api/v1': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Sending Request to the Target:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            });
          },
        }
      }
    },
    build: {
      sourcemap: mode === 'development',
      minify: mode === 'production' ? 'terser' : false,
      outDir: 'dist',
      assetsDir: 'assets',
      terserOptions: mode === 'production' ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      } : undefined,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            calendar: ['react-big-calendar', 'date-fns', 'date-fns-tz'],
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        },
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis'
        }
      },
      include: [
        'react-big-calendar',
        'date-fns',
        'date-fns-tz',
        'date-fns/locale/en-US',
        'date-fns/locale/tr'
      ]
    }
  }
})
