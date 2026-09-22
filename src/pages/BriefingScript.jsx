import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Info, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'

// v95: los tabblad met het belscript + projectinfo van 1 project, om vanuit
// het belscherm in een NIEUW browsertabblad te openen (naast bellen open
// laten staan). In tegenstelling tot CampaignBriefingModal (admin/manager-
// only) mag een beller die aan dit project werkt hier ZELF in schrijven -
// zie de verruimde RLS-policy campaign_briefings_write (migration_v95).
export default function BriefingScript() {
  const { campaignId } = useParams()
  const { user } = useAuth()
  const toast = useToast()

  const [campaignName, setCampaignName] = useState('')
  const [callScript, setCallScript] = useState('')
  const [projectInfo, setProjectInfo] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('campaigns').select('id, name').eq('id', campaignId).maybeSingle(),
      supabase.from('campaign_briefings').select('call_script, project_info').eq('campaign_id', campaignId).maybeSingle()
    ]).then(([{ data: campaign }, { data: briefing }]) => {
      if (cancelled) return
      if (!campaign) { setNotFound(true); setLoading(false); return }
      setCampaignName(campaign.name || '')
      setCallScript(briefing?.call_script || '')
      setProjectInfo(briefing?.project_info || '')
      setDirty(false)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [campaignId])

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('campaign_briefings')
        .upsert({
          campaign_id: campaignId,
          call_script: callScript,
          project_info: projectInfo,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'campaign_id' })
      if (error) throw error
      toast('Script opgeslagen - collega\'s zien dit direct', 'success')
      setDirty(false)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const areaStyle = {
    width: '100%', padding: '14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
    color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.55, resize: 'vertical',
    fontFamily: 'inherit'
  }

  return (
    <>
      <Header />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: '820px', margin: '0 auto', padding: '24px 20px 60px' }}>
        {loading ? (
          <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>
        ) : notFound ? (
          <p className="text-muted">Project niet gevonden (of je hebt er geen toegang toe).</p>
        ) : (
          <>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <BookOpen size={20} /> Belscript - {campaignName}
            </h1>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '20px' }}>
              Dit script staat los van het belscherm, zodat je het naast elkaar open kan
              houden. Iedereen die aan dit project werkt mag het hier aanpassen -
              wijzigingen zijn meteen zichtbaar voor je collega's.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BookOpen size={14} /> Belscript
                </label>
                <textarea
                  value={callScript}
                  onChange={e => { setCallScript(e.target.value); setDirty(true) }}
                  placeholder={'Bijv.\nOpening: "Goedemiddag, u spreekt met ... van ..."\nPitch: ...\nBezwaar "geen tijd": ...'}
                  rows={16}
                  style={areaStyle}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={14} /> Projectinfo
                </label>
                <textarea
                  value={projectInfo}
                  onChange={e => { setProjectInfo(e.target.value); setDirty(true) }}
                  placeholder={'Bijv. over de opdrachtgever, de doelgroep, wat een goede afspraak is en praktische afspraken.'}
                  rows={8}
                  style={areaStyle}
                />
              </div>
            </div>

            <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg-dark)', paddingTop: '16px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !dirty}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Save size={16} /> {saving ? 'Opslaan...' : dirty ? 'Opslaan' : 'Opgeslagen'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </>
  )
}
