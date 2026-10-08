import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
    },
    define: {
        // Fix for amazon-cognito-identity-js which uses Node.js global
        global: 'globalThis',
    },
    build: {
        rollupOptions: {
            // Mark @logfire/browser as external - it's an optional dependency
            // If not installed, the dynamic import will fail gracefully at runtime
            external: (id: string) => id === '@logfire/browser',
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test-setup.ts'],
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/tests/**',
            '**/.{idea,git,cache,output,temp}/**',
        ],
    },
});
