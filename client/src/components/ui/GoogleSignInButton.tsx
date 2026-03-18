import { GoogleLogin } from '@react-oauth/google'
import type { CredentialResponse } from '@react-oauth/google'
import api from '../../lib/api'
import { setToken, setUser } from '../../lib/auth'

interface Props {
  onSuccess: () => void
  onError: (msg: string) => void
}

export default function GoogleSignInButton({ onSuccess, onError }: Props) {
  async function handleCredential(response: CredentialResponse) {
    if (!response.credential) return
    try {
      const { data } = await api.post('/auth/google', { credential: response.credential })
      setToken(data.token)
      setUser(data.user)
      onSuccess()
    } catch (err: any) {
      onError(err.response?.data?.error || 'Google sign-in failed')
    }
  }

  return (
    <div className="w-full">
      <div className="relative flex items-center my-5">
        <div className="flex-1 border-t border-slate-200" />
        <span className="px-3 text-xs text-slate-400">or continue with</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>
      <div className="flex justify-center">
        <GoogleLogin
          onSuccess={handleCredential}
          onError={() => onError('Google sign-in failed')}
          width="368"
          shape="rectangular"
          theme="outline"
          text="continue_with"
        />
      </div>
    </div>
  )
}
