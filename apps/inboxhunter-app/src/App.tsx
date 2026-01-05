import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Home, 
  Settings, 
  Database, 
  Play, 
  Square, 
  BarChart3,
  ScrollText,
  Sun,
  Moon,
  Monitor,
  Globe,
  RefreshCw,
  Download,
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react'
import { Dashboard } from './pages/Dashboard'
import { SettingsPage } from './pages/Settings'
import { LogsPage } from './pages/Logs'
import { DatabasePage } from './pages/Database'
import { useAppStore } from './hooks/useAppStore'
import { useTheme } from './hooks/useTheme'

interface ProcessedStats {
  total: number
  successful: number
  failed: number
  skipped: number
}

interface ScrapedStats {
  total: number
  processed: number
  pending: number
}

type Tab = 'dashboard' | 'database' | 'settings' | 'logs'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [showMenu, setShowMenu] = useState(false)

  const themes = [
    { id: 'light' as const, icon: Sun, label: 'Light' },
    { id: 'dark' as const, icon: Moon, label: 'Dark' },
    { id: 'system' as const, icon: Monitor, label: 'System' },
  ]

  const currentTheme = themes.find(t => t.id === theme) || themes[1]
  const Icon = currentTheme.icon

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title={`Theme: ${currentTheme.label}`}
      >
        <Icon className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {showMenu && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowMenu(false)}
            />
            
            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-36 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden"
            >
              {themes.map((t) => {
                const ThemeIcon = t.icon
                const isActive = theme === t.id
                
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id)
                      setShowMenu(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                      isActive 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <ThemeIcon className="w-4 h-4" />
                    {t.label}
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const { 
    isRunning, startBot, stopBot, logs, dbVersion,
    updateState, setUpdateState, addUpdateLog, openUpdateModal, closeUpdateModal 
  } = useAppStore()
  const [processedStats, setProcessedStats] = useState<ProcessedStats>({ total: 0, successful: 0, failed: 0, skipped: 0 })
  const [scrapedStats, setScrapedStats] = useState<ScrapedStats>({ total: 0, processed: 0, pending: 0 })
  const [refreshing, setRefreshing] = useState(false)
  const [showUpdateBanner, setShowUpdateBanner] = useState(true)
  const updateUnlistenRef = useRef<(() => void) | null>(null)
  
  // Check for updates on app start
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        // @ts-ignore
        if (window.__TAURI__) {
          const { checkUpdate, installUpdate, onUpdaterEvent } = await import('@tauri-apps/api/updater')
          const { relaunch } = await import('@tauri-apps/api/process')
          
          // Listen to updater events and log them with detailed info
          const unlisten = await onUpdaterEvent((event) => {
            const status = event.status as string
            const timestamp = new Date().toLocaleTimeString()
            console.log(`[${timestamp}] [Updater Event] Status: ${status}`, event.error || '')
            
            if (status === 'PENDING') {
              setUpdateState({ status: 'downloading' })
              addUpdateLog('📋 Update pending - preparing download...', 'info')
              addUpdateLog('→ Connecting to update server...', 'info')
            } else if (status === 'DOWNLOADING') {
              setUpdateState({ status: 'downloading' })
              addUpdateLog('⬇️ Download started!', 'info')
              addUpdateLog('→ Downloading update package (~100MB)...', 'info')
              addUpdateLog('→ Note: Tauri downloads in background (no % available)', 'info')
            } else if (status === 'DOWNLOADED') {
              setUpdateState({ status: 'downloaded' })
              addUpdateLog('✅ Download complete!', 'success')
              addUpdateLog('→ Update package verified successfully', 'success')
              addUpdateLog('→ Ready to install...', 'info')
            } else if (status === 'ERROR') {
              const errorMsg = event.error || 'Unknown error occurred'
              setUpdateState({ status: 'error', error: errorMsg })
              addUpdateLog(`❌ Error: ${errorMsg}`, 'error')
            } else {
              // Log any unknown events for debugging
              addUpdateLog(`📡 Event: ${status}`, 'info')
            }
          })
          
          updateUnlistenRef.current = unlisten
          
          // Store functions for later use
          // @ts-ignore
          window.__UPDATE_FUNCTIONS__ = { installUpdate, relaunch, checkUpdate }
          
          // Check for updates
          const update = await checkUpdate()
          if (update.shouldUpdate && update.manifest) {
            setUpdateState({
              status: 'available',
              version: update.manifest.version,
              error: null,
              progress: 0
            })
            console.log('[Update] Update available:', update.manifest.version)
          }
        }
      } catch (error: any) {
        console.log('[Update] Update check failed:', error)
      }
    }
    
    // Check for updates after a short delay
    const timer = setTimeout(checkForUpdates, 2000)
    return () => {
      clearTimeout(timer)
      if (updateUnlistenRef.current) {
        updateUnlistenRef.current()
      }
    }
  }, [setUpdateState, addUpdateLog])

  // Track download time for timeout warnings and elapsed timer
  const downloadStartTimeRef = useRef<number | null>(null)
  const downloadWarningShownRef = useRef(false)
  const [downloadElapsed, setDownloadElapsed] = useState(0)

  // Elapsed time counter with milestone logs
  useEffect(() => {
    if (updateState.status === 'downloading' && updateState.showModal) {
      downloadStartTimeRef.current = Date.now()
      downloadWarningShownRef.current = false
      setDownloadElapsed(0)
      
      // Track which milestones we've logged
      const loggedMilestones = new Set<number>()
      
      // Update elapsed time every second
      const interval = setInterval(() => {
        if (downloadStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - downloadStartTimeRef.current) / 1000)
          setDownloadElapsed(elapsed)
          
          // Log time milestones
          const milestones = [30, 60, 120, 180, 240, 300]
          for (const milestone of milestones) {
            if (elapsed >= milestone && !loggedMilestones.has(milestone)) {
              loggedMilestones.add(milestone)
              const mins = Math.floor(milestone / 60)
              const secs = milestone % 60
              const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
              addUpdateLog(`⏱️ ${timeStr} elapsed - download still in progress...`, 'info')
            }
          }
        }
      }, 1000)
      
      return () => clearInterval(interval)
    } else {
      setDownloadElapsed(0)
    }
  }, [updateState.status, updateState.showModal, addUpdateLog])

  // Format elapsed time as MM:SS
  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleStartUpdate = () => {
    openUpdateModal()
    handleInstallUpdate()
  }

  const handleInstallUpdate = async () => {
    try {
      const logStep = (step: string, type: 'info' | 'success' | 'error' = 'info') => {
        const timestamp = new Date().toLocaleTimeString()
        console.log(`[${timestamp}] [Update] ${step}`)
        addUpdateLog(step, type)
      }
      
      setUpdateState({ status: 'downloading' })
      logStep('🚀 Starting update process...')
      logStep('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
      // @ts-ignore
      if (!window.__UPDATE_FUNCTIONS__) {
        throw new Error('Update functions not initialized. Please restart the app.')
      }
      
      // @ts-ignore
      const { installUpdate, relaunch } = window.__UPDATE_FUNCTIONS__
      
      logStep('📡 Step 1: Initializing Tauri updater...')
      logStep('→ Update endpoint: S3 bucket (eu-north-1)')
      logStep('→ Expected file size: ~100MB')
      logStep('')
      logStep('📥 Step 2: Starting download...')
      logStep('→ Tauri handles download in native code')
      logStep('→ Events will appear as download progresses')
      logStep('→ This may take 2-5 minutes depending on connection')
      logStep('')
      
      // installUpdate() triggers download + verification
      // Events are emitted via onUpdaterEvent listener above
      // This promise resolves when download is complete AND verified
      await installUpdate()
      
      logStep('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      logStep('✅ Step 3: Download & verification complete!', 'success')
      logStep('→ Signature verified against embedded pubkey', 'success')
      logStep('')
      
      setUpdateState({ status: 'installing' })
      logStep('📦 Step 4: Installing update...')
      logStep('→ Extracting update package...')
      logStep('→ Replacing application files...')
      
      // Brief delay for user to see the status
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      logStep('')
      logStep('🔄 Step 5: Restarting application...')
      logStep('→ Launching new version...')
      logStep('→ Goodbye! See you in the new version 👋', 'success')
      
      await relaunch()
      
    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown error occurred'
      console.error('[Update] Failed:', errorMsg)
      
      addUpdateLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'error')
      addUpdateLog(`❌ Update failed: ${errorMsg}`, 'error')
      addUpdateLog('', 'info')
      
      // Provide helpful error context
      if (errorMsg.includes('signature') || errorMsg.includes('Verify')) {
        addUpdateLog('💡 This usually means the signing keys don\'t match.', 'info')
        addUpdateLog('→ The app\'s pubkey doesn\'t match the server\'s signature', 'info')
      } else if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('fetch')) {
        addUpdateLog('💡 Network issue detected.', 'info')
        addUpdateLog('→ Check your internet connection', 'info')
        addUpdateLog('→ The download may still be running in background', 'info')
      }
      
      setUpdateState({ status: 'error', error: errorMsg })
    }
  }

  const handleCancelUpdate = () => {
    closeUpdateModal()
  }

  const handleRetryUpdate = () => {
    setUpdateState({ error: null })
    handleInstallUpdate()
  }

  // Fetch stats from database
  const fetchStats = useCallback(async () => {
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const [processed, scraped] = await Promise.all([
          invoke('get_processed_stats') as Promise<ProcessedStats>,
          invoke('get_scraped_stats') as Promise<ScrapedStats>,
        ])
        setProcessedStats(processed)
        setScrapedStats(scraped)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }, [])

  // Initial fetch and refresh on running state change or database update
  useEffect(() => {
    fetchStats()
  }, [fetchStats, isRunning, dbVersion])

  // Auto-refresh stats every 2 seconds while bot is running (faster updates)
  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(fetchStats, 2000)
      return () => clearInterval(interval)
    }
  }, [isRunning, fetchStats])
  
  // Refresh stats when logs indicate a URL was processed (real-time updates)
  useEffect(() => {
    if (logs.length > 0) {
      const lastLog = logs[logs.length - 1]
      // Check if the log indicates a completed action (success, failed, skipped)
      const triggerKeywords = ['✅', '❌', '⏭️', 'success', 'failed', 'skipped', 'Saved', 'Found']
      if (triggerKeywords.some(kw => lastLog.message.includes(kw))) {
        // Debounce by checking if we recently fetched
        fetchStats()
      }
    }
  }, [logs.length, fetchStats])

  const handleRefreshStats = async () => {
    setRefreshing(true)
    await fetchStats()
    setTimeout(() => setRefreshing(false), 500)
  }

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Dashboard', icon: Home },
    { id: 'database' as Tab, label: 'Database', icon: Database },
    { id: 'logs' as Tab, label: 'Logs', icon: ScrollText },
    { id: 'settings' as Tab, label: 'Settings', icon: Settings },
  ]

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Update Banner */}
      <AnimatePresence>
        {updateState.status === 'available' && showUpdateBanner && !updateState.showModal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white overflow-hidden"
          >
            <div className="px-6 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Version {updateState.version} is available!
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartUpdate}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Update Now
                </button>
                <button
                  onClick={() => setShowUpdateBanner(false)}
                  className="p-1 rounded hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update Modal - Blocks App Interaction */}
      <AnimatePresence>
        {updateState.showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              // Only allow closing if not in installing state
              if (e.target === e.currentTarget && updateState.status !== 'installing') {
                handleCancelUpdate()
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Download className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Software Update</h2>
                    <p className="text-sm text-muted-foreground">
                      {updateState.version ? `Version ${updateState.version}` : 'Checking for updates...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                {/* Status Banner */}
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  updateState.status === 'error' 
                    ? 'bg-red-500/10 border border-red-500/20' 
                    : updateState.status === 'downloaded' || updateState.status === 'installing'
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-blue-500/10 border border-blue-500/20'
                }`}>
                  <div className="flex items-center gap-3">
                    {updateState.status === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    ) : updateState.status === 'downloaded' || updateState.status === 'installing' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                    )}
                    <span className={`text-sm font-medium ${
                      updateState.status === 'error' 
                        ? 'text-red-600 dark:text-red-400' 
                        : updateState.status === 'downloaded' || updateState.status === 'installing'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}>
                      {updateState.status === 'downloading' && 'Downloading update...'}
                      {updateState.status === 'downloaded' && 'Download complete!'}
                      {updateState.status === 'installing' && 'Installing update...'}
                      {updateState.status === 'error' && 'Update failed'}
                    </span>
                  </div>
                  {/* Elapsed Timer */}
                  {updateState.status === 'downloading' && downloadElapsed > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatElapsed(downloadElapsed)}
                    </span>
                  )}
                </div>

                {/* Indeterminate Progress Bar - visible during download/install */}
                {(updateState.status === 'downloading' || updateState.status === 'downloaded' || updateState.status === 'installing') && (
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    {updateState.status === 'downloaded' ? (
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 w-full" />
                    ) : (
                      <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite]" 
                           style={{ 
                             animation: 'shimmer 1.5s ease-in-out infinite',
                           }} 
                      />
                    )}
                  </div>
                )}

                {/* Live Event Log */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Activity Log
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-1">
                    {updateState.logs.length === 0 ? (
                      <div className="text-muted-foreground">Waiting for update events...</div>
                    ) : (
                      updateState.logs.map((log, index) => (
                        <div key={index} className={`flex gap-2 ${
                          log.type === 'error' ? 'text-red-500' :
                          log.type === 'success' ? 'text-emerald-500' :
                          'text-foreground'
                        }`}>
                          <span className="text-muted-foreground flex-shrink-0">[{log.timestamp}]</span>
                          <span>{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Error Details */}
                {updateState.status === 'error' && updateState.error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Error Details:</p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 font-mono break-all">
                      {updateState.error}
                    </p>
                  </div>
                )}

                {/* Helper Text */}
                <p className="text-xs text-muted-foreground">
                  {updateState.status === 'error' 
                    ? 'You can try again or close this dialog and update later from Settings.'
                    : updateState.status === 'installing'
                    ? 'The application will restart automatically. Please do not close the app.'
                    : 'Please wait while the update is being processed. Do not close the application.'}
                </p>
              </div>

              {/* Modal Footer */}
              <div className="p-6 pt-0 flex gap-3">
                {updateState.status === 'error' ? (
                  <>
                    <button
                      onClick={handleCancelUpdate}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleRetryUpdate}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Try Again
                    </button>
                  </>
                ) : updateState.status === 'installing' ? (
                  <div className="flex-1 text-center text-sm text-muted-foreground">
                    Restarting application...
                  </div>
                ) : (
                  <button
                    onClick={handleCancelUpdate}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <img 
            src="/InboxHunter-logo-icon.png" 
            alt="InboxHunter" 
            className="w-10 h-10 rounded-xl object-cover"
          />
          <div>
            <h1 className="text-lg font-semibold text-foreground">InboxHunter</h1>
            <p className="text-xs text-muted-foreground">AI Lead Generation</p>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <ThemeToggle />
          
          {/* Status Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isRunning 
              ? 'bg-emerald-500/20 text-emerald-500 dark:text-emerald-400' 
              : 'bg-muted text-muted-foreground'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
            }`} />
            {isRunning ? 'Running' : 'Stopped'}
          </div>

          {/* Start/Stop Button */}
          <button
            onClick={isRunning ? stopBot : startBot}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              isRunning
                ? 'bg-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-500/30'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {isRunning ? (
              <>
                <Square className="w-4 h-4" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Bot
              </>
            )}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <nav className="w-64 border-r border-border bg-card/30 p-4 flex flex-col">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Stats Summary */}
          <div className="mt-auto space-y-3">
            {/* Processed Stats */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Quick Stats
                </div>
                <button 
                  onClick={handleRefreshStats}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Refresh stats"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Processed</span>
                  <span className="font-medium text-foreground">{processedStats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-600 dark:text-emerald-400">Successful</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{processedStats.successful}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600 dark:text-red-400">Failed</span>
                  <span className="font-medium text-red-600 dark:text-red-400">{processedStats.failed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-orange-600 dark:text-orange-400">Skipped</span>
                  <span className="font-medium text-orange-600 dark:text-orange-400">{processedStats.skipped}</span>
                </div>
              </div>
            </div>

            {/* Scraped URLs Stats */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Globe className="w-4 h-4" />
                Scraped URLs
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium text-foreground">{scrapedStats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-600 dark:text-amber-400">Pending</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{scrapedStats.pending}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-600 dark:text-emerald-400">Processed</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{scrapedStats.processed}</span>
                </div>
              </div>
            </div>

            {/* AI Status */}
            {/* <div className="p-4 rounded-lg border border-border/50 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-foreground">AI Agent</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span className="text-xs text-muted-foreground">GPT-4o Vision Ready</span>
              </div>
            </div> */}
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-auto p-6"
            >
              {activeTab === 'dashboard' && <Dashboard onViewLogs={() => setActiveTab('logs')} />}
              {activeTab === 'database' && <DatabasePage />}
              {activeTab === 'settings' && <SettingsPage />}
              {activeTab === 'logs' && <LogsPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

export default App
