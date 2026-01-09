import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4402',
        changeOrigin: true,
        // Forward all headers including custom payment headers
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Log headers being forwarded for debugging
            const paymentHeaders = ['x-payment-proof', 'x-payment', 'payment'];
            paymentHeaders.forEach(header => {
              const value = req.headers[header];
              if (value) {
                console.log(`Forwarding header ${header}: ${value}`);
              }
            });
          });
        },
      },
    },
  },
})

