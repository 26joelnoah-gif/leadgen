import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function CopyButton({ text, label = "Kopieer" }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(err => {
      console.error("Kon niet kopiëren:", err)
    })
  }

  return (
    <button 
      onClick={handleCopy}
      title={label}
      style={{
        background: copied ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
        color: copied ? 'var(--success)' : 'var(--text-muted)',
        border: '1px solid ' + (copied ? 'var(--success)' : 'var(--border)'),
        padding: '4px 8px',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        fontSize: '0.75rem',
        fontWeight: copied ? 700 : 500,
        transition: 'all 0.2s',
        marginLeft: '8px'
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Gekopieerd!' : ''}
    </button>
  )
}
