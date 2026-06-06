/// <reference types="vite/client" />

// CSS Modules
declare module '*.module.css' {
  const styles: Record<string, string>
  export default styles
}

// Electron extends File with a non-standard .path property (full filesystem path)
interface File {
  readonly path: string
}

// IPC bridge exposed via contextBridge in preload/index.ts
// Keep in sync with src/preload/index.d.ts
interface Window {
  api: {
    startOllama:        () => Promise<{ started?: boolean; already_running?: boolean }>
    saveTempAudio:      (buffer: ArrayBuffer) => Promise<string>
    showItemInFolder:   (filePath: string) => void
    notifyJobDone:      (title: string, body: string) => void
    readTextFile:       (filePath: string) => Promise<string>
  }
}
