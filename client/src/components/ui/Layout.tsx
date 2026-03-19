import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Search, FileText, User, LogOut, LogIn, Sparkles, Menu, X } from 'lucide-react'
import { clearAuth, isAuthenticated } from '../../lib/auth'

const navItems = [
  { to: '/matches', label: 'AI Matches', icon: Sparkles },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/jobs', label: 'Find Jobs', icon: Search },
  { to: '/applications', label: 'Applications', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
]

function JobsClawIcon({ className }: { className?: string }) {
  return <img src="/icon.png" alt="JobsClaw" className={className} />
}

export default function Layout() {
  const navigate = useNavigate()
  const authed = isAuthenticated()
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleLogout() {
    clearAuth()
    navigate('/')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  return (
    <div className="flex h-screen bg-slate-50">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-200">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
            <JobsClawIcon className="w-7 h-7" />
            <span className="font-bold text-xl text-slate-900">JobsClaw</span>
          </button>
          <p className="text-xs text-slate-500 mt-1">Job Application Assistant</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact} className={navLinkClass}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200">
          {authed ? (
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <button onClick={() => navigate('/login')} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <button onClick={() => { navigate('/'); setMobileOpen(false) }} className="flex items-center gap-2">
                <JobsClawIcon className="w-7 h-7" />
                <span className="font-bold text-xl text-slate-900">JobsClaw</span>
              </button>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              {navItems.map(({ to, label, icon: Icon, exact }) => (
                <NavLink key={to} to={to} end={exact} className={navLinkClass} onClick={() => setMobileOpen(false)}>
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-slate-200">
              {authed ? (
                <button onClick={() => { handleLogout(); setMobileOpen(false) }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              ) : (
                <button onClick={() => { navigate('/login'); setMobileOpen(false) }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="text-slate-600 hover:text-slate-900">
            <Menu className="w-5 h-5" />
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <JobsClawIcon className="w-6 h-6" />
            <span className="font-bold text-lg text-slate-900">JobsClaw</span>
          </button>
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-30">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-slate-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="leading-tight">{label.split(' ')[0]}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
