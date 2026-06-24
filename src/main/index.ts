import { app, BrowserWindow, shell, ipcMain, Notification } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFile, readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// ── User config (gitignored) ──────────────────────────────────────────────────
// Copy user.config.example.json → user.config.json and fill in your paths.
interface UserConfig {
  pythonVenv?:   string
  ollamaModels?: string
}

function loadUserConfig(): UserConfig {
  // Search order: project root (dev), exe directory (prod)
  const searchDirs = [process.cwd(), join(__dirname, '..', '..', '..'), __dirname]
  for (const dir of searchDirs) {
    try {
      return JSON.parse(readFileSync(join(dir, 'user.config.json'), 'utf-8')) as UserConfig
    } catch { /* try next */ }
  }
  return {}
}

const _cfg = loadUserConfig()

const PYTHON_VENV    = _cfg.pythonVenv   ?? 'D:\\AI_Ortak_Venv\\hub_venv\\Scripts\\python.exe'
const BACKEND_PORT   = 8765
const OLLAMA_MODELS  = _cfg.ollamaModels ?? 'D:\\OllamaModels'

let backendProcess: ChildProcess | null = null
let ollamaProcess:  ChildProcess | null = null

function startBackend(): void {
  if (is.dev) return // In dev, run backend manually: npm run backend

  // In packaged app, electron-builder puts backend/ in resources/ via extraResources
  const backendCwd = join(process.resourcesPath, 'backend')

  backendProcess = spawn(
    PYTHON_VENV,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
    {
      cwd: backendCwd,
      stdio: 'pipe'
    }
  )

  backendProcess.stdout?.on('data', (d) => process.stdout.write(`[Backend] ${d}`))
  backendProcess.stderr?.on('data', (d) => process.stderr.write(`[Backend] ${d}`))
  backendProcess.on('exit', (code) => console.log(`[Backend] exited with code ${code}`))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 768,
    minWidth: 1280,
    minHeight: 768,
    show: false,
    backgroundColor: '#09090F', // --void: prevents white flash on load
    frame: true,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    // App icon — dev: resolve from project root; prod: electron-builder injects it via build/icon.ico
    icon: join(process.cwd(), 'alp_hub_icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Grant microphone permission for MediaRecorder (STT mic input)
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === 'media')
    }
  )

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Audio recording IPC ───────────────────────────────────────────────────

ipcMain.handle('get-home-dir', () => app.getPath('home'))

ipcMain.handle('save-temp-audio', async (_event, buffer: Uint8Array) => {
  const path = join(tmpdir(), `alphub-mic-${Date.now()}.webm`)
  await writeFile(path, Buffer.from(buffer))
  return path
})

// ── File explorer IPC ─────────────────────────────────────────────────────

ipcMain.handle('show-item-in-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url)
})

ipcMain.handle('open-path', (_event, filePath: string) => {
  shell.openPath(filePath)
})

// ── Text file reader (for clipboard copy) ─────────────────────────────────

ipcMain.handle('read-text-file', async (_event, filePath: string) => {
  return readFile(filePath, 'utf-8')
})

// ── Job-complete notification ─────────────────────────────────────────────

ipcMain.handle('notify-job-done', (_event, title: string, body: string) => {
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent: false }).show()
})

// ── Ollama IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('ollama-start', async () => {
  // Check if Ollama is already reachable — skip spawn if so
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) })
    if (res.ok) return { already_running: true }
  } catch { /* not running */ }

  // Already spawned by us and still alive
  if (ollamaProcess && !ollamaProcess.killed) {
    return { already_running: true }
  }

  ollamaProcess = spawn('ollama', ['serve'], {
    env:   { ...process.env, OLLAMA_MODELS },
    stdio: 'pipe',
    shell: false,
  })

  ollamaProcess.stdout?.on('data', d => process.stdout.write(`[Ollama] ${d}`))
  ollamaProcess.stderr?.on('data', d => process.stderr.write(`[Ollama] ${d}`))
  ollamaProcess.on('exit', code => {
    console.log(`[Ollama] exited with code ${code}`)
    ollamaProcess = null
  })

  return { started: true }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.alphub')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  startBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  backendProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  backendProcess?.kill()
  // Only kill Ollama if WE spawned it — don't kill user's running instance
  ollamaProcess?.kill()
})
