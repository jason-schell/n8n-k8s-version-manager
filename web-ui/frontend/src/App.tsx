import { Header } from './components/Header'
import { DeployVersionCard } from './components/DeployVersionCard'
import { VersionsTable } from './components/VersionsTable'
import { SnapshotsSection } from './components/SnapshotsSection'
import { Toaster } from './components/ui/toaster'

function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <Header />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <DeployVersionCard />
          </div>
          <div className="lg:col-span-2">
            <VersionsTable />
          </div>
        </div>
        <SnapshotsSection />
      </div>
      <Toaster />
    </div>
  )
}

export default App
