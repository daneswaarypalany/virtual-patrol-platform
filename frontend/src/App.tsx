import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MapPin,
  Camera,
  Route as RouteIcon,
  ListChecks,
  User,
  MonitorDot,
  MessageSquareWarning,
  Settings as SettingsIcon,
  LogOut,
  Bell,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ScrollText,
} from 'lucide-react'
import { useAuth } from './auth/AuthContext'
import type { Role } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import Login from './pages/Login'
import Users from './pages/Users'
import Sites from './pages/Sites'
import Cameras from './pages/Cameras'
import RoutesPage from './pages/Routes'
import Checklists from './pages/Checklists'
import Patrol from './pages/Patrol'
import Reports from './pages/Reports'
import ActivePatrols from './pages/ActivePatrols'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import './App.css'

type Page =
  | 'dashboard'
  | 'sites'
  | 'cameras'
  | 'routes'
  | 'checklists'
  | 'users'
  | 'patrol'
  | 'active-patrols'
  | 'reports'
  | 'history'
  | 'logs'
  | 'settings'

const navigation: {
  id: Page
  label: string
  icon: typeof LayoutDashboard
  roles: Role[]
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
  { id: 'sites', label: 'Sites', icon: MapPin, roles: ['ADMIN'] },
  { id: 'cameras', label: 'Cameras', icon: Camera, roles: ['ADMIN'] },
  { id: 'routes', label: 'Routes', icon: RouteIcon, roles: ['ADMIN'] },
  { id: 'checklists', label: 'Checklists', icon: ListChecks, roles: ['ADMIN'] },
  { id: 'users', label: 'Users', icon: User, roles: ['ADMIN'] },
  { id: 'patrol', label: 'Run Patrol', icon: MonitorDot, roles: ['OPERATOR'] },
  { id: 'active-patrols', label: 'Active Patrols', icon: MonitorDot, roles: ['ADMIN'] },
  { id: 'reports', label: 'Reports', icon: MessageSquareWarning, roles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
  { id: 'history', label: 'History', icon: Calendar, roles: ['ADMIN'] },
  { id: 'logs', label: 'Logs', icon: ScrollText, roles: ['ADMIN'] },
]

const pageTitles: Record<Page, string> = {
  dashboard: 'Dashboard',
  sites: 'Site Management',
  cameras: 'Camera Management',
  routes: 'Route Builder',
  checklists: 'Checklist Templates',
  users: 'User Management',
  patrol: 'Run Patrol',
  'active-patrols': 'Active Patrols',
  reports: 'Reports',
  history: 'Patrol History',
  logs: 'Logs',
  settings: 'Settings',
}

const builtPages: Page[] = [
  'dashboard',
  'users',
  'sites',
  'routes',
  'checklists',
  'patrol',
  'active-patrols',
  'cameras',
  'reports',
  'history',
  'logs',
  'settings',
]

function Shell() {
  const { user, logout } = useAuth()
  const [activePage, setActivePage] = useState<Page>('dashboard')
  // Start in the slim icon-rail mode shown in the navigation reference.
  const [collapsed, setCollapsed] = useState(true)
  const [navTooltip, setNavTooltip] = useState<{ label: string; top: number; left: number } | null>(null)

  if (!user) return null

  const visibleNav = navigation.filter((item) => item.roles.includes(user.role))

  const showNavTooltip = (target: HTMLButtonElement, label: string) => {
    if (!collapsed) return
    const bounds = target.getBoundingClientRect()
    setNavTooltip({ label, top: bounds.top + bounds.height / 2, left: bounds.right + 10 })
  }

  const roleLabel =
    user.role === 'ADMIN'
      ? 'System Administrator'
      : user.role === 'OPERATOR'
        ? 'Security Officer'
        : 'Client Viewer'

  return (
    <div className="app">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <button
          className="sidebar-toggle"
          onClick={() => {
            setNavTooltip(null)
            setCollapsed((c) => !c)
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="brand">
          <img src="/logo.png" alt="A-Force Protection" className="brand-logo" />
          <div className="brand-text">
            <h1>Virtual Patrol</h1>
            <span>Security Management</span>
          </div>
        </div>

        <nav className="navigation">
          <p className="nav-title">MAIN MENU</p>
          {visibleNav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
              aria-label={item.label}
              onMouseEnter={(event) => showNavTooltip(event.currentTarget, item.label)}
              onMouseLeave={() => setNavTooltip(null)}
              onFocus={(event) => showNavTooltip(event.currentTarget, item.label)}
              onBlur={() => setNavTooltip(null)}
            >
              <span className="nav-icon">
                <item.icon strokeWidth={1.7} />
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {user.role === 'ADMIN' && (
            <button
              className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
              onClick={() => setActivePage('settings')}
              aria-label="Settings"
              onMouseEnter={(event) => showNavTooltip(event.currentTarget, 'Settings')}
              onMouseLeave={() => setNavTooltip(null)}
              onFocus={(event) => showNavTooltip(event.currentTarget, 'Settings')}
              onBlur={() => setNavTooltip(null)}
            >
              <span className="nav-icon">
                <SettingsIcon />
              </span>
              <span className="nav-label">Settings</span>
            </button>
          )}

          <button
            className="nav-item logout"
            onClick={logout}
            aria-label="Logout"
            onMouseEnter={(event) => showNavTooltip(event.currentTarget, 'Logout')}
            onMouseLeave={() => setNavTooltip(null)}
            onFocus={(event) => showNavTooltip(event.currentTarget, 'Logout')}
            onBlur={() => setNavTooltip(null)}
          >
            <span className="nav-icon">
              <LogOut />
            </span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      {collapsed && navTooltip && (
        <div
          className="nav-hover-tooltip"
          role="tooltip"
          style={{ top: navTooltip.top, left: navTooltip.left }}
        >
          {navTooltip.label}
        </div>
      )}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-heading">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <span className="breadcrumb-parent">Virtual Patrol</span>
              <span className="breadcrumb-separator" aria-hidden="true">/</span>
              <span className="breadcrumb-current" aria-current="page">
                {pageTitles[activePage]}
              </span>
            </nav>
          </div>

          <div className="user-section">
            <Bell size={17} color="#667085" aria-label="Notifications" />
            <div className="user-avatar">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <strong>{user.fullName}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>
        </header>

        <section className="page-content">
          {activePage === 'dashboard' && <Dashboard onNavigate={setActivePage} />}
          {activePage === 'users' && <Users />}
          {activePage === 'sites' && <Sites />}
          {activePage === 'cameras' && <Cameras />}
          {activePage === 'routes' && <RoutesPage />}
          {activePage === 'checklists' && <Checklists />}
          {activePage === 'patrol' && <Patrol />}
          {activePage === 'active-patrols' && <ActivePatrols />}
          {activePage === 'reports' && <Reports />}
          {activePage === 'history' && <History />}
          {activePage === 'logs' && <Logs />}
          {activePage === 'settings' && <Settings />}

          {!builtPages.includes(activePage) && (
            <div className="module-placeholder">
              <div className="module-icon">◈</div>
              <h3>{pageTitles[activePage]}</h3>
              <p>
                This module is currently being developed. The basic interface is
                ready and functionality will be added next.
              </p>
              <span className="development-badge">In Development</span>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App