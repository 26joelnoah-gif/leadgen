import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Chat() {
  const { user, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    setIsAdmin(profile?.role === 'admin')
    
    // Initial fetch
    fetchMessages()

    // Real-time subscription
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

  async function fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(50)
    
    if (data) setMessages(data)
  }

  async function sendMessage() {
    if (!input.trim() || !user) return

    const { error } = await supabase.from('messages').insert({
      text: input.trim(),
      user_id: user.id,
      user_name: profile?.full_name || user?.email,
      is_admin: isAdmin
    })

    if (!error) setInput('')
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="chat-container">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="chat-window"
          >
            <div className="chat-header">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} />
                <span>Team Chat</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="chat-messages">
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40%' }}>
                  <MessageCircle size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ fontSize: '0.9rem' }}>Nog geen berichten</p>
                  <p style={{ fontSize: '0.8rem' }}>Start een gesprek met je team</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`chat-message ${msg.is_admin ? 'admin' : 'user'}`}
                  >
                    {msg.is_admin && (
                      <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '4px' }}>
                        {msg.user_name} (Admin)
                      </div>
                    )}
                    {!msg.is_admin && (
                       <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '4px' }}>
                        {msg.user_name}
                      </div>
                    )}
                    <div>{msg.text}</div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '4px', textAlign: 'right' }}>
                      {new Date(msg.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Typ een bericht..."
              />
              <button
                onClick={sendMessage}
                className="btn btn-primary btn-sm"
                style={{ padding: '10px' }}
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="chat-toggle"
          onClick={() => setIsOpen(true)}
        >
          <MessageCircle size={24} />
          {messages.length > 0 && (
            <span style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 20,
              height: 20,
              background: 'var(--danger)',
              borderRadius: '50%',
              fontSize: '0.7rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {messages.length}
            </span>
          )}
        </motion.button>
      )}
    </div>
  )
}