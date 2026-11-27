import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const profile = await mkdtemp(join(tmpdir(), 'vue-drawer-chromium-'))
const { promise: results, resolve, reject } = Promise.withResolvers()
let dispatchTouch
const server = await createServer({
	configFile: 'vitest.config.ts',
	server: { host: '127.0.0.1', hmr: false },
	plugins: [{
		name: 'drawer-browser-results',
		configureServer(vite) {
			vite.middlewares.use('/__drawer_test_touch', async (request, response) => {
				try {
					let body = ''
					for await (const chunk of request) body += chunk
					await dispatchTouch(JSON.parse(body))
					response.end()
				}
				catch (error) {
					response.statusCode = 500
					response.end(String(error))
				}
			})
			vite.middlewares.use('/__drawer_test_results', async (request, response) => {
				let body = ''
				for await (const chunk of request) body += chunk
				response.end()
				resolve(JSON.parse(body))
			})
		},
	}],
})

function connectDevTools(browser) {
	let nextId = 0
	let buffer = ''
	const pending = new Map()
	browser.stdio[4].setEncoding('utf8').on('data', (chunk) => {
		buffer += chunk
		const messages = buffer.split('\0')
		buffer = messages.pop()
		for (const message of messages) {
			const { id, result, error } = JSON.parse(message)
			const request = pending.get(id)
			if (!request) continue
			pending.delete(id)
			if (error) request.reject(new Error(error.message))
			else request.resolve(result)
		}
	})
	return (method, params, sessionId) => {
		const id = ++nextId
		const request = Promise.withResolvers()
		pending.set(id, request)
		browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0')
		return request.promise
	}
}

let browser
const timeout = setTimeout(() => reject(new Error('Chromium did not report test results')), 30_000)
try {
	await server.listen()
	const address = server.httpServer.address()
	browser = spawn(process.env.CHROME_PATH ?? 'google-chrome', [
		'--headless',
		'--disable-dev-shm-usage',
		'--force-prefers-reduced-motion',
		'--remote-debugging-pipe',
		`--user-data-dir=${profile}`,
		...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
		'about:blank',
	], { stdio: ['ignore', 'ignore', 'inherit', 'pipe', 'pipe'] })
	browser.once('error', reject)
	browser.once('exit', code => reject(new Error(`Chromium exited before reporting test results (${code})`)))
	const send = connectDevTools(browser)
	const navigate = async () => {
		const { targetInfos } = await send('Target.getTargets')
		const { targetId } = targetInfos.find(target => target.type === 'page')
		const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
		dispatchTouch = params => send('Input.dispatchTouchEvent', params, sessionId)
		const { errorText } = await send('Page.navigate', { url: `http://127.0.0.1:${address.port}/tests/browser/` }, sessionId)
		if (errorText) throw new Error(errorText)
	}
	void navigate().catch(reject)
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
	await rm(profile, { recursive: true, force: true, maxRetries: 3 })
}
