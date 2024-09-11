import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";

export default defineConfig({
	css: {
		postcss: {
			plugins: [tailwindcss()],
		},
	},
	optimizeDeps: {
		esbuildOptions: {
			target: "esnext",
		},
	},
	build: {
		target: "es2022",
	},
});
