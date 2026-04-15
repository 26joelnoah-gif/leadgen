import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Clock, Award, Phone } from 'lucide-react'

export default function ActivityFeed() {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActivities()

    // Subscribe to new activities - optimistische prepend i.p.v. refetch alles
    const subscription = supabase
      .channel('live-activities')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, (payload) => {
        // Optimistisch prepend de nieuwe activity
        const newActivity = payload.new
        if (newActivity) {
          setActivities(prev => {
            // Check of het niet al in de lijst zit
            if (prev.some(a => a.id === newActivity.id)) return prev
            return [newActivity, ...prev].slice(0, 10) // Max 10 items
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  async function fetchActivities() {
    try {
      // Use join with profiles for names
      const { data, error } = await supabase
        .from('activities')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        // Fallback if join fails
        const { data: simpleData } = await supabase
          .from('activities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10)
        setActivities(simpleData || [])
      } else {
        setActivities(data || [])
      }
    } catch (err) {
      console.error('Error fetching activities:', err)
    } finally {
      setLoading(false)
    }
  }

  const getIcon = (action) => {
    switch (action) {
      case 'deal': return <Award size={14} className="text-secondary" />
      case 'afspraak_gemaakt': return <Clock size={14} className="text-success" />
      case 'call': return <Phone size={14} className="text-primary" />
      default: return <Activity size={14} className="text-muted" />
    }
  }

  const getActionText = (a) => {
    if (!a) return null
    const name = a.profiles?.full_name || 'Iemand'
    switch (a.action) {
      case 'deal': return <span><strong>{name}</strong> sloot een <strong>DEAL</strong>! 🏆</span>
      case 'afspraak_gemaakt': return <span><strong>{name}</strong> maakte een afspraak 📅</span>
      case 'call': return <span><strong>{name}</strong> is aan het bellen 📞</span>
      case 'status_change': return <span><strong>{name}</strong> update een lead status</span>
      default: return <span><strong>{name}</strong> voerde een actie uit</span>
    }
  }

  if (loading && activities.length === 0) return null

  return (
    <div className="card glass-panel mt-4" style={{ padding: '16px' }}>
      <div className="card-header mb-3" style={{ border: 'none', padding: 0 }}>
        <span className="card-title" style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={16} className="text-secondary" /> LIVE FEED
        </span>
      </div>
      <div className="activity-list flex flex-column gap-3">
        <AnimatePresence mode='popLayout'>
          {activities.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{ fontSize: '0.8rem', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', borderLeft: `2px solid ${a.action === 'deal' ? 'var(--secondary)' : 'var(--border)'}` }}
            >
              <div className="flex items-center gap-2 mb-1">
                {getIcon(a.action)}
                <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                  {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="activity-text">
                {getActionText(a)}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <style>{`
        .activity-list { max-height: 400px; overflow-y: auto; scrollbar-width: none; }
        .activity-list::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
