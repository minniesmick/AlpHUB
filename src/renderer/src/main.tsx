import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/tailwind.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { FileTransferProvider } from './context/FileTransfer'
import { ToastProvider } from './context/Toast'
import { SettingsProvider } from './context/Settings'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <SettingsProvider>
          <FileTransferProvider>
            <App />
          </FileTransferProvider>
        </SettingsProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>
)
