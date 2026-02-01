import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'get-windows',
        '@mapbox/node-pre-gyp',
        'node-addon-api',
        'node-gyp',
        'aws-sdk',
        'mock-aws-s3',
        'nock',
      ],
    },
  },
});
