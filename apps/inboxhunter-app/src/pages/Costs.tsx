import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign,
  RefreshCw,
  Trash2,
  TrendingUp,
  Zap,
  Hash,
  Clock
} from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

interface ModelCostStats {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  api_calls: number
  cost: number
}

interface ApiCostSummary {
  by_model: Record<string, ModelCostStats>
  total_cost: number
  total_calls: number
  total_tokens: number
  session_count: number
}

interface ApiSession {
  id: number
  session_start: string
  model: string
  input_tokens: number
  output_tokens: number
  cost: number
  api_calls: number
}

export function CostsPage() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [summary, setSummary] = useState<ApiCostSummary | null>(null)
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clearing, setClearing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        try {
          const [summaryData, sessionsData] = await Promise.all([
            invoke('get_api_cost_summary') as Promise<ApiCostSummary>,
            invoke('get_api_sessions', { limit: 50 }) as Promise<ApiSession[]>
          ])
          setSummary(summaryData)
          setSessions(sessionsData)
        } catch (invokeError) {
          // Table might not exist yet - show empty state
          console.log('Cost data not available yet:', invokeError)
          setSummary({
            by_model: {},
            total_cost: 0,
            total_calls: 0,
            total_tokens: 0,
            session_count: 0
          })
          setSessions([])
        }
      }
    } catch (error) {
      console.error('Failed to fetch cost data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setTimeout(() => setRefreshing(false), 500)
  }

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear all API cost history? This cannot be undone.')) {
      return
    }

    try {
      setClearing(true)
      // @ts-ignore
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        await invoke('clear_api_sessions')
        await fetchData()
      }
    } catch (error) {
      console.error('Failed to clear cost history:', error)
    } finally {
      setClearing(false)
    }
  }

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(2)}M`
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">API Costs</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Track your cumulative OpenAI API usage and costs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || !summary || summary.total_calls === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Clear History
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Cost */}
        <div className="p-5 rounded-xl border border-border bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Cost</span>
          </div>
          <div className="text-3xl font-bold text-emerald-500">
            {formatCost(summary?.total_cost || 0)}
          </div>
        </div>

        {/* Total Calls */}
        <div className="p-5 rounded-xl border border-border bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">API Calls</span>
          </div>
          <div className="text-3xl font-bold text-blue-500">
            {summary?.total_calls?.toLocaleString() || 0}
          </div>
        </div>

        {/* Total Tokens */}
        <div className="p-5 rounded-xl border border-border bg-gradient-to-br from-purple-500/10 to-purple-500/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Hash className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Tokens</span>
          </div>
          <div className="text-3xl font-bold text-purple-500">
            {formatTokens(summary?.total_tokens || 0)}
          </div>
        </div>

        {/* Sessions */}
        <div className="p-5 rounded-xl border border-border bg-gradient-to-br from-orange-500/10 to-orange-500/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Sessions</span>
          </div>
          <div className="text-3xl font-bold text-orange-500">
            {summary?.session_count || 0}
          </div>
        </div>
      </div>

      {/* Cost by Model */}
      {summary && Object.keys(summary.by_model).length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Cost by Model</h3>
            </div>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(summary.by_model).map(([model, stats]) => (
              <div key={model} className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-mono text-sm">
                    {model}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stats.api_calls.toLocaleString()} calls
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Tokens</div>
                    <div className="font-medium text-foreground">
                      {formatTokens(stats.total_tokens)}
                    </div>
                  </div>
                  <div className="text-right min-w-[80px]">
                    <div className="text-xs text-muted-foreground">Cost</div>
                    <div className="font-bold text-emerald-500">
                      {formatCost(stats.cost)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Recent Sessions</h3>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Model</th>
                  <th className="px-5 py-3 font-medium text-right">Calls</th>
                  <th className="px-5 py-3 font-medium text-right">Tokens</th>
                  <th className="px-5 py-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 text-sm text-muted-foreground">
                      {formatDate(session.session_start)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-1 rounded bg-primary/10 text-primary font-mono text-xs">
                        {session.model}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-foreground text-right">
                      {session.api_calls}
                    </td>
                    <td className="px-5 py-3 text-sm text-foreground text-right">
                      {formatTokens(session.input_tokens + session.output_tokens)}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-emerald-500 text-right">
                      {formatCost(session.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!summary || summary.total_calls === 0) && (
        <div className="text-center py-12">
          <DollarSign className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No cost data yet</h3>
          <p className="text-muted-foreground text-sm">
            Run the bot to start tracking API costs. Costs are recorded after each session.
          </p>
        </div>
      )}
    </div>
  )
}
