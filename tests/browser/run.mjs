import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const profile = await mkdtemp(join(tmpdir(), 'vue-drawer-chromium-'))
const { promise: results, resolve, reject } = Promise.withResolvers()
const server = await createServer({
	configFile: 'vitest.config.ts',
	server: { host: '127.0.0.1', hmr: false },
	plugins: [{
		name: 'drawer-browser-results',
		configureServer(vite) {
			vite.middlewares.use('/__drawer_test_results', async (request, response) => {
				let body = ''
				for await (const chunk of request) body += chunk
				response.end()
				resolve(JSON.parse(body))
			})
		},
	}],
})

let browser
const timeout = setTimeout(() => reject(new Error('Chromium did not report test results')), 30_000)
try {
	await server.listen()
	const address = server.httpServer.address()
	browser = spawn(process.env.CHROME_PATH ?? 'google-chrome', [
		'--headless',
		'--disable-dev-shm-usage',
		'--force-prefers-reduced-motion',
		`--user-data-dir=${profile}`,
		...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
		`http://127.0.0.1:${address.port}/tests/browser/`,
	])
	browser.once('error', reject)
	browser.once('exit', code => reject(new Error(`Chromium exited before reporting test results (${code})`)))
	for (const { name, error } of await results) {
		console.log(error ? `FAIL ${name}\n  ${error}` : `PASS ${name}`)
		if (error) process.exitCode = 1
	}
}
finally {
	clearTimeout(timeout)
	if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
		browser.kill()
		await new Promise(resolveExit => browser.once('exit', resolveExit))
	}
	await server.close()
	await rm(profile, { recursive: true, force: true })
}
