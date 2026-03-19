import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Search, FileText, User, LogOut, LogIn, Sparkles } from 'lucide-react'
import { clearAuth, isAuthenticated } from '../../lib/auth'

const navItems = [
  { to: '/matches', label: 'AI Matches', icon: Sparkles },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/jobs', label: 'Find Jobs', icon: Search },
  { to: '/applications', label: 'Applications', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
]

// Crab claw overlaying a suitcase
function JobsClawIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Briefcase body */}
      <rect x="2" y="13" width="20" height="9" rx="2" fill="#4f46e5" />
      {/* Briefcase handle */}
      <path d="M9 13V11.5C9 10.4 9.9 9.5 11 9.5H13C14.1 9.5 15 10.4 15 11.5V13" stroke="#6366f1" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
      {/* Briefcase centre stripe */}
      <line x1="2" y1="17.5" x2="22" y2="17.5" stroke="#a5b4fc" strokeWidth="1" />
      {/* Clasp */}
      <rect x="10.8" y="16" width="2.4" height="3" rx="0.6" fill="#c7d2fe" />

      {/* Crab claw — lower pincer (fixed jaw) */}
      <path
        d="M5 13 C4 11 3.5 9 5 7.5 C6 6.5 7.5 6.8 8 8 C8.5 9 8 10.5 7.5 12"
        stroke="#3730a3" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      {/* Crab claw — upper pincer (moving jaw) */}
      <path
        d="M5 13 C4.5 11.5 5 9.5 7 8.5 C8.5 7.8 9.5 8.5 9.5 10 C9.5 11.2 8.5 12 7.5 12"
        stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      {/* Claw tip nip point */}
      <circle cx="7.5" cy="12" r="0.8" fill="#818cf8" />

      {/* Crab claw arm connecting to suitcase top-left */}
      <path
        d="M5 13 C5.5 13 6 13 7 13"
        stroke="#3730a3" strokeWidth="2" strokeLinecap="round" fill="none"
      />

      {/* Second (right) crab claw — lower pincer */}
      <path
        d="M19 13 C20 11 20.5 9 19 7.5 C18 6.5 16.5 6.8 16 8 C15.5 9 16 10.5 16.5 12"
        stroke="#3730a3" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      {/* Second claw — upper pincer */}
      <path
        d="M19 13 C19.5 11.5 19 9.5 17 8.5 C15.5 7.8 14.5 8.5 14.5 10 C14.5 11.2 15.5 12 16.5 12"
        stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      {/* Right claw tip */}
      <circle cx="16.5" cy="12" r="0.8" fill="#818cf8" />
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
