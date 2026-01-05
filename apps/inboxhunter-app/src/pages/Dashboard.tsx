import { useRef, useEffect, useState, useCallback } from 'react'
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Terminal,
  ExternalLink,
  Loader2,
  RefreshCw,
  TrendingUp,
  AlertCircle
} from 'lucide-react'
import { useAppStore } from '../hooks/useAppStore'
import { useTheme } from '../hooks/useTheme'
import { motion } from 'framer-motion'

interface DashboardProps {
  onViewLogs?: () => void
}

interface ProcessedStats {
  total: number
  successful: number
  failed: number
  skipped: number
}

export function Dashboard({ onViewLogs }: DashboardProps) {
  const { isRunning, logs } = useAppStore()
  const { resolvedTheme } = useTheme()
  const logContainerRef = useRef<HTMLDivElement>(null)
  const [dbStats, setDbStats] = useState<ProcessedStats>({ total: 0, successful: 0, failed: 0, skipped: 0 })
  const [refreshing, setRefreshing] = useState(false)

  const isDark = resolvedTheme === 'dark'

  // Fetch stats from database
  const fetchStats = useCallback(async () => {
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const stats = await invoke('get_processed_stats') as ProcessedStats
        setDbStats(stats)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }, [])

  // Fetch on mount and when bot stops
  useEffect(() => {
    fetchStats()
  }, [fetchStats, isRunning])

  // Auto-refresh stats every 2 seconds while running (faster updates)
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
      // Check if the log indicates a completed action
      const triggerKeywords = ['✅', '❌', '⏭️', 'success', 'failed', 'skipped', 'Saved', 'Found']
      if (triggerKeywords.some(kw => lastLog.message.includes(kw))) {
        fetchStats()
      }
    }
  }, [logs.length, fetchStats])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchStats()
    setRefreshing(false)
  }

  // Get recent logs for the mini console
  const recentLogs = logs.slice(-30)

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success':
        return isDark ? 'text-emerald-400' : 'text-emerald-600'
      case 'error':
        return isDark ? 'text-red-400' : 'text-red-600'
      case 'warning':
        return isDark ? 'text-amber-400' : 'text-amber-600'
      case 'debug':
        return isDark ? 'text-purple-400' : 'text-purple-600'
      default:
        return isDark ? 'text-blue-400' : 'text-blue-600'
    }
  }

  const successRate = dbStats.total > 0 
    ? Math.round((dbStats.successful / dbStats.total) * 100) 
    : 0

  return (
    <div className="space-y-4">
      {/* Compact Stats Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          {/* Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
            isRunning 
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
              : 'bg-muted text-muted-foreground'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
            }`} />
            {isRunning ? 'Running' : 'Stopped'}
          </div>

          {/* Inline Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-blue-600 dark:text-blue-400 font-semibold">{dbStats.total}</span>
              <span className="text-muted-foreground">total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{dbStats.successful}</span>
              <span className="text-muted-foreground">success</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-red-600 dark:text-red-400 font-semibold">{dbStats.failed}</span>
              <span className="text-muted-foreground">failed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span className="text-orange-600 dark:text-orange-400 font-semibold">{dbStats.skipped}</span>
              <span className="text-muted-foreground">skipped</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{successRate}%</span>
              <span className="text-muted-foreground">rate</span>
            </div>
          </div>
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Refresh stats from database"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Live Console - Main Focus */}
      <div className={`rounded-xl border border-border overflow-hidden flex-1 ${
        isDark ? 'bg-[#0d1117]' : 'bg-slate-50'
      }`}>
        {/* Console Header */}
        <div className={`flex items-center justify-between px-4 py-2 border-b border-border ${
          isDark ? 'bg-[#161b22]' : 'bg-slate-100'
        }`}>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium text-sm text-foreground">Live Console</span>
            {isRunning && (
              <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                Active
              </div>
            )}
          </div>
          {onViewLogs && (
            <button
              onClick={onViewLogs}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Full Logs
            </button>
          )}
        </div>
        
        {/* Console Content */}
        <div 
          ref={logContainerRef}
          className="h-[calc(100vh-280px)] min-h-[300px] overflow-auto font-mono text-xs p-3 scrollbar-thin scrollbar-thumb-gray-400/30 dark:scrollbar-thumb-white/10 scrollbar-track-transparent"
        >
          {recentLogs.length > 0 ? (
            <div className="space-y-0.5">
              {recentLogs.map((log, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start gap-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/5 px-1 -mx-1 rounded"
                >
                  <span className="text-muted-foreground/50 shrink-0 w-14 text-[10px]">{log.timestamp.split(' ')[0]}</span>
                  <span className={`${getLogColor(log.level)} whitespace-pre-wrap break-words leading-relaxed`}>
                    {log.message}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50">
              <Terminal className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Ready to start</p>
              <p className="text-xs mt-1">Click "Start Bot" to begin automation</p>
            </div>
          )}
        </div>
        
        {/* Console Footer */}
        <div className={`flex items-center gap-4 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground ${
          isDark ? 'bg-[#161b22]' : 'bg-slate-100'
        }`}>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            {logs.filter(l => l.level === 'success').length}
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400" />
            {logs.filter(l => l.level === 'error').length}
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
            {logs.filter(l => l.level === 'warning').length}
          </span>
          <span className="ml-auto">{logs.length} entries</span>
        </div>
      </div>
    </div>
  )
}
