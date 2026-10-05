import { useState } from 'react'
import './App.css'
import { DataProvider } from './DataContext'
import { ProjectsProvider } from './ProjectsProvider'
import Topbar from './Topbar'
import LeftSidebar from './LeftSidebar'
import RightSidebar from './RightSidebar'
import Chart from './Chart'
import TimelinePage from './TimelinePage'

type Page = 'timeline' | 'graph'

// App switches between two top-level pages: the Timeline (the app's
// starting page) and the Graph. DataProvider and ProjectsProvider wrap
// both so a future timeline can read the same loaded dataset the chart
// uses, and so the chart can eventually know which project/test fire it
// was opened from. Each sidebar can still be collapsed via a toggle
// button in the Topbar.

function App() {
  const [page, setPage] = useState<Page>('timeline')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  return (
    <DataProvider>
      <ProjectsProvider>
        {/* if timeline page, setup chart as such */}
        {page === 'timeline' ? (
          <TimelinePage onOpenChart={() => setPage('graph')} />
        ) : (
          // if not timeline page, set up graph parts
          <>
            <Topbar onBack={() => setPage('timeline')} />

            <div className="main-content">
              <LeftSidebar open={leftOpen} onToggle={() => setLeftOpen((open) => !open)} />

              <div className="middle-content content">
                <Chart />
              </div>

              <RightSidebar open={rightOpen} onToggle={() => setRightOpen((open) => !open)} />
            </div>
          </>
        )}
      </ProjectsProvider>
    </DataProvider>
  )
}

export default App
