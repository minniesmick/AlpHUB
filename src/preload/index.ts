import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  /** Spawn `ollama serve` (with OLLAMA_MODELS env) if not already running. */
  startOllama: (): Promise<{ started?: boolean; already_running?: boolean }> =>
    ipcRenderer.invoke('ollama-start'),

  /** Write an audio recording blob to a temp file; returns the OS temp path. */
  saveTempAudio: (buffer: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('save-temp-audio', new Uint8Array(buffer)),

  /** Reveal a file in Windows Explorer (selected/highlighted). */
  showItemInFolder: (filePath: string): void => {
    void ipcRenderer.invoke('show-item-in-folder', filePath)
  },

  /** Fire a native Windows notification when a GPU job finishes. */
  notifyJobDone: (title: string, body: string): void => {
    void ipcRenderer.invoke('notify-job-done', title, body)
  },

  /** Read a text file from disk (for clipboard copy of STT/TTT outputs). */
  readTextFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('read-text-file', filePath),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Non-isolated fallback (dev only) — cast to bypass missing Window augmentation in node tsconfig
  ;(window as unknown as Record<string, unknown>)['electron'] = electronAPI
  ;(window as unknown as Record<string, unknown>)['api'] = api
}
