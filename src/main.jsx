import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { installGlobalErrorHandlers } from './lib/errorLog.js'
import './index.css'

// Vangt fouten op die buiten React ontstaan (losse promises, event-handlers).
installGlobalErrorHandlers()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary naam="app">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)