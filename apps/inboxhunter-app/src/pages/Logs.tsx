import { useRef, useEffect } from 'react'
import { 
  Trash2, 
  Download, 
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Bug
} from 'lucide-react'
import { useAppStore } from '../hooks/useAppStore'
import { useTheme } from '../hooks/useTheme'
import { motion } from 'framer-motion'

export function LogsPage() {
  const { logs, clearLogs, addLog } = useAppStore()
  const { resolvedTheme } = useTheme()
  const logContainerRef = useRef<HTMLDivElement>(null)

  const isDark = resolvedTheme === 'dark'

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  const getLogIcon = (level: string) => {
    const iconClass = isDark ? {
      success: 'text-emerald-400',
      error: 'text-red-400',
      warning: 'text-amber-400',
      debug: 'text-purple-400',
      info: 'text-blue-400',
    } : {
      success: 'text-emerald-600',
      error: 'text-red-600',
      warning: 'text-amber-600',
      debug: 'text-purple-600',
      info: 'text-blue-600',
    }

    switch (level) {
      case 'success':
        return <CheckCircle2 className={`w-4 h-4 ${iconClass.success}`} />
      case 'error':
        return <XCircle className={`w-4 h-4 ${iconClass.error}`} />
      case 'warning':
        return <AlertTriangle className={`w-4 h-4 ${iconClass.warning}`} />
      case 'debug':
        return <Bug className={`w-4 h-4 ${iconClass.debug}`} />
      default:
        return <Info className={`w-4 h-4 ${iconClass.info}`} />
    }
  }

  const getLogColor = (level: string) => {
    if (isDark) {
      switch (level) {
        case 'success': return 'text-emerald-400'
        case 'error': return 'text-red-400'
        case 'warning': return 'text-amber-400'
        case 'debug': return 'text-purple-400'
        default: return 'text-blue-400'
      }
    } else {
      switch (level) {
        case 'success': return 'text-emerald-600'
        case 'error': return 'text-red-600'
        case 'warning': return 'text-amber-600'
        case 'debug': return 'text-purple-600'
        default: return 'text-blue-600'
      }
    }
  }

  const handleCopyLogs = () => {
    const logText = logs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n')
    navigator.clipboard.writeText(logText)
    addLog('info', '📋 Logs copied to clipboard')
  }

  const handleExportLogs = () => {
    const logText = logs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n')
    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inboxhunter-logs-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
    addLog('info', '📥 Logs exported successfully')
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Logs</h2>
          <p className="text-muted-foreground">View automation activity and debug information</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
          <button
            onClick={handleExportLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      {/* Log Container */}
      <div 
        ref={logContainerRef}
        className={`flex-1 rounded-xl border border-border overflow-auto font-mono text-sm ${
          isDark ? 'bg-[#0d1117]' : 'bg-slate-50'
        }`}
      >
        {logs.length > 0 ? (
          <div className="p-4 space-y-1">
            {logs.map((log, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-3 py-1.5 group hover:bg-black/5 dark:hover:bg-white/5 px-2 -mx-2 rounded"
              >
                <span className="text-muted-foreground shrink-0 text-xs">{log.timestamp}</span>
                <span className="shrink-0 mt-0.5">{getLogIcon(log.level)}</span>
                <span className={`${getLogColor(log.level)} whitespace-pre-wrap break-words select-text flex-1`}>
                  {log.message}
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No logs yet</p>
              <p className="text-sm">Activity will appear here when the bot starts</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
          <span>Success: {logs.filter(l => l.level === 'success').length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
          <span>Errors: {logs.filter(l => l.level === 'error').length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
          <span>Warnings: {logs.filter(l => l.level === 'warning').length}</span>
        </div>
        <div className="ml-auto">
          Total: {logs.length} entries
        </div>
      </div>
    </div>
  )
}
