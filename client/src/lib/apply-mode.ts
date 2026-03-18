import { useState } from 'react'

export type ApplyMode = 'auto' | 'tab'

const KEY = 'jobsclaw_mode'

export function useApplyMode() {
  const [mode, setModeState] = useState<ApplyMode>(() => {
    return (localStorage.getItem(KEY) as ApplyMode) || 'auto'
  })

  function setMode(m: ApplyMode) {
    localStorage.setItem(KEY, m)
    setModeState(m)
  }

  return { mode, setMode }
}

export function getApplyMode(): ApplyMode {
  return (localStorage.getItem(KEY) as ApplyMode) || 'auto'
}
