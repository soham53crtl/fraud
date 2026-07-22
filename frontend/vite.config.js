import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy, tab-specific libraries into their own chunks so the
        // initial bundle (loaded before any tab is opened) stays small —
        // the browser only fetches the map/graph/chart chunk when that
        // tab is actually rendered.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'leaflet';
            if (id.includes('/d3') || id.includes('d3-')) return 'd3';
            if (id.includes('recharts')) return 'charts';
            if (id.includes('socket.io-client')) return 'socket';
          }
        },
      },
    },
  },
})
