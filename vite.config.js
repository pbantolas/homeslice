import {defineConfig} from 'vite';

export default defineConfig({
	optimizeDeps: {
		esbuildOptions: {
			target: "esnext"
		}
	},
	build: {
		target: 'es2022'
	}
})