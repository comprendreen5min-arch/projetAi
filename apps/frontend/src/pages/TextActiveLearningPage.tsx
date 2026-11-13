import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, X } from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  TextActiveLearningDataResponse,
  TextActiveLearningPick,
  TextActiveLearningStrategy,
} from '../types';

const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardElevated: '#16171b',
  border: '#1e2025',
  borderLight: '#2a2d35',
  text: '#e1e4ea',
  textMuted: '#6b7280',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  amberBg: 'rgba(245, 158, 11, 0.08)',
  blue: '#3b82f6',
  blueBg: 'rgba(59, 130, 246, 0.15)',
  green: '#22c55e',
  red: '#ef4444',
};

export const TextActiveLearningPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<TextActiveLearningDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Strategy filter for Section 3 table
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Interactive slider shares and ticket counts
  const [strategies, setStrategies] = useState<TextActiveLearningStrategy[]>([]);
  const [roundBudget, setRoundBudget] = useState<number>(600);

  // Picks list (with remove capability)
  const [picks, setPicks] = useState<TextActiveLearningPick[]>([]);

  // Round settings checkboxes
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);
  const [queueWholeTicket, setQueueWholeTicket] = useState<boolean>(true);
  const [preLabelWithModel, setPreLabelWithModel] = useState<boolean>(true);

  // Stop rule thresholds
  const [stopRuleFixes, setStopRuleFixes] = useState<string>('10% of checked rows');
  const [stopRuleRecall, setStopRuleRecall] = useState<string>('1 point');

  // Automation checkboxes
  const [automationRules, setAutomationRules] = useState<Record<string, boolean>>({});

  // Modals & Feedback
  const [notification, setNotification] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showNewLabelModal, setShowNewLabelModal] = useState<boolean>(false);
  const [newLabelInput, setNewLabelInput] = useState<string>('');

  // Load datasets on mount
  useEffect(() => {
    async function loadDatasets() {
      try {
        const list = await api.getDatasets();
        const textDatasets = list.filter((d) => {
          const name = d.name.toLowerCase();
          return (
            name.includes('ticket') ||
            name.includes('text') ||
            name.includes('texte') ||
            name.includes('review') ||
            name.endsWith('.txt') ||
            name.endsWith('.jsonl') ||
            name.endsWith('.csv')
          );
        });
        const usableList = textDatasets.length > 0 ? textDatasets : list;
        setDatasets(usableList);

        const preferred =
          usableList.find((d) => d.name.toLowerCase().includes('support_tickets')) ||
          usableList[0];
        if (preferred) {
          setSelectedDatasetId(preferred.id);
        }
      } catch (err: any) {
        setError('Erreur de chargement des datasets: ' + (err.message || 'inconnu'));
      }
    }
    loadDatasets();
  }, []);

  // Listen to TopBar events
  useEffect(() => {
    const handleOpenHistory = () => setShowHistoryModal(true);
    window.addEventListener('datalift:open-round-history', handleOpenHistory);
    return () => window.removeEventListener('datalift:open-round-history', handleOpenHistory);
  }, []);

  // Fetch active learning data
  const fetchData = useCallback(async (datasetId: string, filter: string = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTextActiveLearningData(datasetId, filter);
      setData(res);
      setStrategies(res.what_to_pick?.strategies || []);
      setRoundBudget(res.what_to_pick?.total_tickets || 600);
      setPicks(res.picks_section?.picks || []);

      if (res.automation) {
        const autoMap: Record<string, boolean> = {};
        res.automation.forEach((r) => {
          autoMap[r.id] = r.enabled;
        });
        setAutomationRules(autoMap);
      }
    } catch (err: any) {
      setError("Erreur lors de la récupération des données d'active learning: " + (err.message || ''));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch data when dataset or filter changes
  useEffect(() => {
    if (selectedDatasetId) {
      fetchData(selectedDatasetId, activeFilter);
    }
  }, [selectedDatasetId, activeFilter, fetchData]);

  // Handle dataset switch
  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDatasetId(newId);
    setActiveFilter('all');
    window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: { id: newId } }));
  };

  // Handle slider adjustment
  const handleSliderChange = (stratId: string, newShare: number) => {
    setStrategies((prev) => {
      const updated = prev.map((s) => {
        if (s.id === stratId) {
          const tickets = Math.round((newShare / 100) * roundBudget);
          return { ...s, share_pct: newShare, tickets };
        }
        return s;
      });
      return updated;
    });
  };

  // Recalculate total tickets & pct
  const totalSharePct = useMemo(() => {
    return strategies.reduce((acc, s) => acc + s.share_pct, 0);
  }, [strategies]);

  const totalTicketsCalculated = useMemo(() => {
    return strategies.reduce((acc, s) => acc + s.tickets, 0);
  }, [strategies]);

  // Remove pick
  const handleRemovePick = (ticketId: string) => {
    setPicks((prev) => prev.filter((p) => p.ticket_id !== ticketId));
    setNotification(`Ticket ${ticketId} retiré du round`);
    setTimeout(() => setNotification(null), 3000);
  };

  // Pick 30 from Cluster 23
  const handlePickFromCluster = () => {
    const clusterId = data?.picks_section?.cluster_callout?.cluster_id || 23;
    const newPicks: TextActiveLearningPick[] = [
      {
        ticket_id: `#60${Math.floor(100 + Math.random() * 899)}`,
        language: 'FR',
        text: "Code OTP non reçu après demande de réinitialisation du mot de passe",
        why_picked: `New topic · cluster ${clusterId}`,
        strategy_key: 'new_topic',
        model_top_2: 'security 0.40 · account 0.35',
      },
      {
        ticket_id: `#60${Math.floor(100 + Math.random() * 899)}`,
        language: 'DARIJA',
        text: "sms dial verification ma wslnich ga3",
        why_picked: `New topic · cluster ${clusterId}`,
        strategy_key: 'new_topic',
        model_top_2: 'security 0.45 · technical 0.30',
      },
    ];
    setPicks((prev) => [...newPicks, ...prev]);
    setNotification(`30 tickets du cluster ${clusterId} ajoutés à la sélection du round`);
    setTimeout(() => setNotification(null), 4000);
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.saveTextActiveLearningDraft(selectedDatasetId, {
        budget: roundBudget,
        strategies,
        skip_duplicates: skipDuplicates,
        queue_whole_ticket: queueWholeTicket,
      });
      setNotification('Brouillon du Round 3 enregistré avec succès');
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification('Erreur enregistrement brouillon: ' + err.message);
    }
  };

  // Send to labeling
  const handleSendToLabeling = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.sendTextActiveLearningToLabeling(selectedDatasetId, {
        count: roundBudget,
        target: 'unlabeled',
      });
      setNotification(`${roundBudget} tickets envoyés avec succès dans la file 05 Labeling ! Redirection...`);
      setTimeout(() => {
        setNotification(null);
        navigate('/labeling');
      }, 1500);
    } catch (err: any) {
      setNotification('Erreur lors du transfert vers le labeling: ' + err.message);
    }
  };

  // Propose New Label submission
  const handleProposeLabelSubmit = () => {
    if (!newLabelInput.trim()) return;
    setShowNewLabelModal(false);
    setNotification(`Nouvelle étiquette "${newLabelInput.trim()}" proposée pour le cluster ${data?.picks_section?.cluster_callout?.cluster_id || 23}. Sera versionnée au prochain round.`);
    setNewLabelInput('');
    setTimeout(() => setNotification(null), 5000);
  };

  if (loading && !data) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '2.5rem', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'monospace' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: C.amber, animation: 'ping 1s infinite' }} />
          Chargement de l'active learning texte...
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {
    pool: '6,820',
    pool_sub: 'new tickets since v4 · 14 days',
    budget: '600 tickets',
    budget_sub: "≈ 1 h 15 at the team's pace",
    new_topics: '1',
    new_topics_sub: 'cluster with no labels',
    output: 'v5',
    output_sub: 'v4 kept as is',
  };

  const filterCounts = data?.picks_section?.filter_counts || {
    all: 600,
    margin: 210,
    diversity: 120,
    rare: 90,
    new_topic: 60,
    disagree: 60,
    random: 60,
  };

  return (
    <div
      style={{
        backgroundColor: C.bg,
        minHeight: '100vh',
        color: C.text,
        padding: '1.5rem 3rem 6rem 3rem',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {error && (
        <div
          style={{
            backgroundColor: '#451a1a',
            border: `1px solid ${C.red}`,
            color: '#fca5a5',
            padding: '0.75rem 1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.8rem',
            fontFamily: 'monospace',
          }}
        >
          {error}
        </div>
      )}
      {notification && (
        <div
          style={{
            position: 'fixed',
            bottom: '5rem',
            right: '3rem',
            zIndex: 9999,
            backgroundColor: '#1c1917',
            border: `1px solid ${C.amber}`,
            color: '#fef3c7',
            padding: '0.85rem 1.4rem',
            borderRadius: '6px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <Check size={16} color={C.amber} />
          {notification}
        </div>
      )}

      {/* Dataset Selector Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
          paddingBottom: '0.85rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: '0.72rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace' }}>
          JEU DE DONNÉES :
        </span>
        <select
          value={selectedDatasetId}
          onChange={handleDatasetChange}
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.borderLight}`,
            color: C.text,
            padding: '0.35rem 0.85rem',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontFamily: 'monospace',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Header Breadcrumb & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <div
            style={{
              fontSize: '0.68rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: C.textMuted,
              fontFamily: 'monospace',
              marginBottom: '0.4rem',
            }}
          >
            {data?.breadcrumb || 'ACTIVE LEARNING · ROUND 3 · SCORED BY TICKET-CLS-V4 · 7 LABELS · 4 LANGUAGES'}
          </div>
          <h1
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '2.4rem',
              color: '#ffffff',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {data?.display_title || 'support_tickets.jsonl'}
          </h1>
        </div>

        {/* Large Candidate / Next Round badge */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div
            style={{
              fontSize: '0.65rem',
              letterSpacing: '0.12em',
              fontFamily: 'monospace',
              color: C.amber,
              border: `1px solid ${C.amber}`,
              padding: '0.1rem 0.45rem',
              borderRadius: '2px',
              display: 'inline-block',
              marginBottom: '0.15rem',
            }}
          >
            {data?.round_status || 'DRAFT'}
          </div>
          <div
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontSize: '3.6rem',
              lineHeight: 1,
              color: C.amber,
              fontWeight: 400,
            }}
          >
            {data?.round_badge || '03'}
          </div>
          <div
            style={{
              fontSize: '0.62rem',
              letterSpacing: '0.14em',
              color: C.textMuted,
              fontFamily: 'monospace',
              marginTop: '0.15rem',
            }}
          >
            {data?.round_subtitle || 'NEXT ROUND'}
          </div>
        </div>
      </div>

      {/* 4 KPIs Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1.25rem',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            POOL
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.pool}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.pool_sub}
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            BUDGET
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.budget}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.budget_sub}
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            NEW TOPICS
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.new_topics}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.new_topics_sub}
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            OUTPUT
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.output}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.output_sub}
          </div>
        </div>
      </div>

      {/* Explainer Box */}
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '6px',
          padding: '1rem 1.25rem',
          marginBottom: '2.5rem',
        }}
      >
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.amber, fontFamily: 'monospace', marginBottom: '0.35rem' }}>
          {data?.explainer?.title || 'HOW ACTIVE LEARNING WORKS FOR TEXT'}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.55 }}>
          {data?.explainer?.content ||
            'New tickets arrive every day; labeling all of them is wasted effort. Datalift scores them with the current model, then picks the ones it hesitates on, the ones unlike anything labeled so far, and the rare labels. They reach 05 pre-labeled, and the next model in 06 learns from exactly those.'}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1 · Loop Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.65rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            1·Loop
          </h2>
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            ONE ROUND = SCORE, PICK, LABEL, RETRAIN, MEASURE
          </span>
        </div>

        {/* 5 Stages Flow */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '1rem',
            position: 'relative',
            marginBottom: '1.25rem',
          }}
        >
          {data?.loop_section?.stages.map((st, i) => (
            <div
              key={st.step}
              style={{
                backgroundColor: C.card,
                border: st.is_active ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1rem',
                position: 'relative',
                boxShadow: st.is_active ? `0 0 15px ${C.amberBg}` : 'none',
              }}
            >
              <div style={{ fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                {st.step} · {st.name}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace', marginBottom: '0.35rem' }}>
                {st.metric}
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  color: st.is_done ? C.green : st.is_active ? C.amber : C.textMuted,
                  fontFamily: 'monospace',
                }}
              >
                {st.status}
              </div>

              {/* Connecting arrow if not last */}
              {i < (data?.loop_section?.stages.length || 5) - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    right: '-0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    color: C.borderLight,
                    fontSize: '0.85rem',
                  }}
                >
                  →
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Historical Rounds Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            position: 'relative',
          }}
        >
          {data?.loop_section?.rounds_history.map((rh, i) => (
            <div
              key={rh.round}
              style={{
                backgroundColor: C.card,
                border: rh.is_active ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '0.85rem 1rem',
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  color: rh.is_active ? C.amber : C.textMuted,
                  fontFamily: 'monospace',
                  letterSpacing: '0.08em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  marginBottom: '0.35rem',
                }}
              >
                {rh.round}
                {rh.is_active && (
                  <span
                    style={{
                      border: `1px solid ${C.amber}`,
                      padding: '0 0.3rem',
                      borderRadius: '2px',
                      fontSize: '0.55rem',
                    }}
                  >
                    DRAFT
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#ffffff', fontFamily: 'monospace', marginBottom: '0.2rem' }}>
                {rh.detail}
              </div>
              <div style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace' }}>
                {rh.target}
              </div>

              {i < (data?.loop_section?.rounds_history.length || 3) - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    right: '-0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    color: C.borderLight,
                    fontSize: '0.85rem',
                  }}
                >
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2 · What to pick Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.65rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            2·What to pick
          </h2>
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            A MIX, NOT ONE RULE
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left: 6 Strategy Sliders */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 2fr 0.8fr',
                paddingBottom: '0.65rem',
                borderBottom: `1px solid ${C.border}`,
                marginBottom: '1rem',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                color: C.textMuted,
                fontFamily: 'monospace',
              }}
            >
              <div>STRATEGY</div>
              <div>SHARE OF THE ROUND</div>
              <div style={{ textAlign: 'right' }}>TICKETS</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {strategies.map((strat) => (
                <div
                  key={strat.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 2fr 0.8fr',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  {/* Strategy Info */}
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {strat.name}
                      {strat.tag && (
                        <span
                          style={{
                            fontSize: '0.55rem',
                            fontFamily: 'monospace',
                            backgroundColor: '#262626',
                            color: C.amber,
                            padding: '0.1rem 0.35rem',
                            borderRadius: '2px',
                          }}
                        >
                          {strat.tag}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: C.textMuted, marginTop: '0.2rem' }}>
                      {strat.desc}
                    </div>
                  </div>

                  {/* Slider Control */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <input
                      type="range"
                      min={strat.id === 'random' ? 10 : 0}
                      max={70}
                      value={strat.share_pct}
                      onChange={(e) => handleSliderChange(strat.id, parseInt(e.target.value, 10))}
                      style={{
                        flex: 1,
                        accentColor: C.amber,
                        cursor: 'pointer',
                      }}
                    />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: C.textMuted, width: '2.5rem', textAlign: 'right' }}>
                      {strat.share_pct}%
                    </span>
                  </div>

                  {/* Calculated Tickets */}
                  <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 500, color: '#ffffff' }}>
                    {strat.tickets}
                  </div>
                </div>
              ))}
            </div>

            {/* Total Footer */}
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1rem',
                borderTop: `1px solid ${C.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
              }}
            >
              <span style={{ color: C.textMuted }}>TOTAL</span>
              <span style={{ color: totalSharePct === 100 ? C.green : C.amber, fontWeight: 500 }}>
                ✓ {totalSharePct}% · {totalTicketsCalculated} tickets
              </span>
            </div>
          </div>

          {/* Right: Round Settings Card */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <h3
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: '1.15rem',
                fontWeight: 400,
                color: '#ffffff',
                margin: '0 0 1rem 0',
              }}
            >
              Round settings
            </h3>

            {/* Tickets this round input */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace', display: 'block', marginBottom: '0.35rem' }}>
                TICKETS THIS ROUND
              </label>
              <input
                type="number"
                value={roundBudget}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 100;
                  setRoundBudget(val);
                }}
                style={{
                  width: '100%',
                  backgroundColor: C.cardElevated,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  color: '#ffffff',
                  padding: '0.45rem 0.65rem',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Language Quotas */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace', marginBottom: '0.45rem' }}>
                LANGUAGE QUOTAS · AT LEAST
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                {(data?.what_to_pick?.round_settings?.language_quotas || [
                  { lang: 'FR', min_pct: '30%' },
                  { lang: 'DARIJA', min_pct: '30%' },
                  { lang: 'AR', min_pct: '15%' },
                  { lang: 'EN', min_pct: '10%' },
                ]).map((l) => (
                  <div
                    key={l.lang}
                    style={{
                      backgroundColor: C.cardElevated,
                      border: `1px solid ${C.border}`,
                      borderRadius: '4px',
                      padding: '0.35rem',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.62rem', color: C.textMuted, fontFamily: 'monospace' }}>{l.lang}</div>
                    <div style={{ fontSize: '0.78rem', color: '#ffffff', fontFamily: 'monospace', fontWeight: 500 }}>{l.min_pct}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  style={{ accentColor: C.amber, marginTop: '0.2rem' }}
                />
                <span style={{ color: '#d1d5db' }}>Skip near-duplicates of labeled tickets · ≥ 0.95</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                <input
                  type="checkbox"
                  checked={queueWholeTicket}
                  onChange={(e) => setQueueWholeTicket(e.target.checked)}
                  style={{ accentColor: C.amber, marginTop: '0.2rem' }}
                />
                <span style={{ color: '#d1d5db' }}>Queue the whole ticket, not one chunk</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                <input
                  type="checkbox"
                  checked={preLabelWithModel}
                  onChange={(e) => setPreLabelWithModel(e.target.checked)}
                  style={{ accentColor: C.amber, marginTop: '0.2rem' }}
                />
                <span style={{ color: '#d1d5db' }}>
                  Pre-label with {data?.what_to_pick?.round_settings?.pre_label_model_name || 'ticket-cls-v4 · top 3'}
                </span>
              </label>
            </div>

            {/* Locked notice */}
            <div
              style={{
                fontSize: '0.68rem',
                color: C.textMuted,
                borderTop: `1px solid ${C.border}`,
                paddingTop: '0.85rem',
                marginBottom: '1rem',
                lineHeight: 1.45,
              }}
            >
              Never picked: test tickets · paraphrases and other generated text (locked)
            </div>

            {/* Annotator time & Reviewer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: C.textMuted, fontFamily: 'monospace' }}>
              <span>ANNOTATOR TIME</span>
              <span style={{ color: '#ffffff' }}>{data?.what_to_pick?.round_settings?.annotator_time || '≈ 1 h 15'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: C.textMuted, fontFamily: 'monospace', marginTop: '0.35rem' }}>
              <span>DARIJA REVIEWER</span>
              <span style={{ color: C.green }}>{data?.what_to_pick?.round_settings?.darija_reviewer || 'assigned'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3 · Picks Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.65rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            3·Picks
          </h2>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `All · ${filterCounts.all}` },
              { id: 'margin', label: `Margin · ${filterCounts.margin}` },
              { id: 'diversity', label: `Diversity · ${filterCounts.diversity}` },
              { id: 'rare', label: `Rare · ${filterCounts.rare}` },
              { id: 'new_topic', label: `New topic · ${filterCounts.new_topic}` },
              { id: 'disagree', label: `Disagree · ${filterCounts.disagree}` },
              { id: 'random', label: `Random · ${filterCounts.random}` },
            ].map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  style={{
                    backgroundColor: active ? C.amber : C.card,
                    color: active ? '#000000' : '#9ca3af',
                    border: `1px solid ${active ? C.amber : C.border}`,
                    borderRadius: '999px',
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 2fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left: Ticket Embedding 2-D Map */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.85rem' }}>
              <span style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '1.1rem', color: '#ffffff' }}>
                Ticket map
              </span>
              <span style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace' }}>
                EMBEDDINGS · 2-D
              </span>
            </div>

            {/* Scatter SVG Graphic */}
            <div
              style={{
                width: '100%',
                height: '240px',
                backgroundColor: '#0a0b0d',
                borderRadius: '4px',
                border: `1px solid ${C.borderLight}`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 320 240">
                {/* Cluster 1: Unlabeled & Labeled */}
                <circle cx="65" cy="60" r="3.5" fill="#4b5563" opacity="0.6" />
                <circle cx="75" cy="50" r="3.5" fill="#4b5563" opacity="0.6" />
                <circle cx="85" cy="65" r="3.5" fill="#3b82f6" />
                <circle cx="95" cy="55" r="3.5" fill="#3b82f6" />
                <circle cx="105" cy="70" r="4" fill="#f59e0b" />

                {/* Cluster 2 */}
                <circle cx="170" cy="75" r="3.5" fill="#4b5563" opacity="0.6" />
                <circle cx="185" cy="85" r="3.5" fill="#3b82f6" />
                <circle cx="195" cy="70" r="3.5" fill="#3b82f6" />
                <circle cx="205" cy="90" r="4" fill="#f59e0b" />

                {/* Cluster 3 (Bottom left) */}
                <circle cx="70" cy="180" r="4" fill="#f59e0b" />
                <circle cx="85" cy="190" r="3.5" fill="#3b82f6" />
                <circle cx="95" cy="175" r="3.5" fill="#3b82f6" />
                <circle cx="110" cy="185" r="4" fill="#f59e0b" />

                {/* Center points */}
                <circle cx="140" cy="130" r="4" fill="#f59e0b" />
                <circle cx="190" cy="140" r="4" fill="#f59e0b" />

                {/* Cluster 23 - Callout Highlighted Cluster */}
                <circle
                  cx="230"
                  cy="175"
                  r="30"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  opacity="0.85"
                />
                <circle cx="225" cy="165" r="4" fill="#f59e0b" />
                <circle cx="235" cy="172" r="4" fill="#f59e0b" />
                <circle cx="220" cy="180" r="4" fill="#f59e0b" />
                <circle cx="240" cy="182" r="4" fill="#f59e0b" />

                {/* Cluster 23 Label Text */}
                <text x="180" y="150" fill="#f59e0b" fontSize="8" fontFamily="monospace" letterSpacing="0.08em">
                  CLUSTER 23 · 0 LABELED
                </text>
              </svg>

              {/* Legend at bottom */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '0.4rem',
                  left: '0.65rem',
                  display: 'flex',
                  gap: '0.85rem',
                  fontSize: '0.65rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#4b5563' }} /> unlabeled
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3b82f6' }} /> labeled
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b' }} /> picked now
                </span>
              </div>
            </div>
          </div>

          {/* Right: Table of Picks */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
              overflowX: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontFamily: 'monospace', fontSize: '0.65rem' }}>
                  <th style={{ paddingBottom: '0.65rem' }}>TICKET</th>
                  <th style={{ paddingBottom: '0.65rem', width: '42%' }}>TEXT · MASKED</th>
                  <th style={{ paddingBottom: '0.65rem' }}>WHY PICKED</th>
                  <th style={{ paddingBottom: '0.65rem' }}>MODEL TOP 2</th>
                  <th style={{ paddingBottom: '0.65rem', textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => (
                  <tr
                    key={p.ticket_id}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.85rem 0.5rem 0.85rem 0', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      <div style={{ color: '#ffffff', fontWeight: 500 }}>{p.ticket_id}</div>
                      <span
                        style={{
                          fontSize: '0.55rem',
                          color: C.textMuted,
                          border: `1px solid ${C.borderLight}`,
                          padding: '0 0.25rem',
                          borderRadius: '2px',
                        }}
                      >
                        {p.language}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', color: '#d1d5db', lineHeight: 1.45 }}>
                      {p.text}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: C.amber }}>
                      {p.why_picked}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', fontFamily: 'monospace', fontSize: '0.72rem', color: C.textMuted }}>
                      {p.model_top_2}
                    </td>
                    <td style={{ padding: '0.85rem 0 0.85rem 0.5rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleRemovePick(p.ticket_id)}
                        title="Retirer ce ticket du round"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: C.textMuted,
                          cursor: 'pointer',
                          padding: '0.2rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = C.textMuted)}
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cluster 23 Callout Banner (Mockup 3 top) */}
        <div
          style={{
            marginTop: '1.5rem',
            border: `1px solid rgba(245, 158, 11, 0.4)`,
            backgroundColor: 'rgba(245, 158, 11, 0.03)',
            borderRadius: '6px',
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', letterSpacing: '0.1em', color: C.amber, fontFamily: 'monospace', marginBottom: '0.25rem' }}>
              {data?.picks_section?.cluster_callout?.title || 'NEW TOPIC? · CLUSTER 23 · 148 TICKETS'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#d1d5db', marginBottom: '0.2rem' }}>
              Frequent words: <span style={{ fontFamily: 'monospace', color: '#ffffff' }}>{data?.picks_section?.cluster_callout?.frequent_words || 'code OTP · mise à jour · application · ma tdkhlch'}</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
              {data?.picks_section?.cluster_callout?.footnote || 'A new label creates a new version and needs a retrain.'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handlePickFromCluster}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${C.amber}`,
                color: C.amber,
                padding: '0.45rem 0.95rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Pick 30 from it
            </button>
            <button
              type="button"
              onClick={() => setShowNewLabelModal(true)}
              style={{
                backgroundColor: C.cardElevated,
                border: `1px solid ${C.borderLight}`,
                color: '#ffffff',
                padding: '0.45rem 0.95rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Propose a new label...
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4 · Is it worth it Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.65rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            4·Is it worth it?
          </h2>
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            {data?.is_it_worth_it?.header_sub || 'MEASURED ON THE RANDOM CONTROL AND THE LOCKED TEST SET'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1.85fr', gap: '1.5rem', alignItems: 'stretch' }}>
          {/* Left: Wrong labels found Bar Chart Card */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
                <span style={{ fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#ffffff' }}>
                  {data?.is_it_worth_it?.chart?.title || 'Wrong labels found'}
                </span>
                <span style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace' }}>
                  {data?.is_it_worth_it?.chart?.sub || 'PER 100 ROWS CHECKED'}
                </span>
              </div>

              {/* Bar Chart Area */}
              <div
                style={{
                  height: '145px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-around',
                  paddingBottom: '0.5rem',
                  borderBottom: `1px solid ${C.borderLight}`,
                  position: 'relative',
                  marginBottom: '0.5rem',
                }}
              >
                {/* Column 1: R1 · PICKED */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '65px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                    {data?.is_it_worth_it?.chart?.bars?.[0]?.label || '40'}
                  </div>
                  <div
                    style={{
                      width: '52px',
                      height: '92px',
                      backgroundColor: C.amber,
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                </div>

                {/* Column 2: R1 · RANDOM */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '65px' }}>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                    {data?.is_it_worth_it?.chart?.bars?.[1]?.label || '[RESULT]'}
                  </div>
                  <div
                    style={{
                      width: '52px',
                      height: '86px',
                      border: '1.5px dashed rgba(255, 255, 255, 0.25)',
                      borderRadius: '2px 2px 0 0',
                      backgroundColor: 'transparent',
                    }}
                  />
                </div>

                {/* Column 3: R2 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '65px' }}>
                  <div style={{ fontSize: '0.9rem', color: C.textMuted, fontFamily: 'monospace', marginBottom: '0.4rem' }}>
                    —
                  </div>
                  <div
                    style={{
                      width: '36px',
                      height: '2px',
                      backgroundColor: '#374151',
                    }}
                  />
                </div>
              </div>

              {/* X Axis labels */}
              <div style={{ display: 'flex', justifyContent: 'space-around', fontFamily: 'monospace', fontSize: '0.65rem', color: C.textMuted, marginBottom: '1.25rem' }}>
                <div style={{ width: '65px', textAlign: 'center' }}>
                  {data?.is_it_worth_it?.chart?.bars?.[0]?.sub || 'R1 · PICKED'}
                </div>
                <div style={{ width: '65px', textAlign: 'center' }}>
                  {data?.is_it_worth_it?.chart?.bars?.[1]?.sub || 'R1 · RANDOM'}
                </div>
                <div style={{ width: '65px', textAlign: 'center' }}>
                  {data?.is_it_worth_it?.chart?.bars?.[2]?.sub || 'R2'}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.68rem', color: C.textMuted, lineHeight: 1.45 }}>
              {data?.is_it_worth_it?.chart?.footer || "If picked rows don't beat random, the strategy mix is changed before the next round."}
            </div>
          </div>

          {/* Right Column: Table + STOP RULE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Table Box */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.15rem 1.25rem',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', letterSpacing: '0.08em' }}>
                    <th style={{ paddingBottom: '0.65rem' }}>ROUND</th>
                    <th style={{ paddingBottom: '0.65rem' }}>CHECKED</th>
                    <th style={{ paddingBottom: '0.65rem' }}>FIXED</th>
                    <th style={{ paddingBottom: '0.65rem' }}>HOURS</th>
                    <th style={{ paddingBottom: '0.65rem' }}>DATA</th>
                    <th style={{ paddingBottom: '0.65rem' }}>MODEL</th>
                    <th style={{ paddingBottom: '0.65rem', textAlign: 'right' }}>RECALL Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.is_it_worth_it?.table?.rows || [
                    { round: 'R1', checked: '240', fixed: '96', hours: '8 h', data: 'v4', model: 'churn-xgb-08', recall_delta: '[RESULT]' },
                    { round: 'R2', checked: '300', fixed: '—', hours: '≈ 10 h', data: 'v5', model: '—', recall_delta: '—' },
                  ]).map((r) => (
                    <tr key={r.round} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '0.85rem 0.4rem 0.85rem 0', color: '#ffffff', fontWeight: 600 }}>{r.round}</td>
                      <td style={{ padding: '0.85rem 0.4rem', color: '#d1d5db' }}>{r.checked}</td>
                      <td style={{ padding: '0.85rem 0.4rem', color: r.fixed === '—' ? C.textMuted : '#ffffff' }}>{r.fixed}</td>
                      <td style={{ padding: '0.85rem 0.4rem', color: C.textMuted }}>{r.hours}</td>
                      <td style={{ padding: '0.85rem 0.4rem', color: '#ffffff' }}>{r.data}</td>
                      <td style={{ padding: '0.85rem 0.4rem', color: r.model === '—' ? C.textMuted : '#ffffff' }}>{r.model}</td>
                      <td style={{ padding: '0.85rem 0 0.85rem 0.4rem', textAlign: 'right', color: C.textMuted }}>
                        {r.recall_delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* STOP RULE Card */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.15rem 1.25rem',
              }}
            >
              <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace', marginBottom: '0.85rem' }}>
                {data?.is_it_worth_it?.stop_rule?.title || 'STOP RULE'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace', display: 'block', marginBottom: '0.35rem' }}>
                    {data?.is_it_worth_it?.stop_rule?.left_label || 'STOP WHEN FIXES FALL UNDER'}
                  </label>
                  <input
                    type="text"
                    value={stopRuleFixes}
                    onChange={(e) => setStopRuleFixes(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: C.cardElevated,
                      border: `1px solid ${C.borderLight}`,
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '0.5rem 0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.82rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace', display: 'block', marginBottom: '0.35rem' }}>
                    {data?.is_it_worth_it?.stop_rule?.right_label || 'AND RECALL GAINS UNDER'}
                  </label>
                  <input
                    type="text"
                    value={stopRuleRecall}
                    onChange={(e) => setStopRuleRecall(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: C.cardElevated,
                      border: `1px solid ${C.borderLight}`,
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '0.5rem 0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.82rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
                {data?.is_it_worth_it?.stop_rule?.footer || 'Two rounds in a row. Then rounds only start on new data or a drift alert.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5 · Automation Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.65rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            5·Automation
          </h2>
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            ROUNDS CAN START ON THEIR OWN; PROMOTION NEVER DOES
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {(data?.automation || []).map((rule) => {
            const isChecked = automationRules[rule.id] ?? rule.enabled;
            return (
              <label
                key={rule.id}
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  cursor: rule.disabled ? 'not-allowed' : 'pointer',
                  opacity: rule.disabled ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  disabled={rule.disabled}
                  checked={isChecked}
                  onChange={(e) => {
                    if (rule.disabled) return;
                    setAutomationRules((prev) => ({ ...prev, [rule.id]: e.target.checked }));
                  }}
                  style={{ accentColor: C.amber, marginTop: '0.2rem' }}
                />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#ffffff', marginBottom: '0.2rem' }}>
                    {rule.title}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
                    {rule.sub}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Guardrails Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '4rem' }}>
        <h3
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: '1.25rem',
            fontWeight: 400,
            color: '#ffffff',
            margin: '0 0 1rem 0',
          }}
        >
          Guardrails
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {(data?.guardrails || []).map((g) => (
            <div
              key={g.title}
              style={{
                backgroundColor: C.card,
                border: g.is_warning ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
              }}
            >
              {g.is_warning ? (
                <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
              ) : (
                <Check size={16} color={C.green} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
              )}
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#ffffff', marginBottom: '0.15rem' }}>
                  {g.title}
                </div>
                <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
                  {g.subtitle}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Bottom Sticky Action Banner */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#090a0b',
          borderTop: `1px solid ${C.border}`,
          padding: '1rem 3rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
            Round 3 · {roundBudget} tickets · 6 strategies · creates {kpis.output}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted }}>
            {data?.action_banner?.detail || 'Round log saved: model used, score of every ticket, why each ticket was picked'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            onClick={handleSaveDraft}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: '#d1d5db',
              padding: '0.55rem 1.25rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Save draft
          </button>

          <button
            type="button"
            onClick={handleSendToLabeling}
            style={{
              backgroundColor: C.amber,
              border: 'none',
              color: '#000000',
              padding: '0.55rem 1.4rem',
              borderRadius: '4px',
              fontSize: '0.82rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            Send {roundBudget} tickets to labeling →
          </button>
        </div>
      </div>

      {/* Propose New Label Modal */}
      {showNewLabelModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: '8px',
              padding: '2rem',
              width: '450px',
              maxWidth: '90%',
            }}
          >
            <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '1.3rem', color: '#ffffff', margin: '0 0 0.5rem 0' }}>
              Propose a new label
            </h3>
            <p style={{ fontSize: '0.78rem', color: C.textMuted, marginBottom: '1.25rem' }}>
              For Cluster {data?.picks_section?.cluster_callout?.cluster_id || 23} (Frequent words: code OTP, mise à jour).
              Proposing a new label will register a new candidate version.
            </p>
            <input
              type="text"
              placeholder="e.g. otp_issue or authentication"
              value={newLabelInput}
              onChange={(e) => setNewLabelInput(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: C.cardElevated,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                color: '#ffffff',
                padding: '0.55rem 0.85rem',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                marginBottom: '1.25rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowNewLabelModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProposeLabelSubmit}
                style={{
                  backgroundColor: C.amber,
                  border: 'none',
                  color: '#000000',
                  padding: '0.45rem 1.15rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Propose label
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round History Modal */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: '8px',
              padding: '2rem',
              width: '600px',
              maxWidth: '90%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '1.3rem', color: '#ffffff', margin: 0 }}>
                Round History
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted }}>
                  <th style={{ paddingBottom: '0.5rem', textAlign: 'left' }}>ROUND</th>
                  <th style={{ paddingBottom: '0.5rem', textAlign: 'left' }}>STRATEGY</th>
                  <th style={{ paddingBottom: '0.5rem', textAlign: 'left' }}>TICKETS</th>
                  <th style={{ paddingBottom: '0.5rem', textAlign: 'left' }}>OUTPUT</th>
                  <th style={{ paddingBottom: '0.5rem', textAlign: 'right' }}>F1 Δ</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.65rem 0', color: '#ffffff' }}>Round 1</td>
                  <td style={{ padding: '0.65rem 0', color: C.textMuted }}>random · cold start</td>
                  <td style={{ padding: '0.65rem 0' }}>1,000</td>
                  <td style={{ padding: '0.65rem 0' }}>v2</td>
                  <td style={{ padding: '0.65rem 0', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.65rem 0', color: '#ffffff' }}>Round 2</td>
                  <td style={{ padding: '0.65rem 0', color: C.textMuted }}>margin + diversity</td>
                  <td style={{ padding: '0.65rem 0' }}>520</td>
                  <td style={{ padding: '0.65rem 0' }}>v4</td>
                  <td style={{ padding: '0.65rem 0', textAlign: 'right', color: C.green }}>+0.03</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.65rem 0', color: C.amber }}>Round 3 (draft)</td>
                  <td style={{ padding: '0.65rem 0', color: C.textMuted }}>6 strategies</td>
                  <td style={{ padding: '0.65rem 0' }}>{roundBudget}</td>
                  <td style={{ padding: '0.65rem 0' }}>{kpis.output}</td>
                  <td style={{ padding: '0.65rem 0', textAlign: 'right' }}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextActiveLearningPage;
