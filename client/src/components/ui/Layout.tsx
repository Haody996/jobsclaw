import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, User, LogOut, LogIn, Sparkles, Menu, X, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { clearAuth, isAuthenticated, isAdmin } from '../../lib/auth'
import HelpButton from './HelpButton'

const navItems = [
  { to: '/matches', label: 'AI Matches', icon: Sparkles, exact: false },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: false },
  { to: '/profile', label: 'Profile', icon: User, exact: false },
]

const adminNavItems = [
  { to: '/applications', label: 'Applications', icon: FileText, exact: false },
  { to: '/admin', label: 'Admin', icon: ShieldCheck, exact: false },
]

function JobsClawIcon({ className }: { className?: string }) {
  return <img src="/icon.png" alt="JobsClaw" className={className} />
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const authed = isAuthenticated()
  const admin = isAdmin()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const allNavItems = admin ? [...navItems, ...adminNavItems] : navItems

  function openLogin() {
    navigate('/login', { state: { backgroundLocation: location } })
  }

  function handleLogout() {
    clearAuth()
    navigate('/matches')
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'} rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  function NavIcon({ to, icon: Icon, isActive }: { to: string; icon: typeof Sparkles; isActive: boolean }) {
    if (to === '/matches') {
      return (
        <span style={{ filter: `drop-shadow(0 0 ${isActive ? '6px' : '3px'} rgba(167,139,250,${isActive ? '1' : '0.65'}))` }}>
          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-amber-300' : 'text-violet-400'}`} />
        </span>
      )
    }
    return <Icon className="w-4 h-4 flex-shrink-0" />
  }

  return (
    <div className="flex h-screen bg-slate-50">

      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden md:flex bg-white border-r border-slate-200 shadow-[1px_0_20px_rgba(0,0,0,0.05)] flex-col flex-shrink-0 transition-all duration-300 overflow-hidden ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Logo / header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-4 min-h-[64px]">
          <button
            onClick={() => navigate('/matches')}
            className={`flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer min-w-0 ${collapsed ? 'mx-auto' : ''}`}
          >
            <JobsClawIcon className="w-7 h-7 flex-shrink-0" />
            {!collapsed && <span className="font-bold text-xl text-slate-900 truncate">JobsClaw</span>}
          </button>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="flex-shrink-0 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-150 ml-1"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-150"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-4'} space-y-1 overflow-y-auto`}>
          {allNavItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact} className={navLinkClass} title={collapsed ? label : undefined}>
              {({ isActive }) => (
                <>
                  <NavIcon to={to} icon={Icon} isActive={isActive} />
                  {!collapsed && label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-slate-200`}>
          {authed ? (
            <button
              onClick={handleLogout}
              title={collapsed ? 'Sign Out' : undefined}
              className={`flex items-center ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'} w-full rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-150`}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!collapsed && 'Sign Out'}
            </button>
          ) : (
            <button
              onClick={openLogin}
              title={collapsed ? 'Sign In' : undefined}
              className={`flex items-center ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'} w-full rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150`}
            >
              <LogIn className="w-4 h-4 flex-shrink-0" />
              {!collapsed && 'Sign In'}
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
              <button onClick={() => { navigate('/matches'); setMobileOpen(false) }} className="flex items-center gap-2">
                <JobsClawIcon className="w-7 h-7" />
                <span className="font-bold text-xl text-slate-900">JobsClaw</span>
              </button>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              {allNavItems.map(({ to, label, icon: Icon, exact }) => (
                <NavLink key={to} to={to} end={exact} className={mobileLinkClass} onClick={() => setMobileOpen(false)}>
                  {({ isActive }) => (
                    <>
                      <NavIcon to={to} icon={Icon} isActive={isActive} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-slate-200">
              {authed ? (
                <button onClick={() => { handleLogout(); setMobileOpen(false) }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-150">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              ) : (
                <button onClick={() => { openLogin(); setMobileOpen(false) }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150">
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
          <button onClick={() => navigate('/matches')} className="flex items-center gap-2">
            <JobsClawIcon className="w-6 h-6" />
            <span className="font-bold text-lg text-slate-900">JobsClaw</span>
          </button>
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
          <HelpButton />
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-30">
          {allNavItems.map(({ to, label, icon: Icon, exact }) => (
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
                  {to === '/matches' ? (
                    <span style={{ filter: `drop-shadow(0 0 ${isActive ? '5px' : '2px'} rgba(167,139,250,${isActive ? '0.9' : '0.55'}))` }}>
                      <Icon className={`w-5 h-5 ${isActive ? 'text-amber-400' : 'text-violet-400'}`} />
                    </span>
                  ) : (
                    <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  )}
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
