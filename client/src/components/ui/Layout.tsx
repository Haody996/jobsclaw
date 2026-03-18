import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Search, FileText, User, LogOut, LogIn, Briefcase } from 'lucide-react'
import { clearAuth, isAuthenticated } from '../../lib/auth'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/jobs', label: 'Find Jobs', icon: Search },
  { to: '/applications', label: 'Applications', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
]

export default function Layout() {
  const navigate = useNavigate()
  const authed = isAuthenticated()

  function handleLogout() {
    clearAuth()
    navigate('/')
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
            <Briefcase className="w-6 h-6 text-indigo-600" />
            <span className="font-bold text-xl text-slate-900">AutoApply</span>
          </button>
          <p className="text-xs text-slate-500 mt-1">Job Application Assistant</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200">
          {authed ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
