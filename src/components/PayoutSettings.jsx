import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { DollarSign, Target, Trophy, Plus, Trash2, Save, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

// Product owner instellingen: vergoedingen, beltargets en prijzen.
// Eén payout_rules regel per organisatie (organization_id NULL = huidige gedeelde omgeving).
export default function PayoutSettings() {
  const { profile } = useAuth()
  const toast = useToast()

  const [rules, setRules] = useState(null)
  const [form, setForm] = useState({
    rate_per_appointment: 25,
    rate_per_deal: 50,
    min_calls_per_day: 0,
    min_calls_for_payout: 0,
    min_avg_call_seconds: 0
  })
  const [saving, setSaving] = useState(false)

  const [prizes, setPrizes] = useState([])
  const [newPrize, setNewPrize] = useState({ name: '', metric: 'calls', target_value: 50, reward_label: '', period: 'week' })
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    try {
      const { data: ruleRows, error: rErr } = await supabase.from('payout_rules').select('*').limit(1)
      if (rErr) throw rErr
      if (ruleRows?.[0]) {
        setRules(ruleRows[0])
        setForm({
          rate_per_appointment: ruleRows[0].rate_per_appointment,
          rate_per_deal: ruleRows[0].rate_per_deal,
          min_calls_per_day: ruleRows[0].min_calls_per_day,
          min_calls_for_payout: ruleRows[0].min_calls_for_payout,
          min_avg_call_seconds: ruleRows[0].min_avg_call_seconds
        })
      }
      const { data: prizeRows, error: pErr } = await supabase.from('prizes').select('*').order('created_at', { ascending: false })
      if (pErr) throw pErr
      setPrizes(prizeRows || [])
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function saveRules() {
    setSaving(true)
    try {
      const payload = {
        rate_per_appointment: parseFloat(form.rate_per_appointment) || 0,
        rate_per_deal: parseFloat(form.rate_per_deal) || 0,
        min_calls_per_day: parseInt(form.min_calls_per_day) || 0,
        min_calls_for_payout: parseInt(form.min_calls_for_payout) || 0,
        min_avg_call_seconds: parseInt(form.min_avg_call_seconds) || 0,
        updated_by: profile?.id,
        updated_at: new Date().toISOString()
      }
      if (rules?.id) {
        const { error } = await supabase.from('payout_rules').update(payload).eq('id', rules.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('payout_rules')
          .insert({ ...payload, organization_id: profile?.organization_id ?? null })
          .select().single()
        if (error) throw error
        setRules(data)
      }
      toast('Vergoedingen & targets opgeslagen', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function addPrize() {
    if (!newPrize.name.trim()) {
      toast('Geef de prijs een naam', 'error')
      return
    }
    try {
      const { data, error } = await supabase.from('prizes').insert({
        organization_id: profile?.organization_id ?? null,
        name: newPrize.name.trim(),
        metric: newPrize.metric,
        target_value: parseInt(newPrize.target_value) || 0,
        reward_label: newPrize.reward_label.trim() || null,
        period: newPrize.period,
        active: true,
        created_by: profile?.id
      }).select().single()
      if (error) throw error
      setPrizes(prev => [data, ...prev])
      setNewPrize({ name: '', metric: 'calls', target_value: 50, reward_label: '', period: 'week' })
      toast('Prijs toegevoegd 🏆', 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function togglePrize(prize) {
    try {
      const { error } = await supabase.from('prizes').update({ active: !prize.active }).eq('id', prize.id)
      if (error) throw error
      setPrizes(prev => prev.map(p => p.id === prize.id ? { ...p, active: !p.active } : p))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function deletePrize(id) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      toast('Klik nogmaals om te verwijderen', 'error')
      return
    }
    setConfirmDeleteId(null)
    try {
      const { error } = await supabase.from('prizes').delete().eq('id', id)
      if (error) throw error
      setPrizes(prev => prev.filter(p => p.id !== id))
      toast('Prijs verwijderd', 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const METRIC_LABELS = { calls: 'Calls', appointments: 'Netto afspraken', deals: 'Deals' }
  const PERIOD_LABELS = { day: 'Per dag', week: 'Per week', month: 'Per maand' }

  const inputStyle = 'form-dark w-full'
  const labelStyle = 'text-[10px] font-black uppercase text-muted tracking-widest mb-2 block'

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-8">
        <h2 className="text-3xl font-black italic tracking-tight">VERDIENSTEN & TARGETS</h2>
        <p className="text-muted font-bold">Stel vergoedingen, beltargets en prijzen in voor je team.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* VERGOEDINGEN & TARGETS */}
        <div className="glass-panel p-8 border-l-2 border-secondary">
          <h3 className="text-secondary font-black text-sm uppercase tracking-widest mb-6 flex items-center gap-2">
            <DollarSign size={16} /> Vergoedingen
          </h3>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className={labelStyle}>€ per netto afspraak</label>
              <input type="number" min="0" step="0.5" className={inputStyle}
                value={form.rate_per_appointment}
                onChange={e => setForm({ ...form, rate_per_appointment: e.target.value })} />
              <p className="text-[10px] text-muted mt-1">Alleen goedgekeurde (netto) afspraken tellen</p>
            </div>
            <div>
              <label className={labelStyle}>€ per deal</label>
              <input type="number" min="0" step="0.5" className={inputStyle}
                value={form.rate_per_deal}
                onChange={e => setForm({ ...form, rate_per_deal: e.target.value })} />
            </div>
          </div>

          <h3 className="text-primary font-black text-sm uppercase tracking-widest mb-6 mt-8 flex items-center gap-2">
            <Target size={16} /> Targets (uitbetalingsvoorwaarden)
          </h3>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelStyle}>Min. calls per dag</label>
              <input type="number" min="0" className={inputStyle}
                value={form.min_calls_per_day}
                onChange={e => setForm({ ...form, min_calls_per_day: e.target.value })} />
              <p className="text-[10px] text-muted mt-1">Zichtbaar als doel in de belmodus (0 = uit)</p>
            </div>
            <div>
              <label className={labelStyle}>Min. calls per maand voor uitbetaling</label>
              <input type="number" min="0" className={inputStyle}
                value={form.min_calls_for_payout}
                onChange={e => setForm({ ...form, min_calls_for_payout: e.target.value })} />
              <p className="text-[10px] text-muted mt-1">Onder dit aantal: waarschuwing bij payout (0 = uit)</p>
            </div>
            <div>
              <label className={labelStyle}>Min. gem. gesprekstijd (sec)</label>
              <input type="number" min="0" className={inputStyle}
                value={form.min_avg_call_seconds}
                onChange={e => setForm({ ...form, min_avg_call_seconds: e.target.value })} />
              <p className="text-[10px] text-muted mt-1">Anti-doorklik bescherming (0 = uit)</p>
            </div>
          </div>

          <button onClick={saveRules} disabled={saving} className="btn btn-primary btn-block mt-8 py-4 font-black tracking-widest">
            <Save size={18} /> {saving ? 'OPSLAAN...' : 'OPSLAAN'}
          </button>
        </div>

        {/* PRIJZEN */}
        <div className="glass-panel p-8 border-l-2 border-primary">
          <h3 className="text-primary font-black text-sm uppercase tracking-widest mb-6 flex items-center gap-2">
            <Trophy size={16} /> Prijzen & Bonussen
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className={labelStyle}>Naam</label>
              <input className={inputStyle} placeholder="Bijv. Weektopper Bellen"
                value={newPrize.name} onChange={e => setNewPrize({ ...newPrize, name: e.target.value })} />
            </div>
            <div>
              <label className={labelStyle}>Metric</label>
              <select className={inputStyle} value={newPrize.metric} onChange={e => setNewPrize({ ...newPrize, metric: e.target.value })}>
                <option value="calls">Calls</option>
                <option value="appointments">Netto afspraken</option>
                <option value="deals">Deals</option>
              </select>
            </div>
            <div>
              <label className={labelStyle}>Doel</label>
              <input type="number" min="1" className={inputStyle}
                value={newPrize.target_value} onChange={e => setNewPrize({ ...newPrize, target_value: e.target.value })} />
            </div>
            <div>
              <label className={labelStyle}>Periode</label>
              <select className={inputStyle} value={newPrize.period} onChange={e => setNewPrize({ ...newPrize, period: e.target.value })}>
                <option value="day">Per dag</option>
                <option value="week">Per week</option>
                <option value="month">Per maand</option>
              </select>
            </div>
            <div>
              <label className={labelStyle}>Beloning</label>
              <input className={inputStyle} placeholder="Bijv. €50 bonus"
                value={newPrize.reward_label} onChange={e => setNewPrize({ ...newPrize, reward_label: e.target.value })} />
            </div>
          </div>

          <button onClick={addPrize} className="btn btn-secondary btn-block py-3 font-black text-dark">
            <Plus size={16} /> PRIJS TOEVOEGEN
          </button>

          <div className="mt-6 flex flex-column gap-3" style={{ display: 'flex', flexDirection: 'column' }}>
            {prizes.length === 0 && (
              <p className="text-xs text-muted opacity-50 italic flex items-center gap-2"><Info size={12} /> Nog geen prijzen ingesteld.</p>
            )}
            {prizes.map(p => (
              <div key={p.id} className="flex justify-between items-center p-3 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)', opacity: p.active ? 1 : 0.45 }}>
                <div>
                  <div className="font-bold text-white text-sm">🏆 {p.name} {p.reward_label && <span className="text-secondary">— {p.reward_label}</span>}</div>
                  <div className="text-[10px] text-muted uppercase font-black">{p.target_value} {METRIC_LABELS[p.metric] || p.metric} · {PERIOD_LABELS[p.period] || p.period}</div>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => togglePrize(p)} className="btn btn-sm btn-outline" style={{ fontSize: '0.7rem' }}>
                    {p.active ? 'Actief' : 'Uit'}
                  </button>
                  <button onClick={() => deletePrize(p.id)} className="p-2 hover:bg-error/20 text-error rounded-lg"
                    style={confirmDeleteId === p.id ? { background: 'var(--error, #EF4444)', color: 'white' } : undefined}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
