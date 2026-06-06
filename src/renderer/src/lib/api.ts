const BASE = 'http://localhost:8765'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[API] ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string)                    => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)    => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown)    => request<T>('PUT',    path, body),
  delete: <T>(path: string)                    => request<T>('DELETE', path),
}

// ── Typed endpoint helpers (add as features are built) ─────────────────────

export interface Model {
  id: string
  name: string
  path: string
  tool: 'whisper' | 'demucs' | 'rvc' | 'kokoro'
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number      // 0–100
  eta_seconds?: number
  result_path?: string
  error?: string
}

export interface ScanResult {
  models: Record<string, Model[]>
}

export interface DevicesResult {
  input:  { name: string; index: number }[]
  output: { name: string; index: number }[]
}

export interface VoiceProfile {
  id:      string
  name?:   string
  created?: string
  source?:  string
}

export interface SystemInfo {
  python_version:    string
  cuda_available:    boolean
  cuda_device_name:  string | null
  cuda_device_count: number
  vram_total_gb:     number | null
  vram_free_gb:      number | null
}

export const endpoints = {
  health:      ()                                    => api.get<{ status: string }>('/health'),
  systemInfo:  ()                                    => api.get<SystemInfo>('/api/system'),
  models:      (model_root?: string)                 => api.get<ScanResult>(`/api/models${model_root ? `?model_root=${encodeURIComponent(model_root)}` : ''}`),
  rescanModels:(payload?: { model_root?: string })   => api.post<ScanResult>('/api/models/rescan', payload ?? {}),
  dawDevices:  ()                                    => api.get<DevicesResult>('/api/daw/devices'),
  dawStart:    (cfg?: { input_idx?: number; output_idx?: number; sample_rate?: number; blocksize?: number }) =>
    api.post<{ ok: boolean }>('/api/daw/start', cfg ?? {}),
  dawStop:     ()                                    => api.post<{ ok: boolean }>('/api/daw/stop'),
  dawGraph:    (graph: unknown)                      => api.post<{ ok: boolean; node_count: number }>('/api/daw/graph', graph),
  dawParam:    (node_id: string, param: string, value: number) =>
    api.put<{ ok: boolean }>(`/api/daw/param?node_id=${encodeURIComponent(node_id)}&param=${encodeURIComponent(param)}&value=${value}`),
  splitterRun:      (payload: unknown)                    => api.post<{ job_id: string }>('/api/splitter/run', payload),
  splitterCancel:   (job_id: string)                      => api.delete<{ ok: boolean; job_id: string }>(`/api/splitter/jobs/${job_id}`),
  pipelineRun:      (payload: unknown)                    => api.post<{ job_id: string }>('/api/pipeline/run', payload),
  pipelineCancel:   (job_id: string)                      => api.delete<{ ok: boolean; job_id: string }>(`/api/pipeline/jobs/${job_id}`),
  pipelineProfiles: (payload: { reference_path: string; profile_name: string }) =>
    api.post<{ job_id: string }>('/api/pipeline/profiles', payload),
  listProfiles:     ()                                    => api.get<VoiceProfile[]>('/api/models/profiles'),
  deleteProfile:    (id: string)                          => api.delete<{ ok: boolean; deleted: string }>(`/api/models/profiles/${encodeURIComponent(id)}`),
  ollamaStatus:     ()                                    => api.get<{ running: boolean }>('/api/ollama/status'),
  ollamaModels:     ()                                    => api.get<{ models: { id: string; name: string; size_gb: number }[] }>('/api/ollama/models'),
  readFile:         (path: string)                        => api.get<{ content: string; filename: string }>(`/api/file?path=${encodeURIComponent(path)}`),
}
