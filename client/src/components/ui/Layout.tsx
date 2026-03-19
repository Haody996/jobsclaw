import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Search, FileText, User, LogOut, LogIn, Sparkles } from 'lucide-react'
import { clearAuth, isAuthenticated } from '../../lib/auth'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/jobs', label: 'Find Jobs', icon: Search },
  { to: '/matches', label: 'AI Matches', icon: Sparkles },
  { to: '/applications', label: 'Applications', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
]

// Claw + briefcase SVG icon
function JobsClawIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Briefcase body */}
      <rect x="3" y="10" width="18" height="11" rx="2" fill="#4f46e5" />
      <rect x="8" y="7.5" width="8" height="3.5" rx="1.5" stroke="#4f46e5" strokeWidth="1.8" fill="none" />
      <line x1="3" y1="15" x2="21" y2="15" stroke="#c7d2fe" strokeWidth="1.2" />
      {/* Claw marks */}
      <path d="M9 4 C9 2 11 1.5 11 3.5" stroke="#818cf8" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M12 3.5 C12 1.5 14 1 14 3" stroke="#818cf8" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M15 4 C15 2 17 2 16.5 4" stroke="#818cf8" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

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
            <JobsClawIcon className="w-7 h-7" />
            <span className="font-bold text-xl text-slate-900">JobsClaw</span>
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
