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
} from 'lucide-react'
import { useAuth } from './auth/AuthContext'
import type { Role } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import Login from './pages/Login'
import Users from './pages/Users'
import Sites from './pages/Sites'
import RoutesPage from './pages/Routes'
import Checklists from './pages/Checklists'
import Patrol from './pages/Patrol'
import Cameras from './pages/Cameras'
import './App.css'

type Page =
  | 'dashboard'
  | 'sites'
  | 'cameras'
  | 'routes'
  | 'checklists'
  | 'users'
  | 'patrol'
  | 'reports'
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
  { id: 'reports', label: 'Reports', icon: MessageSquareWarning, roles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
]

const pageTitles: Record<Page, string> = {
  dashboard: 'Dashboard',
  sites: 'Site Management',
  cameras: 'Camera Management',
  routes: 'Route Builder',
  checklists: 'Checklist Templates',
  users: 'User Management',
  patrol: 'Run Patrol',
  reports: 'Reports',
  settings: 'Settings',
}

const builtPages: Page[] = [
  'dashboard',
  'users',
  'sites',
  'routes',
  'checklists',
  'patrol',
  'cameras'
]

function Shell() {
  const { user, logout } = useAuth()
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [collapsed, setCollapsed] = useState(false)

  if (!user) return null

  const visibleNav = navigation.filter((item) => item.roles.includes(user.role))

  const roleLabel =
    user.role === 'ADMIN'
      ? 'System Administrator'
      : user.role === 'OPERATOR'
        ? 'Security Officer'
        : 'Client Viewer'

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="brand">
          <div className="brand-icon">
            <img src="/logo.png" alt="A-Force" className="brand-logo" />
            </div>
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
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">
                <item.icon />
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
              title={collapsed ? 'Settings' : undefined}
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
            title={collapsed ? 'Logout' : undefined}
          >
            <span className="nav-icon">
              <LogOut />
            </span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Virtual Patrol /</p>
            <h2>{pageTitles[activePage]}</h2>
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
          {activePage === 'dashboard' && (
            <>
              <div className="welcome">
                <div>
                  <h3>Welcome back, {user.fullName} 👋</h3>
                  <p>
                    Monitor and manage your virtual patrol operations from here.
                  </p>
                </div>
                <div className="status">
                  <span className="status-dot"></span>
                  System Online
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Active Cameras</span>
                  <strong>10</strong>
                  <span className="stat-description">Cameras currently online</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Active Patrols</span>
                  <strong>8</strong>
                  <span className="stat-description">Patrols currently active</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Open Issues</span>
                  <strong>5</strong>
                  <span className="stat-description">Require attention</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Today's Reports</span>
                  <strong>12</strong>
                  <span className="stat-description">Generated today</span>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="panel">
                  <div className="panel-header">
                    <h3>System Overview</h3>
                    <span>Today</span>
                  </div>
                  <div className="overview-list">
                    <div>
                      <span>Camera Monitoring</span>
                      <strong className="online">Online</strong>
                    </div>
                    <div>
                      <span>Patrol Monitoring</span>
                      <strong className="online">Active</strong>
                    </div>
                    <div>
                      <span>Alert System</span>
                      <strong className="online">Operational</strong>
                    </div>
                    <div>
                      <span>Database</span>
                      <strong className="online">Connected</strong>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <h3>Recent Activity</h3>
                    <span>View all</span>
                  </div>
                  <div className="activity">
                    <div className="activity-item">
                      <span className="activity-dot"></span>
                      <div>
                        <strong>System started</strong>
                        <p>Virtual Patrol system is online</p>
                      </div>
                    </div>
                    <div className="activity-item">
                      <span className="activity-dot"></span>
                      <div>
                        <strong>Database connected</strong>
                        <p>PostgreSQL connection established</p>
                      </div>
                    </div>
                    <div className="activity-item">
                      <span className="activity-dot"></span>
                      <div>
                        <strong>Monitoring active</strong>
                        <p>Camera monitoring is ready</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          
          {activePage === 'users' && <Users />}
          {activePage === 'sites' && <Sites />}
          {activePage === 'cameras' && <Cameras />}
          {activePage === 'routes' && <RoutesPage />}
          {activePage === 'checklists' && <Checklists />}
          {activePage === 'patrol' && <Patrol />}

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
