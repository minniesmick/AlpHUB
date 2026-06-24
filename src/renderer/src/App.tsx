import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell'
import SplashScreen from './views/SplashScreen'
import SignalFlowView from './views/SignalFlow'
import PipelineView from './views/Pipeline'
import SplitterView from './views/Splitter'
import SettingsView from './views/Settings'
import MonitorView from './views/Monitor'
import ProjectsView from './views/Projects'
import ImageGenView from './views/ImageGen'

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route element={<AppShell />}>
        <Route path="/daw/*" element={<SignalFlowView />} />
        <Route path="/pipeline/*" element={<PipelineView />} />
        <Route path="/splitter" element={<SplitterView />} />
        <Route path="/monitor" element={<MonitorView />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/imagegen" element={<ImageGenView />} />
        <Route path="/settings/*" element={<SettingsView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
