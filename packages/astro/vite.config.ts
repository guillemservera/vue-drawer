import { resolve } from 'node:path'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vite'

export default defineConfig({
	resolve: {
		alias: {
			// Private workspace package, bundled into dist (never a runtime dependency).
			'@guillemservera/drawer-core': resolve(__dirname, '../core/src/index.ts'),
		},
	},
	plugins: [
		dts({
			entryRoot: 'src',
			include: ['src'],
			bundleTypes: true,
			tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
		}),
	],
	build: {
		minify: 'esbuild',
		target: 'es2022',
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			fileName: 'index',
			cssFileName: 'style',
			formats: ['es'],
		},
		reportCompressedSize: true,
		rollupOptions: {
			output: {
				compact: true,
			},
		},
	},
})
