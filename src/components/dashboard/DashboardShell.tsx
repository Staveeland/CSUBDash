'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import DashboardHeader from './DashboardHeader'
import type { ProjectRow, UpcomingAward } from '@/lib/data'

interface Props {
  children: React.ReactNode
  projects: ProjectRow[]
  awards: UpcomingAward[]
}

export default function DashboardShell({ children, projects, awards }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          projects={projects}
          awards={awards}
        />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {children}
        </main>
      </div>
    </div>
  )
}
