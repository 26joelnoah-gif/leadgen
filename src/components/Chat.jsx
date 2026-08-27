import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Plus, Hash, Users, Lock, UserPlus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

const GENERAL_CHANNEL = { id: 'general', name: 'Team', is_default: true }

export default function Chat() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [channels, setChannels] = useState([GENERAL_CHANNEL])
  const [currentChannel, setCurrentChannel] = useState('general')
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelCampaignId, setNewChannelCampaignId] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [managedCampaignIds, setManagedCampaignIds] = useState([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting') // 'connecting' | 'connected' | 'error'
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [oldestMessageId, setOldestMessageId] = useState(null)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [channelMembers, setChannelMembers] = useState([])
  const [orgProfiles, setOrgProfiles] = useState([])
  const [addMemberId, setAddMemberId] = useState('')
  const [membersLoading, setMembersLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)

  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'manager'
  const canCreateChannels = isAdmin || isManager

  const currentChannelObj = channels.find(ch => ch.id === currentChannel) || GENERAL_CHANNEL
  const canManageCurrentChannel = currentChannel !== 'general' && (
    isAdmin ||
    currentChannelObj.created_by === user?.id ||
    (currentChannelObj.campaign_id && managedCampaignIds.includes(currentChannelObj.campaign_id))
  )

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
    if (isManager) fetchManagedCampaignIds()
  }, [isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    fetchMessages()
  }, [currentChannel, isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    // Real-time subscription with connection status
    setConnectionStatus('connecting')
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
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected')
        } else if (status === 'CHANNEL_ERROR') {
          setConnectionStatus('error')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentChannel, isInitialized])

  async function fetchChannels() {
    try {
      // RLS bepaalt al welke kanalen deze gebruiker mag zien
      // (open kanalen + kanalen waar hij/zij lid van is + eigen/beheerde kanalen).
      const { data, error } = await supabase
        .from('chat_channels')
        .select('*, campaigns(name)')
        .order('created_at')
      if (error) throw error
      if (data) {
        setChannels([GENERAL_CHANNEL, ...data])
      }
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function fetchManagedCampaignIds() {
    try {
      const { data, error } = await supabase
        .from('campaign_managers')
        .select('campaign_id')
        .eq('manager_id', user.id)
      if (error) throw error
      setManagedCampaignIds((data || []).map(r => r.campaign_id))
    } catch (err) {
      // niet kritiek voor de rest van de chat
      console.error('fetchManagedCampaignIds', err)
    }
  }

  async function fetchMessages() {
    try {
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

      const { data, error } = await query
      if (error) throw error
      if (data) {
        setMessages(data)
        setHasMore(data.length === 50)
        setOldestMessageId(data.length > 0 ? data[0].id : null)
      }
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function loadMoreMessages() {
    if (!oldestMessageId || loadingMore) return
    setLoadingMore(true)

    try {
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50)
        .lt('id', oldestMessageId)

      if (currentChannel === 'general') {
        query = query.is('channel_id', null)
      } else {
        query = query.eq('channel_id', currentChannel)
      }

      const { data, error } = await query
      if (error) throw error
      if (data && data.length > 0) {
        setMessages(prev => [...prev, ...data])
        setOldestMessageId(data[data.length - 1].id)
        setHasMore(data.length === 50)
      } else {
        setHasMore(false)
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  async function openChannelModal() {
    setShowChannelModal(true)
    if (campaigns.length > 0) return
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      setCampaigns(data || [])
    } catch (err) {
      console.error('fetchCampaigns', err)
    }
  }

  async function createChannel() {
    if (!newChannelName.trim()) return

    const { data, error } = await supabase
      .from('chat_channels')
      .insert({
        name: newChannelName.trim(),
        campaign_id: newChannelCampaignId || null,
        restricted: !!newChannelCampaignId,
        organization_id: profile?.organization_id || null,
        created_by: user.id
      })
      .select('*, campaigns(name)')
      .single()

    if (data && !error) {
      setChannels(prev => [...prev, data])
      setCurrentChannel(data.id)
      setNewChannelName('')
      setNewChannelCampaignId('')
      setShowChannelModal(false)
    } else if (error) {
      toast('Kon kanaal niet aanmaken: ' + error.message, 'error')
    }
  }

  async function openMembersModal() {
    setShowMembersModal(true)
    setMembersLoading(true)
    try {
      const [membersRes, profilesRes] = await Promise.all([
        supabase
          .from('chat_channel_members')
          .select('user_id, added_at, profiles(id, full_name, email)')
          .eq('channel_id', currentChannel),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .order('full_name')
      ])
      if (membersRes.error) throw membersRes.error
      if (profilesRes.error) throw profilesRes.error
      setChannelMembers(membersRes.data || [])
      setOrgProfiles(profilesRes.data || [])
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setMembersLoading(false)
    }
  }

  async function addMember() {
    if (!addMemberId) return
    const { error } = await supabase
      .from('chat_channel_members')
      .insert({ channel_id: currentChannel, user_id: addMemberId, added_by: user.id })
    if (error) {
      toast('Kon lid niet toevoegen: ' + error.message, 'error')
      return
    }
    setAddMemberId('')
    openMembersModal()
  }

  async function removeMember(memberUserId) {
    const { error } = await supabase
      .from('chat_channel_members')
      .delete()
      .eq('channel_id', currentChannel)
      .eq('user_id', memberUserId)
    if (error) {
      toast('Kon lid niet verwijderen: ' + error.message, 'error')
      return
    }
    setChannelMembers(prev => prev.filter(m => m.user_id !== memberUserId))
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
      toast('Kon bericht niet verzenden: ' + error.message, 'error')
    }
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const availableProfiles = orgProfiles.filter(p => !channelMembers.some(m => m.user_id === p.id))

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
            <div className="chat-header" style={{ justifyContent: 'space-between' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={18} />
                <span>Team Chat</span>
                <span style={{
                  fontSize: '0.6rem',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: connectionStatus === 'connected' ? 'rgba(34, 197, 94, 0.2)' : connectionStatus === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'error' ? '#ef4444' : '#eab308'
                }}>
                  {connectionStatus === 'connected' ? '● Live' : connectionStatus === 'error' ? '● Error' : '● Connecting'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {canManageCurrentChannel && (
                  <button
                    onClick={openMembersModal}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px' }}
                    title="Leden beheren"
                  >
                    <Users size={18} />
                  </button>
                )}
                {canCreateChannels && (
                  <button
                    onClick={openChannelModal}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px' }}
                    title="Nieuw kanaal"
                  >
                    <Plus size={18} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
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
                  title={ch.campaigns?.name ? `Project: ${ch.campaigns.name}` : undefined}
                >
                  {ch.restricted ? <Lock size={12} /> : <Hash size={12} />} {ch.name}
                </button>
              ))}
            </div>

            <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {hasMore && (
                <button
                  onClick={loadMoreMessages}
                  disabled={loadingMore}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginBottom: '12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  {loadingMore ? 'Laden...' : 'Oudere berichten laden'}
                </button>
              )}
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

            {/* Create Channel Modal (admin/manager) */}
            {showChannelModal && (
              <div className="modal-overlay" onClick={() => setShowChannelModal(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px' }}>
                <div className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ padding: '24px', maxWidth: '320px', width: '90%' }}>
                  <h3 style={{ marginBottom: '16px' }}><Plus size={18} /> Nieuw Kanaal</h3>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={e => setNewChannelName(e.target.value)}
                    placeholder="Kanaal naam"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' }}
                  />
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Koppel aan project (optioneel)
                  </label>
                  <select
                    value={newChannelCampaignId}
                    onChange={e => setNewChannelCampaignId(e.target.value)}
                    className="form-dark"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px' }}
                  >
                    <option value="">Geen project (open kanaal)</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {newChannelCampaignId && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      Dit kanaal is alleen zichtbaar voor leden die je erbij toevoegt.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setShowChannelModal(false)} className="btn btn-outline btn-sm" style={{ flex: 1 }}>Annuleren</button>
                    <button onClick={createChannel} className="btn btn-primary btn-sm" style={{ flex: 1 }}>Aanmaken</button>
                  </div>
                </div>
              </div>
            )}

            {/* Manage Members Modal */}
            {showMembersModal && (
              <div className="modal-overlay" onClick={() => setShowMembersModal(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px' }}>
                <div className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ padding: '24px', maxWidth: '340px', width: '90%', maxHeight: '420px', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ marginBottom: '12px' }}><Users size={18} /> Leden van #{currentChannelObj.name}</h3>

                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
                    {membersLoading ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Laden...</p>
                    ) : channelMembers.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nog geen leden toegevoegd.</p>
                    ) : (
                      channelMembers.map(m => (
                        <div key={m.user_id} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.85rem' }}>{m.profiles?.full_name || m.profiles?.email || m.user_id}</span>
                          <button
                            onClick={() => removeMember(m.user_id)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger, #ef4444)', cursor: 'pointer', padding: '4px' }}
                            title="Verwijderen uit kanaal"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2" style={{ marginBottom: '12px' }}>
                    <select
                      value={addMemberId}
                      onChange={e => setAddMemberId(e.target.value)}
                      className="form-dark"
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    >
                      <option value="">Kies persoon...</option>
                      {availableProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                    <button onClick={addMember} className="btn btn-primary btn-sm" disabled={!addMemberId} title="Toevoegen">
                      <UserPlus size={16} />
                    </button>
                  </div>

                  <button onClick={() => setShowMembersModal(false)} className="btn btn-outline btn-sm">Sluiten</button>
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
