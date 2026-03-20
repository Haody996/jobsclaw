import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isAuthenticated } from './lib/auth'
import Layout from './components/ui/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Matches from './pages/Matches'
import Profile from './pages/Profile'
import Applications from './pages/Applications'
import Info from './pages/Info'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ backgroundLocation: { pathname: '/' } }} replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const location = useLocation()
  const background = (location.state as any)?.backgroundLocation

  return (
    <>
      {/* Main app — renders the background page when a modal is open */}
      <Routes location={background ?? location}>
        <Route path="/info" element={<Info />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="matches" element={<PrivateRoute><Matches /></PrivateRoute>} />
          <Route path="profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="applications" element={<PrivateRoute><Applications /></PrivateRoute>} />
        </Route>
        {/* Direct /login or /register with no background → redirect to home */}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Modal overlay routes — only active when backgroundLocation is set */}
      {background && (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      )}
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
