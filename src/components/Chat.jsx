import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Plus, Hash, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Chat() {
  const { user, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [channels, setChannels] = useState([{ id: 'general', name: 'Team', is_default: true }])
  const [currentChannel, setCurrentChannel] = useState('general')
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const messagesEndRef = useRef(null)

  const isAdmin = profile?.role === 'admin'

  // Initialize on mount
  useEffect(() => {
    setIsInitialized(true)
  }, [])

  // Auto-scroll naar nieuwe berichten
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!isInitialized) return
    fetchChannels()
    fetchMessages()
  }, [currentChannel, isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    // Real-time subscription
    const channel = supabase
      .channel('chat-messages-' + currentChannel)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new
        const matchesChannel = currentChannel === 'general'
          ? !msg.channel_id || msg.channel_id === null
          : msg.channel_id === currentChannel
        if (matchesChannel) {
          setMessages(prev => [...prev, msg])
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentChannel, isInitialized])

  async function fetchChannels() {
    if (isAdmin) {
      const { data } = await supabase.from('chat_channels').select('*').order('created_at')
      if (data) {
        const allChannels = [{ id: 'general', name: 'Team', is_default: true }, ...data]
        setChannels(allChannels)
      }
    }
  }

  async function fetchMessages() {
    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(50)

    if (currentChannel === 'general') {
      query = query.is('channel_id', null)
    } else {
      query = query.eq('channel_id', currentChannel)
    }

    const { data } = await query
    if (data) setMessages(data)
  }

  async function createChannel() {
    if (!newChannelName.trim()) return

    const { data, error } = await supabase
      .from('chat_channels')
      .insert({ name: newChannelName.trim() })
      .select()
      .single()

    if (data && !error) {
      setChannels([...channels, data])
      setCurrentChannel(data.id)
      setNewChannelName('')
      setShowChannelModal(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || !user) return

    const safeText = input.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")

    const messageData = {
      text: safeText,
      user_id: user.id,
      user_name: profile?.full_name || user?.email,
      is_admin: isAdmin,
      channel_id: currentChannel === 'general' ? null : currentChannel
    }

    // Optimistic update - toon direct in UI
    const tempId = 'temp-' + Date.now()
    const optimisticMsg = {
      ...messageData,
      id: tempId,
      created_at: new Date().toISOString(),
      pending: true
    }
    setMessages(prev => [...prev, optimisticMsg])
    setInput('')

    const { error } = await supabase.from('messages').insert(messageData)

    if (error) {
      // Verwijder optimistic message bij error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      console.error('Kon bericht niet verzenden:', error.message)
    }
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
            style={{ width: '380px', height: '500px' }}
          >
            <div className="chat-header" style={{ justifyContent: 'space-between' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={18} />
                <span>Team Chat</span>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => setShowChannelModal(true)}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}
                    title="Nieuw kanaal"
                  >
                    <Plus size={18} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Channel tabs */}
            <div className="chat-channels" style={{ display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {channels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => setCurrentChannel(ch.id)}
                  className={`btn btn-sm ${currentChannel === ch.id ? 'btn-secondary' : 'btn-outline'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
                >
                  <Hash size={12} /> {ch.name}
                </button>
              ))}
            </div>

            <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40%' }}>
                  <MessageCircle size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p style={{ fontSize: '0.9rem' }}>Nog geen berichten</p>
                  <p style={{ fontSize: '0.8rem' }}>in dit kanaal</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`chat-message ${msg.is_admin ? 'admin' : 'user'} ${msg.pending ? 'pending' : ''}`}
                    style={{ marginBottom: '12px', opacity: msg.pending ? 0.6 : 1 }}
                  >
                    <div className="flex justify-between items-start">
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: msg.is_admin ? 'var(--secondary)' : 'var(--primary)' }}>
                        {msg.user_name}
                        {msg.is_admin && <span style={{ opacity: 0.7 }}> (Admin)</span>}
                      </div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>
                        {new Date(msg.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                        {msg.pending && ' • verzenden...'}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.9rem', marginTop: '2px' }}>{msg.text}</div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container" style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Typ een bericht..."
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
                <button
                  onClick={sendMessage}
                  className="btn btn-primary btn-sm"
                  style={{ padding: '10px 14px' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>

            {/* Create Channel Modal (Admin only) */}
            {showChannelModal && (
              <div className="modal-overlay" onClick={() => setShowChannelModal(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px' }}>
                <div className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ padding: '24px', maxWidth: '300px' }}>
                  <h3 style={{ marginBottom: '16px' }}><Plus size={18} /> Nieuw Kanaal</h3>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={e => setNewChannelName(e.target.value)}
                    placeholder="Kanaal naam"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowChannelModal(false)} className="btn btn-outline btn-sm" style={{ flex: 1 }}>Annuleren</button>
                    <button onClick={createChannel} className="btn btn-primary btn-sm" style={{ flex: 1 }}>Aanmaken</button>
                  </div>
                </div>
              </div>
            )}
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
        </motion.button>
      )}
    </div>
  )
}