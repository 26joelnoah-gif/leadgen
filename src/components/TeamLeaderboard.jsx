import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Trophy, Zap } from 'lucide-react'
import { levelInfo } from '../utils/xpUtils'

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
      setTeamStats([
        { user_id: 'demo1', full_name: 'Jan de Vries', avatar: 'J', ...levelInfo(320) },
        { user_id: 'demo2', full_name: 'Maria Admin', avatar: 'M', ...levelInfo(180) },
        { user_id: 'demo3', full_name: 'Pieter Janssen', avatar: 'P', ...levelInfo(60) },
      ])
      setLoading(false)
      return
    }

    try {
      // v26: ranglijst op ervaringspunten (XP) uit de database
      const { data, error } = await supabase.rpc('xp_leaderboard')
      if (error) throw error
      const userStats = (data || []).map(r => ({
        user_id: r.agent_id,
        full_name: r.full_name || 'Onbekend',
        avatar: (r.full_name || 'U').charAt(0),
        ...levelInfo(Number(r.xp || 0))
      }))

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
        <span>Ervaring & Levels</span>
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
              <div>
                {member.full_name}
                {member.user_id === user?.id && <span className="you-badge">Jij</span>}
                <div className="leaderboard-title">{member.title}</div>
              </div>
            </div>
            <div className="leaderboard-count" title={`${member.xp} XP`}>
              <Zap size={14} style={{ color: 'var(--secondary)' }} />
              <span>Lv {member.level} · {member.xp} XP</span>
            </div>
          </div>
        ))}
        {teamStats.length === 0 && (
          <div className="leaderboard-empty">Nog geen ervaringspunten - de eerste gesprekken tellen direct mee</div>
        )}
      </div>

      <style>{`
        .team-leaderboard {
          background: var(--bg-card);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          padding: 16px;
          margin-top: 24px;
          border: 1px solid var(--border);
        }
        .leaderboard-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          color: var(--text-main);
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
          background: var(--bg-elevated);
          transition: all 0.2s;
        }
        .leaderboard-item.current-user {
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid var(--primary);
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
          color: var(--text-on-accent);
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
        .leaderboard-title {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .you-badge {
          font-size: 0.7rem;
          background: var(--secondary);
          color: var(--bg-dark);
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