import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      startOllama: () => Promise<{ started?: boolean; already_running?: boolean }>
      saveTempAudio: (buffer: ArrayBuffer) => Promise<string>
      showItemInFolder: (filePath: string) => void
      notifyJobDone: (title: string, body: string) => void
      readTextFile: (filePath: string) => Promise<string>
      openExternal: (url: string) => void
      openPath: (filePath: string) => void
    }
  }
}
