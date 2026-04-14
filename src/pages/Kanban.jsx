import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, CheckCircle, Clock, AlertTriangle, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'

const KANBAN_FILE = '/Users/noah/LEADGEN/.claude/shared/kanban.json'

// Simple local state for now - kanban.json sync
export default function Kanban() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState([
    { id: 1, title: 'SQL runnen in Supabase', desc: 'Voeg locking + lead_list_id kolommen toe', status: 'todo', priority: 'high', agent: null },
    { id: 2, title: 'Test lead lijsten', desc: 'Admin maakt lijst, voegt leads toe, wijst agent toe', status: 'todo', priority: 'high', agent: null },
    { id: 3, title: 'Test claim lead', desc: 'Agent klikt bellen, lead wordt gelocked', status: 'todo', priority: 'high', agent: null },
    { id: 4, title: 'Test concurrent calling', desc: 'Twee agents zelfde lijst, geen dubbele calls', status: 'todo', priority: 'medium', agent: null },
  ])
  const [newTask, setNewTask] = useState({ title: '', desc: '', priority: 'medium' })
  const [showAdd, setShowAdd] = useState(false)

  const statuses = ['todo', 'doing', 'done']
  const statusLabels = { todo: 'Te Doen', doing: 'Bezig', done: 'Klaar' }
  const statusColors = { todo: 'var(--warning)', doing: 'var(--primary)', done: 'var(--success)' }
  const priorityColors = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--text-muted)' }

  function moveTask(id, newStatus) {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t))
  }

  function addTask() {
    if (!newTask.title) return
    setTasks([...tasks, { ...newTask, id: Date.now(), status: 'todo', agent: null }])
    setNewTask({ title: '', desc: '', priority: 'medium' })
    setShowAdd(false)
  }

  function deleteTask(id) {
    setTasks(tasks.filter(t => t.id !== id))
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <Header />
      <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Agent Kanban</h1>
        {profile?.role === 'admin' && (
          <button onClick={() => setShowAdd(true)} className="btn btn-primary" style={{ background: 'var(--primary)' }}>
            <Plus size={16} /> Taak
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {statuses.map(status => (
          <div key={status} style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px', minHeight: '400px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '8px', borderBottom: `2px solid ${statusColors[status]}` }}>
              <span style={{ color: statusColors[status], fontWeight: 600 }}>{statusLabels[status]}</span>
              <span style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>
                {tasks.filter(t => t.status === status).length}
              </span>
            </div>

            {tasks.filter(t => t.status === status).map(task => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '12px', marginBottom: '8px', border: '1px solid var(--border)' }}
              >
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{task.title}</div>
                {task.desc && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{task.desc}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: priorityColors[task.priority], fontWeight: 600, textTransform: 'uppercase' }}>{task.priority}</span>
                  {task.agent && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}><User size={12} /> {task.agent}</span>}
                </div>
                {profile?.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                    {statuses.filter(s => s !== status).map(s => (
                      <button key={s} onClick={() => moveTask(task.id, s)} style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'var(--bg-dark)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: statusColors[s] }}>
                        {statusLabels[s]}
                      </button>
                    ))}
                    <button onClick={() => deleteTask(task.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><X size={14} /></button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '24px', width: '400px' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: '16px' }}>Nieuwe Taak</h3>
              <input value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="Titel" style={{ width: '100%', padding: '10px', marginBottom: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'white' }} />
              <textarea value={newTask.desc} onChange={e => setNewTask({...newTask, desc: e.target.value})} placeholder="Beschrijving" style={{ width: '100%', padding: '10px', marginBottom: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'white' }} />
              <select value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})} style={{ width: '100%', padding: '10px', marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'white' }}>
                <option value="high">Hoog</option>
                <option value="medium">Medium</option>
                <option value="low">Laag</option>
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowAdd(false)} className="btn btn-outline" style={{ flex: 1 }}>Annuleren</button>
                <button onClick={addTask} className="btn btn-primary" style={{ flex: 1, background: 'var(--primary)' }}>Toevoegen</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}
