'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DashboardView } from '@/components/views/dashboard-view'
import { PorView } from '@/components/views/por-view'
import { ZakatView } from '@/components/views/zakat-view'
import { RedemptionView } from '@/components/views/redemption-view'
import { ShariaView } from '@/components/views/sharia-view'
import { useAPAXStore } from '@/lib/store'
import { holdingsApi } from '@/lib/services/holdings.api'
import { ApiError } from '@/lib/services/base.api'
import { clearSession, getToken, SESSION_EVENT, TOKEN_KEY } from '@/lib/session'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  const { activeView, addAuditLog, userHoldings } = useAPAXStore()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const onSessionChange = () => {
      setStatus('loading')
      if (!getToken()) router.replace('/login')
      setAttempt(value => value + 1)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY || event.key === null) {
        useAPAXStore.getState().clearSession()
        onSessionChange()
      }
    }
    window.addEventListener(SESSION_EVENT, onSessionChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SESSION_EVENT, onSessionChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [router])

  useEffect(() => {
    const token = getToken()
    useAPAXStore.getState().clearPersonalHoldings()
    setStatus('loading')
    setError('')
    if (!token) {
      useAPAXStore.getState().clearSession()
      router.replace('/login')
      return
    }
    const controller = new AbortController()
    void holdingsApi(controller.signal).then(({ holdings }) => {
      if (controller.signal.aborted || getToken() !== token) return
      useAPAXStore.getState().setUserHoldings({
        goldGrams: holdings.gold, silverGrams: holdings.silver,
        platinumGrams: holdings.platinum, apxiTokens: 0
      })
      setStatus('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted || getToken() !== token) return
      if (error instanceof ApiError && error.status === 401) {
        clearSession()
        router.replace('/login')
      } else {
        setError(error instanceof ApiError ? error.message : 'Unable to load portfolio holdings.')
        setStatus('error')
      }
    })
    return () => controller.abort()
  }, [router, attempt])

  // Demo price simulation only; not a production market feed.
  useEffect(() => {
    const interval = setInterval(() => {
      useAPAXStore.setState((state) => ({
        metalPrices: {
          gold: state.metalPrices.gold + (Math.random() - 0.5) * 2,
          silver: state.metalPrices.silver + (Math.random() - 0.5) * 0.1,
          platinum: state.metalPrices.platinum + (Math.random() - 0.5) * 1,
          lastUpdated: new Date()
        }
      }))
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // Simulate occasional audit log events
  useEffect(() => {
    const events = [
      'Vault Verification',
      'Token Mint',
      'Reserve Audit',
      'Price Oracle Update',
      'Compliance Check'
    ]
    
    const interval = setInterval(() => {
      const event = events[Math.floor(Math.random() * events.length)]
      addAuditLog({
        id: Date.now().toString(),
        timestamp: new Date(),
        event,
        details: `Automated ${event.toLowerCase()} completed`,
        txHash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`
      })
    }, 30000) // Every 30 seconds

    return () => clearInterval(interval)
  }, [addAuditLog])

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />
      case 'por':
        return <PorView />
      case 'zakat':
        return <ZakatView />
      case 'redemption':
        return <RedemptionView />
      case 'sharia':
        return <ShariaView />
      default:
        return <DashboardView />
    }
  }

  return (
    <DashboardLayout>
      {status === 'loading' && <div role="status" className="glass rounded-lg p-8 text-[#C0C0C0]">Loading portfolio holdings…</div>}
      {status === 'error' && <div className="glass rounded-lg p-8 space-y-4">
        <p role="alert" className="text-red-400">Unable to load portfolio holdings. {error}</p>
        <Button onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>Retry</Button>
      </div>}
      {status === 'ready' && <>
        <p className="text-xs text-[#888888] mb-4">Personal metal holdings are loaded from your account. Prices and valuations use demo data.</p>
        {userHoldings.goldGrams === 0 && userHoldings.silverGrams === 0 && userHoldings.platinumGrams === 0 &&
          <p role="status" className="glass rounded-lg p-4 mb-4 text-[#C0C0C0]">No metal holdings yet.</p>}
        {renderView()}
      </>}
    </DashboardLayout>
  )
}
