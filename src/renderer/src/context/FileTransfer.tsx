/**
 * FileTransferContext — lightweight cross-tool file handoff.
 * Pipeline / Splitter output → send to another tool.
 * Target tool reads pending on mount and clears it.
 */
import { createContext, useContext, useState } from 'react'

interface Transfer {
  path:     string
  filename: string
  fromTool: string
}

interface Ctx {
  pending:    Transfer | null
  setPending: (t: Transfer | null) => void
}

const FileTransferContext = createContext<Ctx>({ pending: null, setPending: () => {} })

export function FileTransferProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Transfer | null>(null)
  return (
    <FileTransferContext.Provider value={{ pending, setPending }}>
      {children}
    </FileTransferContext.Provider>
  )
}

export function useFileTransfer() {
  return useContext(FileTransferContext)
}
