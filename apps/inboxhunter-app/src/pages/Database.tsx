import { useState, useEffect, useCallback } from 'react'
import {
  Database,
  RefreshCw,
  Trash2,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Layers,
  Globe,
  RotateCw
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../hooks/useAppStore'

interface ProcessedURL {
  id: number
  url: string
  source: string
  status: string
  fields_filled: string | null
  error_message: string | null
  processed_at: string
}

interface ScrapedURL {
  id: number
  url: string
  ad_id: string | null
  advertiser: string | null
  scraped_at: string
  processed: boolean
}

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

type Tab = 'processed' | 'scraped'

export function DatabasePage() {
  const [activeTab, setActiveTab] = useState<Tab>('processed')
  
  // Processed URLs state
  const [processedUrls, setProcessedUrls] = useState<ProcessedURL[]>([])
  const [processedStats, setProcessedStats] = useState<ProcessedStats | null>(null)
  
  // Scraped URLs state
  const [scrapedUrls, setScrapedUrls] = useState<ScrapedURL[]>([])
  const [scrapedStats, setScrapedStats] = useState<ScrapedStats | null>(null)
  
  // Common state
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number | 'all'; table: Tab } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  
  const { addLog, isRunning, logs, triggerDbRefresh } = useAppStore()
  const itemsPerPage = 25
  const [togglingStatus, setTogglingStatus] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const [
          processedData,
          processedStatsData,
          scrapedData,
          scrapedStatsData
        ] = await Promise.all([
          invoke('get_processed_urls', { limit: 500 }) as Promise<ProcessedURL[]>,
          invoke('get_processed_stats') as Promise<ProcessedStats>,
          invoke('get_scraped_urls', { limit: 500 }) as Promise<ScrapedURL[]>,
          invoke('get_scraped_stats') as Promise<ScrapedStats>,
        ])
        setProcessedUrls(processedData)
        setProcessedStats(processedStatsData)
        setScrapedUrls(scrapedData)
        setScrapedStats(scrapedStatsData)
      }
    } catch (error) {
      console.error('Failed to fetch database:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 2 seconds while bot is running
  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(fetchData, 2000)
      return () => clearInterval(interval)
    }
  }, [isRunning, fetchData])

  // Refresh when logs indicate database changes (real-time updates)
  useEffect(() => {
    if (logs.length > 0) {
      const lastLog = logs[logs.length - 1]
      const triggerKeywords = ['✅', '❌', '⏭️', 'success', 'failed', 'skipped', 'Saved', 'Found', 'deleted', 'cleared']
      if (triggerKeywords.some(kw => lastLog.message.toLowerCase().includes(kw.toLowerCase()))) {
        fetchData()
      }
    }
  }, [logs.length, fetchData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const handleToggleScrapedStatus = async (id: number, currentProcessed: boolean) => {
    setTogglingStatus(id)
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const newStatus = !currentProcessed
        await invoke('update_scraped_url_status', { id, processed: newStatus })
        addLog('info', `📝 URL #${id} status changed to ${newStatus ? 'Done' : 'Pending'}`)
        await fetchData()
        triggerDbRefresh()
      }
    } catch (error) {
      addLog('error', `Failed to update status: ${error}`)
    } finally {
      setTogglingStatus(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        
        if (deleteTarget.table === 'processed') {
          if (deleteTarget.id === 'all') {
            await invoke('clear_processed_urls')
            addLog('success', '🗑️ All processed URLs cleared')
          } else {
            await invoke('delete_processed_url', { id: deleteTarget.id })
            addLog('success', `🗑️ Record #${deleteTarget.id} deleted`)
          }
        } else {
          if (deleteTarget.id === 'all') {
            await invoke('clear_scraped_urls')
            addLog('success', '🗑️ All scraped URLs cleared')
          } else {
            await invoke('delete_scraped_url', { id: deleteTarget.id })
            addLog('success', `🗑️ Record #${deleteTarget.id} deleted`)
          }
        }
        
        await fetchData()
        triggerDbRefresh() // Notify other components (like sidebar) to refresh
      }
    } catch (error) {
      addLog('error', `Failed to delete: ${error}`)
    } finally {
      setShowDeleteConfirm(false)
      setDeleteTarget(null)
    }
  }

  const handleExport = async () => {
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const { save } = await import('@tauri-apps/api/dialog')
        const { writeTextFile } = await import('@tauri-apps/api/fs')
        
        const commandName = activeTab === 'processed' ? 'export_processed_csv' : 'export_scraped_csv'
        const csv = await invoke(commandName) as string
        const prefix = activeTab === 'processed' ? 'processed-urls' : 'scraped-urls'
        
        const filePath = await save({
          filters: [{ name: 'CSV', extensions: ['csv'] }],
          defaultPath: `inboxhunter-${prefix}-${new Date().toISOString().split('T')[0]}.csv`
        })
        
        if (filePath) {
          await writeTextFile(filePath, csv)
          addLog('success', `📁 Exported to ${filePath}`)
        }
      }
    } catch (error) {
      addLog('error', `Export failed: ${error}`)
    }
  }

  // Filter and paginate processed URLs
  const filteredProcessed = processedUrls.filter(item => {
    const matchesSearch = item.url.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Filter scraped URLs
  const filteredScraped = scrapedUrls.filter(item => {
    const matchesSearch = item.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.advertiser && item.advertiser.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'pending' && !item.processed) ||
      (statusFilter === 'done' && item.processed)
    return matchesSearch && matchesStatus
  })

  const currentData = activeTab === 'processed' ? filteredProcessed : filteredScraped
  const totalPages = Math.ceil(currentData.length / itemsPerPage)
  const paginatedData = currentData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
      success: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/20' },
      failed: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/20' },
      pending: { icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/20' },
      skipped: { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/20' },
    }
    const config = configs[status] || { icon: AlertTriangle, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-500/20' }
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${config.bg} ${config.color}`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return dateStr }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Database</h2>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleExport} disabled={currentData.length === 0} className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50" title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
          <button 
            onClick={() => { setDeleteTarget({ id: 'all', table: activeTab }); setShowDeleteConfirm(true) }} 
            disabled={currentData.length === 0} 
            className="p-2 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            title="Clear All"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => { setActiveTab('processed'); setCurrentPage(1); setStatusFilter('all') }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'processed'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-4 h-4" />
          Processed URLs
          {processedStats && (
            <span className="px-1.5 py-0.5 rounded bg-white/20 text-xs">
              {processedStats.total}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('scraped'); setCurrentPage(1); setStatusFilter('all') }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'scraped'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Globe className="w-4 h-4" />
          Scraped URLs
          {scrapedStats && (
            <span className="px-1.5 py-0.5 rounded bg-white/20 text-xs">
              {scrapedStats.pending} pending
            </span>
          )}
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-sm px-1">
        {activeTab === 'processed' && processedStats && (
          <>
            <span className="text-muted-foreground">{processedStats.total} total</span>
            <span className="text-emerald-600 dark:text-emerald-400">✓ {processedStats.successful} success</span>
            <span className="text-red-600 dark:text-red-400">✗ {processedStats.failed} failed</span>
            <span className="text-orange-600 dark:text-orange-400">⏭ {processedStats.skipped} skipped</span>
          </>
        )}
        {activeTab === 'scraped' && scrapedStats && (
          <>
            <span className="text-muted-foreground">{scrapedStats.total} total</span>
            <span className="text-amber-600 dark:text-amber-400">⏳ {scrapedStats.pending} pending</span>
            <span className="text-emerald-600 dark:text-emerald-400">✓ {scrapedStats.processed} processed</span>
          </>
        )}
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
            placeholder={activeTab === 'processed' ? "Search URLs..." : "Search URLs or advertisers..."}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
          className="px-3 py-1.5 text-sm rounded-lg bg-muted border border-border focus:outline-none"
        >
          <option value="all">All</option>
          {activeTab === 'processed' ? (
            <>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </>
          ) : (
            <>
              <option value="pending">Pending</option>
              <option value="done">Processed</option>
            </>
          )}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 rounded-lg border border-border overflow-hidden">
        <div className="overflow-auto h-full">
          {activeTab === 'processed' ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-12">#</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">URL</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-20">Source</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-24">Status</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-36">Date</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(paginatedData as ProcessedURL[]).length > 0 ? (
                  (paginatedData as ProcessedURL[]).map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground">{item.id}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 max-w-md">
                          <span className="truncate text-foreground" title={item.url}>{item.url}</span>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-primary">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        {item.error_message && (
                          <div className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5 truncate max-w-md" title={item.error_message}>
                            {item.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{item.source}</td>
                      <td className="px-3 py-2">{getStatusBadge(item.status)}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(item.processed_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => { setDeleteTarget({ id: item.id, table: 'processed' }); setShowDeleteConfirm(true) }} className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                      <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>{searchQuery || statusFilter !== 'all' ? 'No matching records' : 'No processed URLs yet'}</p>
                      <p className="text-xs mt-1">URLs will appear here after the bot processes them</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-12">#</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">URL</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-40">Advertiser</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-24">Status</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-36">Scraped</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(paginatedData as ScrapedURL[]).length > 0 ? (
                  (paginatedData as ScrapedURL[]).map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground">{item.id}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 max-w-md">
                          <span className="truncate text-foreground" title={item.url}>{item.url}</span>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-primary">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]" title={item.advertiser || ''}>
                        {item.advertiser || '-'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleToggleScrapedStatus(item.id, item.processed)}
                          disabled={togglingStatus === item.id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all hover:scale-105 cursor-pointer ${
                            item.processed 
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30' 
                              : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                          }`}
                          title={`Click to change to ${item.processed ? 'Pending' : 'Done'}`}
                        >
                          {togglingStatus === item.id ? (
                            <RotateCw className="w-3 h-3 animate-spin" />
                          ) : item.processed ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {item.processed ? 'Done' : 'Pending'}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(item.scraped_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => { setDeleteTarget({ id: item.id, table: 'scraped' }); setShowDeleteConfirm(true) }} className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                      <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>{searchQuery || statusFilter !== 'all' ? 'No matching records' : 'No scraped URLs yet'}</p>
                      <p className="text-xs mt-1">Run the bot with "Meta Ads Library" source to scrape URLs</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {currentPage} of {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-muted disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-muted disabled:opacity-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-xl p-5 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    {deleteTarget.id === 'all' 
                      ? `Clear All ${deleteTarget.table === 'processed' ? 'Processed' : 'Scraped'} URLs?`
                      : 'Delete Record?'
                    }
                  </h3>
                  <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-muted">Cancel</button>
                <button onClick={confirmDelete} className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
