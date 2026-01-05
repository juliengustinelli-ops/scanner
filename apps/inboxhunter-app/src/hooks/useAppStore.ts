import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Credentials {
  firstName: string
  lastName: string
  email: string
  countryCode: string
  phone: string
}

interface APIKeys {
  openai: string
  captcha: string
}

interface Settings {
  dataSource: 'csv' | 'meta' | 'database'
  csvPath: string
  metaKeywords: string
  adLimit: number
  maxSignups: number
  headless: boolean
  debug: boolean
  detailedLogs: boolean  // Simple logs by default, detailed for debugging
  minDelay: number
  maxDelay: number
  llmModel: string
}

interface Stats {
  processed: number
  successful: number
  failed: number
  skipped: number
  captchasSolved: number
  elapsedTime: number
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'

interface UpdateLogEntry {
  timestamp: string
  message: string
  type: 'info' | 'success' | 'error'
}

interface UpdateState {
  status: UpdateStatus
  version: string
  error: string | null
  progress: number
  showModal: boolean
  logs: UpdateLogEntry[]
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'success' | 'warning' | 'error' | 'debug'
  message: string
}

interface AppState {
  // Bot State
  isRunning: boolean
  
  // Database update trigger - increments on any DB change
  dbVersion: number
  triggerDbRefresh: () => void
  
  // Credentials
  credentials: Credentials
  setCredentials: (credentials: Partial<Credentials>) => void
  
  // API Keys
  apiKeys: APIKeys
  setAPIKeys: (keys: Partial<APIKeys>) => void
  
  // Settings
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void
  
  // Stats
  stats: Stats
  setStats: (stats: Partial<Stats>) => void
  resetStats: () => void
  
  // Logs
  logs: LogEntry[]
  addLog: (level: LogEntry['level'], message: string) => void
  clearLogs: () => void
  
  // Bot Control
  startBot: () => void
  stopBot: () => void
  
  // Update State
  updateState: UpdateState
  setUpdateState: (state: Partial<UpdateState>) => void
  addUpdateLog: (message: string, type?: 'info' | 'success' | 'error') => void
  clearUpdateLogs: () => void
  openUpdateModal: () => void
  closeUpdateModal: () => void
}

const initialCredentials: Credentials = {
  firstName: '',
  lastName: '',
  email: '',
  countryCode: '+1',
  phone: '',
}

const initialAPIKeys: APIKeys = {
  openai: '',
  captcha: '',
}

const initialSettings: Settings = {
  dataSource: 'meta',
  csvPath: '',
  metaKeywords: 'marketing, funnel',
  adLimit: 20,  // Default within valid range (5-30)
  maxSignups: 30,
  headless: false,
  debug: false,
  detailedLogs: false,  // Simple logs by default
  minDelay: 10,
  maxDelay: 30,
  llmModel: 'gpt-4o',
}

const initialStats: Stats = {
  processed: 0,
  successful: 0,
  failed: 0,
  skipped: 0,
  captchasSolved: 0,
  elapsedTime: 0,
}

const initialUpdateState: UpdateState = {
  status: 'idle',
  version: '',
  error: null,
  progress: 0,
  showModal: false,
  logs: [],
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial State
      isRunning: false,
      dbVersion: 0,
      credentials: initialCredentials,
      apiKeys: initialAPIKeys,
      settings: initialSettings,
      stats: initialStats,
      logs: [],
      updateState: initialUpdateState,
      
      // Database refresh trigger
      triggerDbRefresh: () => set((state) => ({ dbVersion: state.dbVersion + 1 })),
      
      // Credentials
      setCredentials: (credentials) =>
        set((state) => ({
          credentials: { ...state.credentials, ...credentials },
        })),
      
      // API Keys
      setAPIKeys: (keys) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, ...keys },
        })),
      
      // Settings
      setSettings: (settings) =>
        set((state) => ({
          settings: { ...state.settings, ...settings },
        })),
      
      // Stats
      setStats: (stats) =>
        set((state) => ({
          stats: { ...state.stats, ...stats },
        })),
      
      resetStats: () => set({ stats: initialStats }),
      
      // Logs
      addLog: (level, message) =>
        set((state) => ({
          logs: [
            ...state.logs.slice(-500), // Keep last 500 logs
            {
              timestamp: new Date().toLocaleTimeString(),
              level,
              message,
            },
          ],
        })),
      
      clearLogs: () => set({ logs: [] }),
      
      // Update State
      setUpdateState: (updateData) =>
        set((state) => ({
          updateState: { ...state.updateState, ...updateData },
        })),
      
      addUpdateLog: (message, type = 'info') =>
        set((state) => ({
          updateState: {
            ...state.updateState,
            logs: [
              ...state.updateState.logs,
              {
                timestamp: new Date().toLocaleTimeString(),
                message,
                type,
              },
            ],
          },
        })),
      
      clearUpdateLogs: () =>
        set((state) => ({
          updateState: { ...state.updateState, logs: [] },
        })),
      
      openUpdateModal: () =>
        set((state) => ({
          updateState: { ...state.updateState, showModal: true, logs: [] },
        })),
      
      closeUpdateModal: () =>
        set((state) => ({
          updateState: { 
            ...state.updateState, 
            showModal: false,
            // Reset to available if not installing (so user can try again)
            status: state.updateState.status === 'installing' ? state.updateState.status : 
                   state.updateState.version ? 'available' : 'idle',
            progress: 0,
            error: null,
          },
        })),
      
      // Bot Control
      startBot: async () => {
        const state = get()
        
        // Comprehensive validation before starting
        const errors: string[] = []
        
        // Validate credentials
        if (!state.credentials.firstName.trim()) {
          errors.push('First name is required')
        } else if (state.credentials.firstName.trim().length < 2) {
          errors.push('First name must be at least 2 characters')
        }
        
        if (!state.credentials.lastName.trim()) {
          errors.push('Last name is required')
        } else if (state.credentials.lastName.trim().length < 2) {
          errors.push('Last name must be at least 2 characters')
        }
        
        if (!state.credentials.email.trim()) {
          errors.push('Email is required')
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.credentials.email)) {
          errors.push('Please enter a valid email address')
        }
        
        if (!state.credentials.countryCode.trim()) {
          errors.push('Country code is required')
        } else if (!/^\+\d{1,4}$/.test(state.credentials.countryCode)) {
          errors.push('Country code must be in format +1, +92, etc.')
        }
        
        if (!state.credentials.phone.trim()) {
          errors.push('Phone number is required')
        } else {
          const cleanPhone = state.credentials.phone.replace(/[\s\-\(\)]/g, '')
          if (!/^\d{7,15}$/.test(cleanPhone)) {
            errors.push('Phone number must be 7-15 digits')
          }
        }
        
        // Validate API keys
        if (!state.apiKeys.openai.trim()) {
          errors.push('OpenAI API key is required')
        } else if (!state.apiKeys.openai.startsWith('sk-')) {
          errors.push('OpenAI API key should start with "sk-"')
        } else if (state.apiKeys.openai.length < 20) {
          errors.push('OpenAI API key seems too short')
        }
        
        // Validate data source settings
        if (state.settings.dataSource === 'csv') {
          if (!state.settings.csvPath.trim()) {
            errors.push('CSV file path is required')
          } else if (!state.settings.csvPath.toLowerCase().endsWith('.csv')) {
            errors.push('File must be a .csv file')
          }
        } else if (state.settings.dataSource === 'meta') {
          if (!state.settings.metaKeywords.trim()) {
            errors.push('Search keywords are required for Meta Ads')
          }
        }
        // 'database' doesn't need extra validation - it will check DB at runtime
        
        // If there are errors, log them and don't start
        if (errors.length > 0) {
          state.addLog('error', `❌ Cannot start bot - ${errors.length} validation error(s):`)
          errors.forEach(error => state.addLog('error', `   • ${error}`))
          state.addLog('info', '💡 Please go to Settings and fix the errors')
          return
        }
        
        state.resetStats()
        state.addLog('info', '🚀 Starting InboxHunter Bot...')
        
        try {
          // @ts-ignore - Tauri API
          if (window.__TAURI__) {
            const { invoke } = await import('@tauri-apps/api/tauri')
            const { listen } = await import('@tauri-apps/api/event')
            
            // Listen for log events from the bot
            const unlistenLog = await listen<{ level: string; message: string }>('bot-log', (event) => {
              const { level, message } = event.payload
              
              // Check for special data source change signal
              if (message.includes('DATASOURCE_CHANGE:database')) {
                // Update the settings to use database as the data source
                set((state) => ({
                  settings: { ...state.settings, dataSource: 'database' }
                }))
                // Don't log the raw signal message - it's an internal command
                get().addLog('success', '🔄 Data source switched to: Database')
                return
              }
              
              get().addLog(level as any, message)
            })
            
            // Listen for bot stopped event
            const unlistenStop = await listen('bot-stopped', () => {
              set({ isRunning: false })
              get().addLog('info', '⏹ Bot process ended')
              unlistenLog()
              unlistenStop()
            })
            
            // Store unlisten functions for cleanup
            // @ts-ignore
            window.__BOT_UNLISTENERS__ = [unlistenLog, unlistenStop]
            
            await invoke('start_bot', {
              config: {
                credentials: state.credentials,
                apiKeys: state.apiKeys,
                settings: state.settings,
              },
            })
            
            set({ isRunning: true })
            state.addLog('success', '✅ Bot started successfully')
          } else {
            // Demo mode when not in Tauri
            set({ isRunning: true })
            state.addLog('info', '📋 Bot configuration loaded')
            state.addLog('info', `📧 Using email: ${state.credentials.email}`)
            state.addLog('info', `🔧 Data source: ${state.settings.dataSource}`)
            state.addLog('info', '🤖 AI Agent with GPT-4o Vision ready')
            state.addLog('warning', '⚠️ Running in demo mode (not in Tauri)')
          }
        } catch (error) {
          state.addLog('error', `Failed to start bot: ${error}`)
          set({ isRunning: false })
        }
      },
      
      stopBot: async () => {
        const state = get()
        state.addLog('info', '⏹ Stopping bot...')
        
        try {
          // @ts-ignore - Tauri API
          if (window.__TAURI__) {
            const { invoke } = await import('@tauri-apps/api/tauri')
            await invoke('stop_bot')
            
            // Cleanup listeners
            // @ts-ignore
            if (window.__BOT_UNLISTENERS__) {
              // @ts-ignore
              window.__BOT_UNLISTENERS__.forEach((unlisten: () => void) => unlisten())
              // @ts-ignore
              window.__BOT_UNLISTENERS__ = null
            }
          }
        } catch (error) {
          state.addLog('error', `Error stopping bot: ${error}`)
        }
        
        set({ isRunning: false })
        state.addLog('success', '✅ Bot stopped')
      },
    }),
    {
      name: 'inboxhunter-storage',
      version: 2, // Increment this when adding new fields
      partialize: (state) => ({
        credentials: state.credentials,
        apiKeys: state.apiKeys,
        settings: state.settings,
      }),
      // Merge persisted state with initial state to handle new fields
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined
        
        if (!persisted) {
          return currentState
        }
        
        // Deep merge settings to ensure new fields get defaults
        const mergedSettings = {
          ...initialSettings,  // Start with all defaults
          ...(persisted.settings || {}),  // Override with user's saved settings
        }
        
        // Ensure detailedLogs and debug are in sync (legacy compatibility)
        // If detailedLogs is undefined but debug exists, use debug value
        if (mergedSettings.detailedLogs === undefined && persisted.settings?.debug !== undefined) {
          mergedSettings.detailedLogs = persisted.settings.debug
        }
        
        // Deep merge credentials
        const mergedCredentials = {
          ...initialCredentials,
          ...(persisted.credentials || {}),
        }
        
        // Deep merge API keys
        const mergedAPIKeys = {
          ...initialAPIKeys,
          ...(persisted.apiKeys || {}),
        }
        
        return {
          ...currentState,
          credentials: mergedCredentials,
          apiKeys: mergedAPIKeys,
          settings: mergedSettings,
        }
      },
      // Migration function for version upgrades
      migrate: (persistedState, version) => {
        const state = persistedState as any
        
        // Migration from version 1 (or no version) to version 2
        if (version < 2) {
          // Ensure detailedLogs exists and syncs with debug
          if (state.settings) {
            if (state.settings.detailedLogs === undefined) {
              state.settings.detailedLogs = state.settings.debug ?? false
            }
            // Ensure adLimit is within valid range
            if (state.settings.adLimit === undefined || state.settings.adLimit < 5) {
              state.settings.adLimit = 20
            }
            // Ensure llmModel exists
            if (!state.settings.llmModel) {
              state.settings.llmModel = 'gpt-4o'
            }
          }
        }
        
        return state
      },
    }
  )
)
