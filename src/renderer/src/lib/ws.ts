const WS_URL = 'ws://localhost:8765/ws'

type Handler = (data: unknown) => void
type Unsubscribe = () => void

// ── Typed WS event payloads ────────────────────────────────────────────────

export interface ScanProgressEvent  { scanned: number; total: number; current_dir: string }
export interface ScanCompleteEvent  { models: Record<string, unknown[]> }
export interface JobQueuedEvent     { job_id: string; tool: string; name: string }
export interface JobProgressEvent   { job_id: string; progress: number; eta_seconds?: number; stage?: string }
export interface JobCompleteEvent   { job_id: string; name: string; tool: string; result_path: string }
export interface JobErrorEvent      { job_id: string; error: string }
export interface JobCancelledEvent  { job_id: string; tool: string; name: string }
export interface StreamStatusEvent  { active: boolean }
export interface SpectrumDataEvent  { node_id: string; fft: number[] }

export interface WsStatusEvent       { connected: boolean }

export type WsEventMap = {
  scan_progress:  ScanProgressEvent
  scan_complete:  ScanCompleteEvent
  job_queued:     JobQueuedEvent
  job_progress:   JobProgressEvent
  job_complete:   JobCompleteEvent
  job_error:      JobErrorEvent
  job_cancelled:  JobCancelledEvent
  stream_status:  StreamStatusEvent
  spectrum_data:  SpectrumDataEvent
  ws_status:      WsStatusEvent
}

// ── Manager ────────────────────────────────────────────────────────────────

class WebSocketManager {
  private socket: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private connected = false
  private hasConnected = false   // true after first successful open

  private emit(type: string, data: unknown): void {
    this.handlers.get(type)?.forEach(h => h(data))
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return
    try {
      this.socket = new WebSocket(WS_URL)

      this.socket.onopen = () => {
        const wasDisconnected = this.hasConnected && !this.connected
        this.connected = true
        this.hasConnected = true
        console.log('[WS] Connected')
        if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
        if (wasDisconnected) this.emit('ws_status', { connected: true })
      }

      this.socket.onmessage = (ev) => {
        try {
          const { type, data } = JSON.parse(ev.data as string) as { type: string; data: unknown }
          this.handlers.get(type)?.forEach(h => h(data))
        } catch { /* ignore malformed */ }
      }

      this.socket.onclose = () => {
        const wasConnected = this.connected
        this.connected = false
        console.log('[WS] Disconnected — retry in 2s')
        if (wasConnected) this.emit('ws_status', { connected: false })
        this.retryTimer = setTimeout(() => this.connect(), 2000)
      }

      this.socket.onerror = () => this.socket?.close()

    } catch {
      this.retryTimer = setTimeout(() => this.connect(), 2000)
    }
  }

  on<K extends keyof WsEventMap>(event: K, handler: (data: WsEventMap[K]) => void): Unsubscribe {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    const h = handler as Handler
    this.handlers.get(event)!.add(h)
    return () => this.handlers.get(event)?.delete(h)
  }

  send(type: string, data?: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, data }))
    }
  }

  get isConnected(): boolean { return this.connected }
}

export const ws = new WebSocketManager()
