const { spawn } = require('child_process')
const { readFileSync, existsSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')

let config = {}
try { config = JSON.parse(readFileSync(join(root, 'user.config.json'), 'utf-8')) } catch {}

// Resolution order:
// 1. user.config.json pythonVenv
// 2. ./venv/Scripts/python.exe  (local project venv)
// 3. "python" from system PATH
function resolvePython() {
  if (config.pythonVenv && existsSync(config.pythonVenv)) return config.pythonVenv
  const localVenv = join(root, 'venv', 'Scripts', 'python.exe')
  if (existsSync(localVenv)) return localVenv
  return 'python'
}

const python = resolvePython()
console.log(`[backend] Python: ${python}`)

const proc = spawn(
  python,
  ['-m', 'uvicorn', 'main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8765', '--reload'],
  { stdio: 'inherit', shell: false }
)

proc.on('error', err => {
  console.error(`[backend] Failed to start: ${err.message}`)
  console.error('[backend] Set "pythonVenv" in user.config.json (see user.config.example.json)')
  process.exit(1)
})

proc.on('exit', code => process.exit(code ?? 0))
