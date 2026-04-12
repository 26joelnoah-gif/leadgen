import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Trophy, Zap, TrendingUp } from 'lucide-react'

export default function TeamLeaderboard() {
  const { user, profile, isDemoMode } = useAuth()
  const [teamStats, setTeamStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTeamStats()
  }, [isDemoMode])

  async function fetchTeamStats() {
    setLoading(true)

    if (isDemoMode) {
      // Demo data - simulate team members
      setTeamStats([
        { full_name: 'Jan de Vries', call_count: 12, avatar: 'J' },
        { full_name: 'Maria Admin', call_count: 8, avatar: 'M' },
        { full_name: 'Pieter Janssen', call_count: 5, avatar: 'P' },
      ])
      setLoading(false)
      return
    }

    try {
      // Get call counts per user from activities
      const { data: activities } = await supabase
        .from('activities')
        .select('user_id, profiles(full_name)')
        .eq('action', 'call')

      // Also check for type: 'call' in case that's what's being used
      const { data: typeCalls } = await supabase
        .from('activities')
        .select('user_id, profiles(full_name)')
        .eq('type', 'call')

      const allActivities = [...(activities || []), ...(typeCalls || [])]

      // Count calls per user
      const counts = {}
      allActivities.forEach(a => {
        const userId = a.user_id
        counts[userId] = (counts[userId] || 0) + 1
      })

      // Get unique users with counts
      const userStats = Object.entries(counts).map(([userId, call_count]) => {
        const activity = allActivities.find(a => a.user_id === userId)
        return {
          user_id: userId,
          full_name: activity?.profiles?.full_name || 'Onbekend',
          call_count,
          avatar: (activity?.profiles?.full_name || 'U').charAt(0)
        }
      }).sort((a, b) => b.call_count - a.call_count)

      setTeamStats(userStats)
    } catch (err) {
      console.error('Error fetching team stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  return (
    <div className="team-leaderboard">
      <div className="leaderboard-header">
        <Trophy size={18} style={{ color: 'var(--secondary)' }} />
        <span>Team Calls Vandaag</span>
      </div>
      <div className="leaderboard-list">
        {teamStats.map((member, i) => (
          <div
            key={member.user_id || i}
            className={`leaderboard-item ${member.user_id === user?.id ? 'current-user' : ''}`}
          >
            <div className="leaderboard-rank">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
            </div>
            <div className="leaderboard-avatar">
              {member.avatar}
            </div>
            <div className="leaderboard-name">
              {member.full_name}
              {member.user_id === user?.id && <span className="you-badge">Jij</span>}
            </div>
            <div className="leaderboard-count">
              <Zap size={14} style={{ color: 'var(--secondary)' }} />
              <span>{member.call_count}</span>
            </div>
          </div>
        ))}
        {teamStats.length === 0 && (
          <div className="leaderboard-empty">Nog geen belletjes deze sessie</div>
        )}
      </div>

      <style>{`
        .team-leaderboard {
          background: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          padding: 16px;
          margin-top: 24px;
        }
        .leaderboard-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          color: var(--primary);
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .leaderboard-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .leaderboard-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          background: var(--bg-light);
          transition: all 0.2s;
        }
        .leaderboard-item.current-user {
          background: rgba(212, 175, 55, 0.1);
          border: 1px solid var(--secondary);
        }
        .leaderboard-rank {
          font-size: 0.85rem;
          width: 28px;
          text-align: center;
        }
        .leaderboard-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
        }
        .leaderboard-name {
          flex: 1;
          font-weight: 600;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .you-badge {
          font-size: 0.7rem;
          background: var(--secondary);
          color: var(--primary-dark);
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 700;
        }
        .leaderboard-count {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 700;
          color: var(--primary);
        }
        .leaderboard-empty {
          text-align: center;
          color: var(--text-muted);
          font-size: 0.85rem;
          padding: 16px;
        }
      `}</style>
    </div>
  )
}