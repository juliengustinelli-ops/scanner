import { useState, useMemo, useEffect, useRef } from 'react'
import {
  User,
  Key,
  Database,
  Settings as SettingsIcon,
  Eye,
  EyeOff,
  FolderOpen,
  Save,
  CheckCircle2,
  AlertCircle,
  Info,
  RotateCcw,
  Download,
  Cloud,
  Sparkles,
  RefreshCw,
  Package,
  Globe,
  FileText,
  Send,
  ExternalLink
} from 'lucide-react'
import { useAppStore } from '../hooks/useAppStore'
import { motion } from 'framer-motion'

type SettingsTab = 'credentials' | 'apiKeys' | 'dataSource' | 'advanced' | 'about'

// Validation functions
const validateEmail = (email: string): string | null => {
  if (!email.trim()) return 'Email is required'
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return 'Please enter a valid email address'
  return null
}

const validatePhone = (phone: string): string | null => {
  if (!phone.trim()) return 'Phone number is required'
  // Remove any spaces, dashes, parentheses
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '')
  if (!/^\d{7,15}$/.test(cleanPhone)) return 'Phone must be 7-15 digits'
  return null
}

const validateCountryCode = (code: string): string | null => {
  if (!code.trim()) return 'Country code is required'
  // Should start with + and have 1-4 digits
  if (!/^\+\d{1,4}$/.test(code)) return 'Format: +1, +92, +44'
  return null
}

const validateName = (name: string, fieldName: string): string | null => {
  if (!name.trim()) return `${fieldName} is required`
  if (name.trim().length < 2) return `${fieldName} must be at least 2 characters`
  if (!/^[a-zA-Z\s'-]+$/.test(name)) return `${fieldName} contains invalid characters`
  return null
}

const validateOpenAIKey = (key: string): string | null => {
  if (!key.trim()) return 'OpenAI API key is required'
  if (!key.startsWith('sk-')) return 'API key should start with "sk-"'
  if (key.length < 20) return 'API key seems too short'
  return null
}

const validateCaptchaKey = (key: string): string | null => {
  if (!key.trim()) return null // Optional field
  if (key.length < 10) return 'API key seems too short'
  return null
}

const validateCSVPath = (path: string, isCSVSource: boolean): string | null => {
  if (!isCSVSource) return null
  if (!path.trim()) return 'CSV file path is required'
  if (!path.toLowerCase().endsWith('.csv')) return 'File must be a .csv file'
  return null
}

const validateKeywords = (keywords: string, isMetaSource: boolean): string | null => {
  if (!isMetaSource) return null
  if (!keywords.trim()) return 'At least one keyword is required'
  return null
}

const validateAdLimit = (adLimit: number): string | null => {
  if (isNaN(adLimit)) return 'Please enter a valid number'
  if (adLimit < 5) return 'Must be at least 5'
  if (adLimit > 100) return 'Must be at most 100'
  return null
}

// Draft state interfaces
interface DraftCredentials {
  firstName: string
  lastName: string
  email: string
  countryCode: string
  phone: string
}

interface DraftAPIKeys {
  openai: string
  captcha: string
}

interface DraftSettings {
  dataSource: 'csv' | 'meta' | 'database'
  csvPath: string
  metaKeywords: string
  adLimit: number
  maxSignups: number
  headless: boolean
  debug: boolean
  detailedLogs: boolean
  minDelay: number
  maxDelay: number
  llmModel: string
  batchPlanning: boolean
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('credentials')
  const [showOpenAI, setShowOpenAI] = useState(false)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [saved, setSaved] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialMount = useRef(true)
  
  const { 
    credentials, 
    setCredentials,
    apiKeys,
    setAPIKeys,
    settings,
    setSettings,
    addLog,
    updateState,
    setUpdateState,
    addUpdateLog,
    openUpdateModal
  } = useAppStore()

  // Draft state - local copy that user edits
  const [draftCredentials, setDraftCredentials] = useState<DraftCredentials>(credentials)
  const [draftAPIKeys, setDraftAPIKeys] = useState<DraftAPIKeys>(apiKeys)
  const [draftSettings, setDraftSettings] = useState<DraftSettings>(settings)

  // Refs to track latest values for unmount save
  const draftCredentialsRef = useRef(draftCredentials)
  const draftAPIKeysRef = useRef(draftAPIKeys)
  const draftSettingsRef = useRef(draftSettings)
  const credentialsRef = useRef(credentials)
  const apiKeysRef = useRef(apiKeys)
  const settingsRef = useRef(settings)

  // Keep refs in sync
  useEffect(() => { draftCredentialsRef.current = draftCredentials }, [draftCredentials])
  useEffect(() => { draftAPIKeysRef.current = draftAPIKeys }, [draftAPIKeys])
  useEffect(() => { draftSettingsRef.current = draftSettings }, [draftSettings])
  useEffect(() => { credentialsRef.current = credentials }, [credentials])
  useEffect(() => { apiKeysRef.current = apiKeys }, [apiKeys])
  useEffect(() => { settingsRef.current = settings }, [settings])

  // Sync draft with store when store changes (e.g., on initial load)
  useEffect(() => {
    setDraftCredentials(credentials)
  }, [credentials])

  useEffect(() => {
    setDraftAPIKeys(apiKeys)
  }, [apiKeys])

  useEffect(() => {
    setDraftSettings(settings)
  }, [settings])

  const tabs = [
    { id: 'credentials' as SettingsTab, label: 'Credentials', icon: User },
    { id: 'apiKeys' as SettingsTab, label: 'API Keys', icon: Key },
    { id: 'dataSource' as SettingsTab, label: 'Data Source', icon: Database },
    { id: 'advanced' as SettingsTab, label: 'Advanced', icon: SettingsIcon },
    { id: 'about' as SettingsTab, label: 'About & Updates', icon: Sparkles },
  ]
  
  // Update state from shared store
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [lastChecked, setLastChecked] = useState<string | null>(null)

  // Log submission state
  const [logDescription, setLogDescription] = useState('')
  const [isSubmittingLogs, setIsSubmittingLogs] = useState(false)
  const [logSubmissionResult, setLogSubmissionResult] = useState<{
    success?: boolean
    issueUrl?: string
    error?: string
  } | null>(null)

  const checkForUpdates = async () => {
    setIsCheckingUpdate(true)
    setUpdateState({ status: 'checking' })
    try {
      // @ts-ignore
      if (window.__TAURI__) {
        const { checkUpdate, installUpdate } = await import('@tauri-apps/api/updater')
        const { relaunch } = await import('@tauri-apps/api/process')
        
        const update = await checkUpdate()
        if (update.shouldUpdate && update.manifest) {
          setUpdateState({ 
            status: 'available', 
            version: update.manifest.version,
            error: null 
          })
          addLog('info', `🔄 Update available: v${update.manifest.version}`)
        } else {
          setUpdateState({ status: 'idle' })
          addLog('success', '✅ You are on the latest version')
        }
        
        // Store functions for later use
        // @ts-ignore
        window.__UPDATE_FUNCTIONS__ = { installUpdate, relaunch, checkUpdate }
      }
      setLastChecked(new Date().toLocaleTimeString())
    } catch (error) {
      console.error('Update check failed:', error)
      setUpdateState({ status: 'idle' })
      addLog('error', `Failed to check for updates: ${error}`)
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleInstallUpdate = async () => {
    // Open the modal in App.tsx which handles the actual update
    openUpdateModal()
    addLog('info', '📥 Starting update...')
    
    // Trigger the update (the modal logs will show the progress)
    // @ts-ignore
    if (window.__UPDATE_FUNCTIONS__) {
      try {
        setUpdateState({ status: 'downloading' })
        addUpdateLog('Starting update process...', 'info')
        
        // @ts-ignore
        const { installUpdate, relaunch } = window.__UPDATE_FUNCTIONS__
        
        addUpdateLog('Calling Tauri updater...', 'info')
        await installUpdate()
        
        addUpdateLog('Update downloaded successfully!', 'success')
        setUpdateState({ status: 'installing' })
        addUpdateLog('Installing update...', 'info')
        
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        addUpdateLog('Restarting application...', 'info')
        await relaunch()
      } catch (error: any) {
        const errorMsg = error?.message || 'Unknown error occurred'
        addUpdateLog(`Failed: ${errorMsg}`, 'error')
        setUpdateState({ status: 'error', error: errorMsg })
      }
    } else {
      addUpdateLog('Update functions not initialized. Please restart the app.', 'error')
      setUpdateState({ status: 'error', error: 'Update functions not initialized' })
    }
  }

  // Dynamic app version from Tauri
  const [appVersion, setAppVersion] = useState<string>('...')

  // Fetch version from Tauri on mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        // @ts-ignore - Tauri API
        if (window.__TAURI__) {
          const { getVersion } = await import('@tauri-apps/api/app')
          const version = await getVersion()
          setAppVersion(version)
        } else {
          setAppVersion('dev')
        }
      } catch {
        setAppVersion('unknown')
      }
    }
    fetchVersion()
  }, [])

  // Handle log submission
  const handleSubmitLogs = async () => {
    if (!logDescription.trim()) {
      setLogSubmissionResult({ error: 'Please describe the issue you are experiencing' })
      return
    }

    setIsSubmittingLogs(true)
    setLogSubmissionResult(null)

    try {
      // @ts-ignore - Tauri API
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const result = await invoke<{
          success: boolean
          issue_url: string | null
          error: string | null
        }>('submit_logs', { description: logDescription })

        if (result.success && result.issue_url) {
          setLogSubmissionResult({ success: true, issueUrl: result.issue_url })
          setLogDescription('')
          addLog('success', '✅ Logs submitted successfully')
        } else {
          setLogSubmissionResult({ error: result.error || 'Failed to submit logs' })
          addLog('error', `Failed to submit logs: ${result.error}`)
        }
      } else {
        setLogSubmissionResult({ error: 'Log submission is only available in the desktop app' })
      }
    } catch (err: any) {
      const errorMsg = err?.message || err?.toString() || 'Unknown error'
      setLogSubmissionResult({ error: errorMsg })
      addLog('error', `Failed to submit logs: ${errorMsg}`)
    } finally {
      setIsSubmittingLogs(false)
    }
  }

  // Mark field as touched when user interacts
  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  // Compute all validation errors based on DRAFT state
  const validationErrors = useMemo((): Record<string, string | null> => {
    return {
      firstName: validateName(draftCredentials.firstName, 'First name'),
      lastName: validateName(draftCredentials.lastName, 'Last name'),
      email: validateEmail(draftCredentials.email),
      countryCode: validateCountryCode(draftCredentials.countryCode),
      phone: validatePhone(draftCredentials.phone),
      openai: validateOpenAIKey(draftAPIKeys.openai),
      captcha: validateCaptchaKey(draftAPIKeys.captcha),
      csvPath: validateCSVPath(draftSettings.csvPath, draftSettings.dataSource === 'csv'),
      metaKeywords: validateKeywords(draftSettings.metaKeywords, draftSettings.dataSource === 'meta'),
      adLimit: validateAdLimit(draftSettings.adLimit),
    }
  }, [draftCredentials, draftAPIKeys, draftSettings])

  // Check if there are any critical errors
  const hasCriticalErrors = useMemo(() => {
    const criticalFields = ['firstName', 'lastName', 'email', 'countryCode', 'phone', 'openai']
    return criticalFields.some(field => validationErrors[field] !== null)
  }, [validationErrors])

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return (
      JSON.stringify(draftCredentials) !== JSON.stringify(credentials) ||
      JSON.stringify(draftAPIKeys) !== JSON.stringify(apiKeys) ||
      JSON.stringify(draftSettings) !== JSON.stringify(settings)
    )
  }, [draftCredentials, draftAPIKeys, draftSettings, credentials, apiKeys, settings])

  // Count errors per tab for badges
  const errorCounts = useMemo(() => {
    return {
      credentials: ['firstName', 'lastName', 'email', 'countryCode', 'phone']
        .filter(f => validationErrors[f]).length,
      apiKeys: ['openai', 'captcha'].filter(f => validationErrors[f]).length,
      dataSource: ['csvPath', 'metaKeywords', 'adLimit'].filter(f => validationErrors[f]).length,
      advanced: 0,
      about: 0
    }
  }, [validationErrors])
  
  // Local string states for numeric inputs to allow free typing
  const [adLimitInput, setAdLimitInput] = useState<string>(draftSettings.adLimit.toString())
  const [maxSignupsInput, setMaxSignupsInput] = useState<string>(draftSettings.maxSignups.toString())
  const [minDelayInput, setMinDelayInput] = useState<string>(draftSettings.minDelay.toString())
  const [maxDelayInput, setMaxDelayInput] = useState<string>(draftSettings.maxDelay.toString())
  
  // Sync input states when draftSettings changes (from outside)
  useEffect(() => {
    setAdLimitInput(draftSettings.adLimit.toString())
  }, [draftSettings.adLimit])
  
  useEffect(() => {
    setMaxSignupsInput(draftSettings.maxSignups.toString())
  }, [draftSettings.maxSignups])
  
  useEffect(() => {
    setMinDelayInput(draftSettings.minDelay.toString())
  }, [draftSettings.minDelay])
  
  useEffect(() => {
    setMaxDelayInput(draftSettings.maxDelay.toString())
  }, [draftSettings.maxDelay])

  // Auto-save with debounce when changes are made and validation passes
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // Clear any existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Only auto-save if there are unsaved changes and no critical errors
    if (hasUnsavedChanges && !hasCriticalErrors) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        // Save draft to store
        setCredentials(draftCredentials)
        setAPIKeys(draftAPIKeys)
        setSettings(draftSettings)
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      }, 1500) // 1.5 second debounce
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [draftCredentials, draftAPIKeys, draftSettings, hasUnsavedChanges, hasCriticalErrors, setCredentials, setAPIKeys, setSettings])

  // Auto-save on unmount (when navigating away) if validation passes
  useEffect(() => {
    const storeSetCredentials = setCredentials
    const storeSetAPIKeys = setAPIKeys
    const storeSetSettings = setSettings
    
    return () => {
      // This runs when component unmounts - use refs for latest values
      const currentDraftCreds = draftCredentialsRef.current
      const currentDraftKeys = draftAPIKeysRef.current
      const currentDraftSettings = draftSettingsRef.current
      const currentCreds = credentialsRef.current
      const currentKeys = apiKeysRef.current
      const currentSettings = settingsRef.current
      
      const currentHasChanges = 
        JSON.stringify(currentDraftCreds) !== JSON.stringify(currentCreds) ||
        JSON.stringify(currentDraftKeys) !== JSON.stringify(currentKeys) ||
        JSON.stringify(currentDraftSettings) !== JSON.stringify(currentSettings)
      
      // Check validation on unmount
      const hasErrors = 
        validateName(currentDraftCreds.firstName, 'First name') !== null ||
        validateName(currentDraftCreds.lastName, 'Last name') !== null ||
        validateEmail(currentDraftCreds.email) !== null ||
        validateCountryCode(currentDraftCreds.countryCode) !== null ||
        validatePhone(currentDraftCreds.phone) !== null ||
        validateOpenAIKey(currentDraftKeys.openai) !== null
      
      if (currentHasChanges && !hasErrors) {
        // Save on unmount
        storeSetCredentials(currentDraftCreds)
        storeSetAPIKeys(currentDraftKeys)
        storeSetSettings(currentDraftSettings)
      }
    }
  }, [setCredentials, setAPIKeys, setSettings])

  // Update draft credentials
  const updateDraftCredentials = (updates: Partial<DraftCredentials>) => {
    setDraftCredentials(prev => ({ ...prev, ...updates }))
  }

  // Update draft API keys
  const updateDraftAPIKeys = (updates: Partial<DraftAPIKeys>) => {
    setDraftAPIKeys(prev => ({ ...prev, ...updates }))
  }

  // Update draft settings
  const updateDraftSettings = (updates: Partial<DraftSettings>) => {
    setDraftSettings(prev => ({ ...prev, ...updates }))
  }

  // Reset draft to saved values
  const handleReset = () => {
    setDraftCredentials(credentials)
    setDraftAPIKeys(apiKeys)
    setDraftSettings(settings)
    setTouched({})
    addLog('info', '↩️ Changes discarded')
  }

  const handleSave = () => {
    // Mark all fields as touched to show errors
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      countryCode: true,
      phone: true,
      openai: true,
      captcha: true,
      csvPath: true,
      metaKeywords: true,
    })

    if (hasCriticalErrors) {
      addLog('error', '❌ Please fix validation errors before saving')
      return
    }

    // Save draft to store
    setCredentials(draftCredentials)
    setAPIKeys(draftAPIKeys)
    setSettings(draftSettings)

    setSaved(true)
    addLog('success', '✅ Settings saved successfully')
    setTimeout(() => setSaved(false), 2000)
  }

  // Helper to render validation error
  const renderError = (field: string) => {
    const error = validationErrors[field]
    if (!error || !touched[field]) return null
    return (
      <div className="flex items-center gap-1 mt-1 text-red-600 dark:text-red-400 text-sm">
        <AlertCircle className="w-3 h-3" />
        {error}
      </div>
    )
  }

  // Helper for input class with error state
  const getInputClass = (field: string, additionalClass = '') => {
    const baseClass = "px-4 py-2.5 rounded-lg bg-muted border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2"
    const hasError = touched[field] && validationErrors[field]
    const borderClass = hasError ? "border-red-500 focus:ring-red-500/50" : "border-border focus:ring-primary/50"
    return `${baseClass} ${borderClass} ${additionalClass}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
          <p className="text-muted-foreground">Configure your automation preferences</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Auto-saved indicator */}
          {autoSaved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-pulse">
              <Cloud className="w-4 h-4" />
              Auto-saved
            </span>
          )}
          
          {/* Unsaved changes indicator - only show if there are errors preventing auto-save */}
          {hasUnsavedChanges && !saved && !autoSaved && hasCriticalErrors && (
            <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              Fix errors to auto-save
            </span>
          )}
          
          {/* Error indicator */}
          {hasCriticalErrors && (
            <span className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              Fix errors to save
            </span>
          )}

          {/* Reset button - only show if there are unsaved changes and errors */}
          {hasUnsavedChanges && !saved && hasCriticalErrors && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Discard changes"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}

          {/* Save button - only show if there are errors (manual save to retry) */}
          {hasCriticalErrors && (
            <button
              onClick={handleSave}
              disabled={hasCriticalErrors}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Settings
            </button>
          )}
          
          {/* Status when all is good */}
          {!hasCriticalErrors && !hasUnsavedChanges && !autoSaved && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              All saved
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-muted/50 rounded-lg w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const errorCount = errorCounts[tab.id]
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {errorCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-xs bg-red-500 text-white rounded-full flex items-center justify-center">
                  {errorCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card/50 p-6"
      >
        {activeTab === 'credentials' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">These credentials will be used for sign-ups</p>
                <p className="text-blue-600/80 dark:text-blue-400/80">Make sure to use realistic information. The bot will use these details to fill out forms.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  First Name <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={draftCredentials.firstName}
                  onChange={(e) => updateDraftCredentials({ firstName: e.target.value })}
                  onBlur={() => handleBlur('firstName')}
                  placeholder="John"
                  className={getInputClass('firstName', 'w-full')}
                />
                {renderError('firstName')}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Last Name <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={draftCredentials.lastName}
                  onChange={(e) => updateDraftCredentials({ lastName: e.target.value })}
                  onBlur={() => handleBlur('lastName')}
                  placeholder="Doe"
                  className={getInputClass('lastName', 'w-full')}
                />
                {renderError('lastName')}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email Address <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                type="email"
                value={draftCredentials.email}
                onChange={(e) => updateDraftCredentials({ email: e.target.value })}
                onBlur={() => handleBlur('email')}
                placeholder="john@example.com"
                className={getInputClass('email', 'w-full')}
              />
              {renderError('email')}
              <p className="mt-1 text-xs text-muted-foreground">
                Use a real email address to receive confirmation emails
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Phone Number <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <div className="w-24">
                  <input
                    type="text"
                    value={draftCredentials.countryCode}
                    onChange={(e) => {
                      let value = e.target.value
                      // Auto-add + if user starts typing numbers
                      if (value && !value.startsWith('+')) {
                        value = '+' + value
                      }
                      updateDraftCredentials({ countryCode: value })
                    }}
                    onBlur={() => handleBlur('countryCode')}
                    placeholder="+1"
                    className={getInputClass('countryCode', 'w-full')}
                  />
                  {renderError('countryCode')}
                </div>
                <div className="flex-1">
                  <input
                    type="tel"
                    value={draftCredentials.phone}
                    onChange={(e) => {
                      // Only allow digits, spaces, and dashes
                      const value = e.target.value.replace(/[^\d\s\-]/g, '')
                      updateDraftCredentials({ phone: value })
                    }}
                    onBlur={() => handleBlur('phone')}
                    placeholder="1234567890"
                    className={getInputClass('phone', 'w-full')}
                  />
                  {renderError('phone')}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Note: If a form has a different country code, the bot will auto-generate a valid local number
              </p>
            </div>
          </div>
        )}

        {activeTab === 'apiKeys' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700 dark:text-amber-300">
                <p className="font-medium mb-1">Keep your API keys secure</p>
                <p className="text-amber-600/80 dark:text-amber-400/80">Never share your API keys. They are stored locally on your device.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                OpenAI API Key <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showOpenAI ? 'text' : 'password'}
                  value={draftAPIKeys.openai}
                  onChange={(e) => updateDraftAPIKeys({ openai: e.target.value })}
                  onBlur={() => handleBlur('openai')}
                  placeholder="sk-..."
                  className={getInputClass('openai', 'w-full pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAI(!showOpenAI)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showOpenAI ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {renderError('openai')}
              <p className="mt-2 text-sm text-muted-foreground">
                Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com</a>
              </p>
              {draftAPIKeys.openai && !validationErrors.openai && (
                <div className="flex items-center gap-1 mt-1 text-emerald-600 dark:text-emerald-400 text-sm">
                  <CheckCircle2 className="w-3 h-3" />
                  Valid API key format
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                2Captcha API Key <span className="text-muted-foreground text-xs">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type={showCaptcha ? 'text' : 'password'}
                  value={draftAPIKeys.captcha}
                  onChange={(e) => updateDraftAPIKeys({ captcha: e.target.value })}
                  onBlur={() => handleBlur('captcha')}
                  placeholder="2Captcha API Key (Optional)"
                  className={getInputClass('captcha', 'w-full pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowCaptcha(!showCaptcha)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showCaptcha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {renderError('captcha')}
              <p className="mt-2 text-sm text-muted-foreground">
                Used for solving CAPTCHAs automatically. Get it from <a href="https://2captcha.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">2captcha.com</a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                LLM Model
              </label>
              <select
                value={draftSettings.llmModel}
                onChange={(e) => updateDraftSettings({ llmModel: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (Recommended - Fast & Cost-Effective)</option>
                <option value="gpt-4o">GPT-4o (Higher Accuracy, Higher Cost)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
              <p className="mt-2 text-sm text-muted-foreground">
                GPT-4o Mini offers great accuracy at lower cost. Use GPT-4o for complex forms.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'dataSource' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Data Source
              </label>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => updateDraftSettings({ dataSource: 'meta' })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    draftSettings.dataSource === 'meta'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium mb-1">Meta Ads Library</div>
                  <div className="text-sm text-muted-foreground">
                    Scrape landing pages from Facebook/Instagram ads
                  </div>
                </button>
                <button
                  onClick={() => updateDraftSettings({ dataSource: 'csv' })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    draftSettings.dataSource === 'csv'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium mb-1">CSV File</div>
                  <div className="text-sm text-muted-foreground">
                    Load URLs from a local CSV file
                  </div>
                </button>
                <button
                  onClick={() => updateDraftSettings({ dataSource: 'database' })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    draftSettings.dataSource === 'database'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium mb-1">Database</div>
                  <div className="text-sm text-muted-foreground">
                    Process URLs previously scraped from Meta Ads
                  </div>
                </button>
              </div>
            </div>

            {draftSettings.dataSource === 'meta' && (
              <>
                {/* Info Box */}
                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-purple-700 dark:text-purple-300 mb-2">Meta Ads Library Scraper</p>
                      <p className="text-purple-600/80 dark:text-purple-400/80">
                        This option searches Facebook/Instagram Ads Library for landing pages based on your keywords. 
                        It finds active ads and extracts the landing page URLs for sign-up automation.
                      </p>
                      <ul className="mt-2 space-y-1 text-purple-600/80 dark:text-purple-400/80 list-disc list-inside">
                        <li>Automatically discovers new landing pages</li>
                        <li>Finds pages from active paid ads</li>
                        <li>Scraped URLs are saved to Database for later use</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Search Keywords <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={draftSettings.metaKeywords}
                    onChange={(e) => updateDraftSettings({ metaKeywords: e.target.value })}
                    onBlur={() => handleBlur('metaKeywords')}
                    placeholder="marketing, funnel, webinar"
                    className={getInputClass('metaKeywords', 'w-full')}
                  />
                  {renderError('metaKeywords')}
                  <p className="mt-2 text-sm text-muted-foreground">
                    Comma-separated keywords to search for ads (e.g., "marketing, email list, lead magnet")
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Max Ads to Scrape
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={adLimitInput}
                    onChange={(e) => {
                      // Allow free typing - just update the string state
                      const inputValue = e.target.value
                      setAdLimitInput(inputValue)
                      
                      // Only update draft if it's a valid number
                      const numValue = parseInt(inputValue)
                      if (!isNaN(numValue) && numValue >= 5 && numValue <= 100) {
                        updateDraftSettings({ adLimit: numValue })
                      }
                    }}
                    onBlur={(e) => {
                      handleBlur('adLimit')
                      const inputValue = e.target.value
                      const numValue = parseInt(inputValue)
                      
                      // Validate and clamp on blur
                      if (isNaN(numValue) || numValue < 5) {
                        // Too low or invalid - set to minimum
                        const clamped = 5
                        setAdLimitInput(clamped.toString())
                        updateDraftSettings({ adLimit: clamped })
                      } else if (numValue > 100) {
                        // Too high - set to maximum
                        const clamped = 100
                        setAdLimitInput(clamped.toString())
                        updateDraftSettings({ adLimit: clamped })
                      } else {
                        // Valid - ensure draft is updated
                        updateDraftSettings({ adLimit: numValue })
                      }
                    }}
                    className={getInputClass('adLimit', 'w-32')}
                  />
                  {renderError('adLimit')}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Between 5 and 100 ads
                  </p>
                </div>
              </>
            )}

            {draftSettings.dataSource === 'csv' && (
              <>
                {/* Info Box */}
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-emerald-700 dark:text-emerald-300 mb-2">Import URLs from CSV File</p>
                      <p className="text-emerald-600/80 dark:text-emerald-400/80">
                        Load landing page URLs from a local CSV file. Great for using your own curated list of websites.
                      </p>
                      <div className="mt-3 p-3 rounded bg-black/20 dark:bg-white/5 font-mono text-xs">
                        <p className="text-emerald-500 dark:text-emerald-400 mb-1">Required CSV Format:</p>
                        <p className="text-gray-600 dark:text-gray-400">url</p>
                        <p className="text-gray-600 dark:text-gray-400">https://example.com/landing-page</p>
                        <p className="text-gray-600 dark:text-gray-400">https://another-site.com/signup</p>
                        <p className="text-muted-foreground mt-2">• Only the <strong>url</strong> column is required</p>
                        <p className="text-muted-foreground">• Column name can be: url, link, landing_page, or website</p>
                      </div>
                      <button
                        onClick={async () => {
                          const csvContent = 'url\nhttps://example.com/landing-page\nhttps://another-site.com/signup\nhttps://somewebsite.com/subscribe'
                          
                          // @ts-ignore - Check if running in Tauri
                          if (window.__TAURI__) {
                            try {
                              const { save } = await import('@tauri-apps/api/dialog')
                              const { writeTextFile } = await import('@tauri-apps/api/fs')
                              
                              const filePath = await save({
                                defaultPath: 'sample-urls.csv',
                                filters: [{ name: 'CSV', extensions: ['csv'] }]
                              })
                              
                              if (filePath) {
                                await writeTextFile(filePath, csvContent)
                                addLog('success', `✅ Sample CSV saved to ${filePath}`)
                              }
                            } catch (err) {
                              console.error('Failed to save file:', err)
                              addLog('error', `Failed to save sample CSV: ${err}`)
                            }
                          } else {
                            // Fallback for browser/dev mode
                            const blob = new Blob([csvContent], { type: 'text/csv' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = 'sample-urls.csv'
                            document.body.appendChild(a)
                            a.click()
                            document.body.removeChild(a)
                            URL.revokeObjectURL(url)
                          }
                        }}
                        className="mt-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 text-sm font-medium"
                      >
                        <Download className="w-4 h-4" />
                        Download Sample CSV
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    CSV File Path <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draftSettings.csvPath}
                      onChange={(e) => updateDraftSettings({ csvPath: e.target.value })}
                      onBlur={() => handleBlur('csvPath')}
                      placeholder="Path to CSV file..."
                      className={getInputClass('csvPath', 'flex-1')}
                    />
                    <button
                      onClick={async () => {
                        // In production, use Tauri dialog
                        // @ts-ignore
                        if (window.__TAURI__) {
                          const { open } = await import('@tauri-apps/api/dialog')
                          const selected = await open({
                            multiple: false,
                            filters: [{ name: 'CSV', extensions: ['csv'] }]
                          })
                          if (selected && typeof selected === 'string') {
                            updateDraftSettings({ csvPath: selected })
                            setTouched(prev => ({ ...prev, csvPath: true }))
                          }
                        }
                      }}
                      className="px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  </div>
                  {renderError('csvPath')}
                  {draftSettings.csvPath && !validationErrors.csvPath && (
                    <div className="flex items-center gap-1 mt-2 text-emerald-600 dark:text-emerald-400 text-sm">
                      <CheckCircle2 className="w-3 h-3" />
                      CSV file selected
                    </div>
                  )}
                </div>
              </>
            )}

            {draftSettings.dataSource === 'database' && (
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-700 dark:text-blue-300 mb-2">Using saved URLs from database</p>
                    <p className="text-blue-600/80 dark:text-blue-400/80">
                      This will process URLs that were previously scraped from Meta Ads but haven't been processed yet. 
                      To add more URLs, first run with "Meta Ads Library" source.
                    </p>
                    <p className="mt-2 text-blue-600/80 dark:text-blue-400/80">
                      Check the <span className="font-medium">Database</span> tab to see available URLs.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Max Sign-ups
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxSignupsInput}
                onChange={(e) => {
                  // Allow free typing - just update the string state
                  const inputValue = e.target.value
                  setMaxSignupsInput(inputValue)
                  
                  // Only update draft if it's a valid number in range
                  const numValue = parseInt(inputValue)
                  if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
                    updateDraftSettings({ maxSignups: numValue })
                  }
                }}
                onBlur={(e) => {
                  handleBlur('maxSignups')
                  const inputValue = e.target.value
                  const numValue = parseInt(inputValue)
                  
                  // Validate and clamp on blur
                  if (isNaN(numValue) || numValue < 1) {
                    const clamped = 1
                    setMaxSignupsInput(clamped.toString())
                    updateDraftSettings({ maxSignups: clamped })
                  } else if (numValue > 100) {
                    const clamped = 100
                    setMaxSignupsInput(clamped.toString())
                    updateDraftSettings({ maxSignups: clamped })
                  } else {
                    updateDraftSettings({ maxSignups: numValue })
                  }
                }}
                className="w-32 px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Maximum number of sign-ups per session (1-100)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Delay Between Sign-ups (seconds)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={minDelayInput}
                  onChange={(e) => {
                    // Allow free typing
                    const inputValue = e.target.value
                    setMinDelayInput(inputValue)
                    
                    const numValue = parseInt(inputValue)
                    if (!isNaN(numValue) && numValue >= 5 && numValue <= 60) {
                      updateDraftSettings({ minDelay: numValue })
                    }
                  }}
                  onBlur={(e) => {
                    handleBlur('minDelay')
                    const inputValue = e.target.value
                    const numValue = parseInt(inputValue)
                    
                    // Validate and clamp on blur
                    if (isNaN(numValue) || numValue < 5) {
                      const clamped = 5
                      setMinDelayInput(clamped.toString())
                      updateDraftSettings({ minDelay: clamped })
                    } else if (numValue > 60) {
                      const clamped = 60
                      setMinDelayInput(clamped.toString())
                      updateDraftSettings({ minDelay: clamped })
                    } else {
                      updateDraftSettings({ minDelay: numValue })
                      // If minDelay > maxDelay, adjust maxDelay
                      if (numValue > draftSettings.maxDelay) {
                        setMaxDelayInput(numValue.toString())
                        updateDraftSettings({ maxDelay: numValue })
                      }
                    }
                  }}
                  className="w-24 px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={maxDelayInput}
                  onChange={(e) => {
                    // Allow free typing
                    const inputValue = e.target.value
                    setMaxDelayInput(inputValue)
                    
                    const numValue = parseInt(inputValue)
                    if (!isNaN(numValue) && numValue >= 10 && numValue <= 120) {
                      updateDraftSettings({ maxDelay: numValue })
                    }
                  }}
                  onBlur={(e) => {
                    handleBlur('maxDelay')
                    const inputValue = e.target.value
                    const numValue = parseInt(inputValue)
                    
                    // Validate and clamp on blur
                    if (isNaN(numValue) || numValue < 10) {
                      const clamped = Math.max(10, draftSettings.minDelay)
                      setMaxDelayInput(clamped.toString())
                      updateDraftSettings({ maxDelay: clamped })
                    } else if (numValue > 120) {
                      const clamped = 120
                      setMaxDelayInput(clamped.toString())
                      updateDraftSettings({ maxDelay: clamped })
                    } else if (numValue < draftSettings.minDelay) {
                      // Max can't be less than min
                      const clamped = draftSettings.minDelay
                      setMaxDelayInput(clamped.toString())
                      updateDraftSettings({ maxDelay: clamped })
                    } else {
                      updateDraftSettings({ maxDelay: numValue })
                    }
                  }}
                  className="w-24 px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Random delay between sign-ups (min: 5-60s, max: 10-120s)
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">Headless Mode</div>
                <div className="text-sm text-muted-foreground">Run browser in background (invisible)</div>
              </div>
              <button
                onClick={() => updateDraftSettings({ headless: !draftSettings.headless })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  draftSettings.headless ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  draftSettings.headless ? 'translate-x-7' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">Detailed Logs</div>
                <div className="text-sm text-muted-foreground">Show technical details (off = simple one-liner logs)</div>
              </div>
              <button
                onClick={() => {
                  const newValue = !draftSettings.detailedLogs
                  // Update both detailedLogs and legacy debug field to keep them in sync
                  updateDraftSettings({ detailedLogs: newValue, debug: newValue })
                }}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  draftSettings.detailedLogs ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  draftSettings.detailedLogs ? 'translate-x-7' : 'translate-x-1'
                }`} />
              </button>
            </div>

          </div>
        )}

        {activeTab === 'about' && (
          <div className="space-y-6">
            {/* App Info */}
            <div className="p-6 rounded-xl border border-border bg-card/50">
              <div className="flex items-center gap-4 mb-6">
                <img 
                  src="/InboxHunter-logo-icon.png" 
                  alt="InboxHunter" 
                  className="w-16 h-16 rounded-2xl shadow-lg object-cover"
                />
                <div>
                  <h3 className="text-2xl font-bold text-foreground">InboxHunter</h3>
                  <p className="text-muted-foreground">AI-Powered Lead Generation</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Package className="w-4 h-4" />
                    Version
                  </div>
                  <div className="text-lg font-semibold text-foreground">v{appVersion}</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Globe className="w-4 h-4" />
                    Platform
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {navigator.platform.includes('Mac') ? 'macOS' : navigator.platform.includes('Win') ? 'Windows' : 'Desktop'}
                  </div>
                </div>
              </div>
            </div>

            {/* Updates Section */}
            <div className="p-6 rounded-xl border border-border bg-card/50">
              <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Software Updates
              </h4>
              
              {/* Update Available */}
              {(updateState.status === 'available' || updateState.status === 'downloading' || updateState.status === 'installing' || updateState.status === 'downloaded') && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium">
                        <Sparkles className="w-4 h-4" />
                        Version {updateState.version} is available!
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {updateState.status === 'downloading' ? 'Downloading update...' :
                         updateState.status === 'installing' ? 'Installing update...' :
                         updateState.status === 'downloaded' ? 'Ready to install' :
                         'A new version is ready to install'}
                      </p>
                    </div>
                    <button
                      onClick={handleInstallUpdate}
                      disabled={updateState.status !== 'available'}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {updateState.status === 'downloading' || updateState.status === 'installing' || updateState.status === 'downloaded' ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {updateState.status === 'installing' ? 'Installing...' : 
                           updateState.status === 'downloaded' ? 'Installing...' : 'Downloading...'}
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Install Update
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              
              {/* Error State */}
              {updateState.status === 'error' && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">Update failed</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {updateState.error || 'An error occurred during update'}
                  </p>
                </div>
              )}
              
              {/* Up to Date */}
              {(updateState.status === 'idle' || updateState.status === 'checking') && (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">You're up to date!</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    InboxHunter v{appVersion} is the latest version
                  </p>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {lastChecked ? `Last checked: ${lastChecked}` : 'Not checked yet'}
                </div>
                <button
                  onClick={checkForUpdates}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-medium transition-colors disabled:opacity-50"
                >
                  {isCheckingUpdate ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Check for Updates
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Logs */}
            <div className="p-6 rounded-xl border border-border bg-card/50">
              <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Submit Logs for Support
              </h4>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  If you're experiencing issues, submit your logs to help us diagnose the problem.
                  Sensitive information (API keys, emails, phone numbers) will be automatically removed.
                </p>

                {/* Success Message */}
                {logSubmissionResult?.success && (
                  <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Logs submitted successfully!</span>
                    </div>
                    {logSubmissionResult.issueUrl && (
                      <a
                        href={logSubmissionResult.issueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 mt-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        View submitted report
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {logSubmissionResult?.error && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">{logSubmissionResult.error}</span>
                    </div>
                  </div>
                )}

                {/* Description Input */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Describe the issue
                  </label>
                  <textarea
                    value={logDescription}
                    onChange={(e) => setLogDescription(e.target.value)}
                    placeholder="What were you doing when the problem occurred? What did you expect to happen?"
                    rows={3}
                    disabled={isSubmittingLogs}
                    className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 resize-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleSubmitLogs}
                  disabled={isSubmittingLogs || !logDescription.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingLogs ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Logs
                    </>
                  )}
                </button>

                <p className="text-xs text-muted-foreground">
                  Note: Most recent log file will be included with your submission.
                </p>
              </div>
            </div>

            {/* Copyright */}
            <div className="text-center text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} InboxHunter. All rights reserved.</p>
              <p className="mt-1">Built with Tauri, React, and GPT-4 Vision</p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

