import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Initialize theme from storage before render to prevent flash
const initTheme = () => {
  try {
    const stored = localStorage.getItem('inboxhunter-theme')
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    
    if (stored) {
      const { state } = JSON.parse(stored)
      const theme = state?.theme || 'system'
      const resolved = theme === 'system' ? systemTheme : theme
      
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(resolved)
    } else {
      // Default to system preference
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(systemTheme)
    }
  } catch {
    // Default to system preference if there's any error
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(systemTheme)
  }
}

initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
