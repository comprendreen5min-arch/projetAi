import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  X,
  History,
  Save,
} from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  ActiveLearningStateResponse,
  PickRowItem,
} from '../types';

export const ActiveLearningPage: React.FC = () => {
  const navigate = useNavigate();

  // 1. Dataset state
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [state, setState] = useState<ActiveLearningStateResponse | null>(null);

  // 2. Interactive Strategy Sliders state
  const [strategyCounts, setStrategyCounts] = useState<{ [key: string]: number }>({
    near_threshold: 120,
    models_disagree: 75,
    looks_wrong: 60,
    weak_segments: 15,
    random_control: 30,
  });
  const [budgetRows, setBudgetRows] = useState<number>(300);

  // 3. Picks Table filter
  const [activeStrategyFilter, setActiveStrategyFilter] = useState<string>('all');
  const [picksList, setPicksList] = useState<PickRowItem[]>([]);

  // 4. Automation and stop rules state
  const [automation, setAutomation] = useState({
    start_on_new_crm: true,
    start_on_drift: true,
    requeue_not_yet: true,
    retrain_after_round: true,
    notify_reviewer: false,
    auto_promote: false,
  });
  const [stopRuleFixes, setStopRuleFixes] = useState<number>(10);
  const [stopRuleRecallGain, setStopRuleRecallGain] = useState<number>(1);

  // 5. Modals and Notifications
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // TopBar listener for "Historique des cycles"
  useEffect(() => {
    const handleHistoryEvent = () => setShowHistoryModal(true);
    window.addEventListener('datalift:open-round-history', handleHistoryEvent);
    return () => window.removeEventListener('datalift:open-round-history', handleHistoryEvent);
  }, []);

  // 1. Initial datasets load
  useEffect(() => {
    api.getDatasets()
      .then((data) => {
        setDatasets(data);
        if (data.length > 0) {
          const defaultDs = data.find((d) => d.name === 'data' || d.name === 'customer_churn.csv') || data[0];
          setSelectedDatasetId(defaultDs.id);
        }
      })
      .catch((err) => console.error('Erreur chargement datasets:', err))
      .finally(() => setLoading(false));
  }, []);

  // 2. Load active learning state
  const loadState = useCallback(async (dsId: string) => {
    if (!dsId) return;
    try {
      const res = await api.getActiveLearningState(dsId);
      setState(res);
      setBudgetRows(res.header.budget_rows);
      setPicksList(res.picks);

      const counts: { [key: string]: number } = {};
      res.strategies.forEach((s) => {
        counts[s.id] = s.rows;
      });
      setStrategyCounts(counts);

      setAutomation(res.automation);
      setStopRuleFixes(res.stop_rule_fixes_pct);
      setStopRuleRecallGain(res.stop_rule_recall_gain_pts);
    } catch (err) {
      console.error('Erreur chargement Active Learning:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      loadState(selectedDatasetId);
    }
  }, [selectedDatasetId, loadState]);

  // Current dataset object
  const currentDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  );

  // Strategy sliders total computation
  const currentTotalRows = useMemo(() => {
    return Object.values(strategyCounts).reduce((acc, v) => acc + (v || 0), 0);
  }, [strategyCounts]);

  const currentTotalPercentage = useMemo(() => {
    if (!budgetRows) return 0;
    return Math.round((currentTotalRows / budgetRows) * 100);
  }, [currentTotalRows, budgetRows]);

  const isExact100 = currentTotalRows === budgetRows;

  // Handler for slider updates
  const handleSliderChange = (strategyId: string, value: number) => {
    setStrategyCounts((prev) => {
      const next = { ...prev, [strategyId]: value };
      return next;
    });
  };

  // Filtered picks list
  const filteredPicks = useMemo(() => {
    if (activeStrategyFilter === 'all') return picksList;
    return picksList.filter((p) => p.strategy === activeStrategyFilter);
  }, [picksList, activeStrategyFilter]);

  // Handler to remove a pick
  const handleRemovePick = (customerId: string) => {
    setPicksList((prev) => prev.filter((p) => p.customer_id !== customerId));
    showToast(`Ligne ${customerId} retirée. Le créneau est réattribué automatiquement.`, 'info');
  };

  // Handler to save draft
  const handleSaveDraft = async () => {
    if (!selectedDatasetId) return;
    setIsSavingDraft(true);
    try {
      await api.updateActiveLearningSettings(selectedDatasetId, {
        rows_this_round: budgetRows,
        strategy_counts: strategyCounts,
        automation,
        stop_rule: {
          fixes_under_pct: stopRuleFixes,
          recall_gain_under_pts: stopRuleRecallGain,
        },
      });
      showToast('Brouillon du cycle 2 enregistré avec succès !', 'success');
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement du brouillon", 'error');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handler to send rows to labeling
  const handleSendToLabeling = async () => {
    if (!selectedDatasetId) return;
    setIsSubmitting(true);
    try {
      const res = await api.sendPicksToLabeling(selectedDatasetId, {
        round_number: 2,
        target_split: 'train',
      });
      showToast(`${res.rows_enqueued} lignes envoyées vers l'étape 05 Étiquetage ! Version ${res.new_version_label} préparée.`, 'success');
      setTimeout(() => {
        navigate('/labeling');
      }, 1500);
    } catch (err) {
      console.error(err);
      showToast("Échec de l'envoi vers l'étiquetage", 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !state) {
    return (
      <div style={{ padding: '3rem', color: 'var(--text-muted)' }} className="font-mono">
        Chargement du cycle d'apprentissage actif...
      </div>
    );
  }

  const { header, loop_steps, rounds_history, round_settings, pool_points, weak_cluster_label, guardrails } = state;

  return (
    <div style={{ padding: '2rem 3rem 8rem 3rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            backgroundColor: notification.type === 'error' ? '#7f1d1d' : notification.type === 'info' ? '#1e293b' : '#14532d',
            border: `1px solid ${notification.type === 'error' ? '#ef4444' : notification.type === 'info' ? '#38bdf8' : '#22c55e'}`,
            color: '#fff',
            padding: '0.75rem 1.25rem',
            borderRadius: '4px',
            fontSize: '0.85rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
          className="font-mono"
        >
          {notification.message}
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '2rem',
              maxWidth: '680px',
              width: '90%',
              boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={18} color="var(--amber)" />
                <h3 className="font-serif" style={{ fontSize: '1.4rem', color: 'var(--text-main)', fontStyle: 'italic', margin: 0 }}>
                  Historique des cycles d'apprentissage actif
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {rounds_history.map((r) => (
                <div
                  key={r.round_number}
                  style={{
                    backgroundColor: 'var(--bg-main)',
                    border: `1px solid ${r.status === 'draft' ? 'var(--amber)' : 'var(--border)'}`,
                    borderRadius: '4px',
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      CYCLE {r.round_number} · {r.status.toUpperCase()}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '0.7rem',
                        color: r.status === 'done' ? '#22c55e' : r.status === 'draft' ? 'var(--amber)' : 'var(--text-muted)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '2px',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                      }}
                    >
                      {r.data_version}
                    </span>
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {r.status === 'done' && (
                      <>
                        {r.checked_count} vérifiés · {r.fixed_count} corrigés · {r.hours} h · modèle {r.model_name} · gain rappel {r.recall_gain}
                      </>
                    )}
                    {r.status === 'draft' && (
                      <>
                        {r.checked_count} lignes prévues · 5 stratégies de mix · temps estimé ≈ {r.hours} h
                      </>
                    )}
                    {r.status === 'upcoming' && <>Démarre lorsque les règles d'arrêt ou les alertes de dérive le déclenchent.</>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="font-mono"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div style={{ marginBottom: '2.5rem' }}>
        {/* Breadcrumb line matching template */}
        <div
          className="font-mono"
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            marginBottom: '0.6rem',
            textTransform: 'uppercase',
          }}
        >
          ACTIVE LEARNING • ROUND {header.round_number} • SCORED BY {header.scored_by_model.toUpperCase()} • TARGET = {header.target_column.toUpperCase()}
        </div>

        {/* Title + Giant Round Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '1.8rem',
          }}
        >
          <div>
            <h1
              className="font-serif"
              style={{
                fontSize: '2.75rem',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'var(--text-main)',
                fontStyle: 'italic',
                marginBottom: '0.35rem',
              }}
            >
              {currentDataset?.name || 'customer_churn.csv'}
            </h1>
            {datasets.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Jeu actif :
                </span>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="font-mono"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Round Next Badge matching template */}
          <div
            style={{
              textAlign: 'right',
              padding: '0.4rem 0.8rem',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '4px',
              backgroundColor: 'rgba(245, 158, 11, 0.05)',
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: '0.65rem',
                color: 'var(--amber)',
                letterSpacing: '0.12em',
                fontWeight: 600,
              }}
            >
              DRAFT
            </div>
            <div
              className="font-serif"
              style={{
                fontSize: '3rem',
                lineHeight: 1,
                color: 'var(--amber)',
                fontWeight: 400,
                marginTop: '0.1rem',
              }}
            >
              0{header.round_number}
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: '0.62rem',
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                marginTop: '0.2rem',
              }}
            >
              NEXT ROUND
            </div>
          </div>
        </div>

        {/* 4 Top KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* Card 1: POOL */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem 1.25rem',
            }}
          >
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              POOL
            </div>
            <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-main)', margin: '0.3rem 0' }}>
              {header.pool_size.toLocaleString('fr-FR')}
            </div>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {header.pool_breakdown}
            </div>
          </div>

          {/* Card 2: BUDGET */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem 1.25rem',
            }}
          >
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              BUDGET
            </div>
            <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-main)', margin: '0.3rem 0' }}>
              {header.budget_rows} rows
            </div>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {header.budget_subtitle}
            </div>
          </div>

          {/* Card 3: HIT RATE · ROUND 1 */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem 1.25rem',
            }}
          >
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              HIT RATE · ROUND 1
            </div>
            <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-main)', margin: '0.3rem 0' }}>
              {Math.round(header.hit_rate_round_1 * 100)}%
            </div>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {header.hit_rate_subtitle}
            </div>
          </div>

          {/* Card 4: OUTPUT */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem 1.25rem',
            }}
          >
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              OUTPUT
            </div>
            <div className="font-mono" style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-main)', margin: '0.3rem 0' }}>
              {header.output_version}
            </div>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {header.output_subtitle}
            </div>
          </div>
        </div>

        {/* Informational Callout Box matching template */}
        <div
          style={{
            backgroundColor: 'rgba(56, 189, 248, 0.04)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderLeft: '3px solid #38bdf8',
            borderRadius: '4px',
            padding: '1rem 1.25rem',
          }}
        >
          <div className="font-mono" style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 600, letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
            HOW ACTIVE LEARNING WORKS FOR TABLES
          </div>
          <div className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
            Labels come from the CRM, but checking one costs an analyst's time. Datalift scores every unchecked row with the current model and picks the rows where a check is most likely to fix a label or teach the model something new. They go to 05 Labeling; the next model is trained on the result.
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1 · LOOP */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.6rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
            1 · Loop
          </h2>
          <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            ONE ROUND = SCORE, PICK, CHECK, RETRAIN, MEASURE
          </span>
        </div>

        {/* 5 Steps Pipeline */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {loop_steps.map((s) => {
            const isActive = s.status === 'active';
            const isDone = s.status === 'done';
            return (
              <div
                key={s.step_number}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: `1px solid ${isActive ? 'var(--amber)' : isDone ? '#22c55e' : 'var(--border)'}`,
                  borderRadius: '4px',
                  padding: '1.1rem',
                  position: 'relative',
                }}
              >
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.65rem',
                    color: isActive ? 'var(--amber)' : isDone ? '#22c55e' : 'var(--text-muted)',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    marginBottom: '0.4rem',
                  }}
                >
                  {s.step_number} · {s.title}
                </div>
                <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                  {s.info}
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.68rem',
                    color: isDone ? '#22c55e' : isActive ? 'var(--amber)' : 'var(--text-muted)',
                  }}
                >
                  {s.detail}
                </div>
              </div>
            );
          })}
        </div>

        {/* 3 Rounds status cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.25rem',
          }}
        >
          {/* Round 1: Done */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem 1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                ROUND 1 · DONE
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.3rem' }}>
              240 checked · 96 fixed
            </div>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              → {rounds_history[0]?.data_version || 'v4'} · {rounds_history[0]?.model_name || header.scored_by_model}
            </div>
          </div>

          {/* Round 2: Draft (Amber outline) */}
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.03)',
              border: '1px solid var(--amber)',
              borderRadius: '4px',
              padding: '1.1rem 1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 600 }}>
                ROUND 2 · DRAFT
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.3rem' }}>
              {budgetRows} rows · 5 strategies
            </div>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              → {header.output_version}
            </div>
          </div>

          {/* Round 3: Dimmed */}
          <div
            style={{
              backgroundColor: 'transparent',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '4px',
              padding: '1.1rem 1.25rem',
              opacity: 0.65,
            }}
          >
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.4rem' }}>
              ROUND 3
            </div>
            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Starts when the stop rule allows
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2 · WHAT TO PICK */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.6rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
            2 · What to pick
          </h2>
          <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            A MIX, NOT ONE RULE
          </span>
        </div>

        {/* 2 Columns: Sliders on left, Settings on right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: '2rem',
          }}
        >
          {/* Left Column: Sliders */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
              {/* Header labels */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 0.6fr', fontSize: '0.68rem', color: 'var(--text-muted)' }} className="font-mono">
                <span>STRATEGY</span>
                <span>SHARE OF THE ROUND</span>
                <span style={{ textAlign: 'right' }}>ROWS</span>
              </div>

              {/* Slider 1: Near the threshold */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 0.6fr', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Near the threshold
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    p(yes) within ± 0.10 of 0.42, threshold set in 06
                  </div>
                </div>
                <div>
                  <input
                    type="range"
                    min="0"
                    max={budgetRows}
                    value={strategyCounts.near_threshold || 0}
                    onChange={(e) => handleSliderChange('near_threshold', parseInt(e.target.value) || 0)}
                    style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }}
                  />
                </div>
                <div className="font-mono" style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {strategyCounts.near_threshold || 0}
                </div>
              </div>

              {/* Slider 2: Models disagree */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 0.6fr', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Models disagree
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {header.scored_by_model}, lgbm and baseline give different answers
                  </div>
                </div>
                <div>
                  <input
                    type="range"
                    min="0"
                    max={budgetRows}
                    value={strategyCounts.models_disagree || 0}
                    onChange={(e) => handleSliderChange('models_disagree', parseInt(e.target.value) || 0)}
                    style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }}
                  />
                </div>
                <div className="font-mono" style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {strategyCounts.models_disagree || 0}
                </div>
              </div>

              {/* Slider 3: Label looks wrong */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 0.6fr', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Label looks wrong
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    model ≥ 0.90 against CRM label · same rule as 05
                  </div>
                </div>
                <div>
                  <input
                    type="range"
                    min="0"
                    max={budgetRows}
                    value={strategyCounts.looks_wrong || 0}
                    onChange={(e) => handleSliderChange('looks_wrong', parseInt(e.target.value) || 0)}
                    style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }}
                  />
                </div>
                <div className="font-mono" style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {strategyCounts.looks_wrong || 0}
                </div>
              </div>

              {/* Slider 4: Weak or empty segments */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 0.6fr', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Weak or empty segments
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {weak_cluster_label.toLowerCase()} · flagged in 06
                  </div>
                </div>
                <div>
                  <input
                    type="range"
                    min="0"
                    max={budgetRows}
                    value={strategyCounts.weak_segments || 0}
                    onChange={(e) => handleSliderChange('weak_segments', parseInt(e.target.value) || 0)}
                    style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }}
                  />
                </div>
                <div className="font-mono" style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {strategyCounts.weak_segments || 0}
                </div>
              </div>

              {/* Slider 5: Random control [MIN 10%] */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.6fr 0.6fr', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      Random control
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '0.6rem',
                        color: 'var(--amber)',
                        border: '1px solid rgba(245,158,11,0.4)',
                        padding: '0.1rem 0.3rem',
                        borderRadius: '2px',
                      }}
                    >
                      MIN 10%
                    </span>
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Gives an honest hit rate to compare against
                  </div>
                </div>
                <div>
                  <input
                    type="range"
                    min={Math.floor(budgetRows * 0.10)}
                    max={budgetRows}
                    value={strategyCounts.random_control || 0}
                    onChange={(e) => handleSliderChange('random_control', parseInt(e.target.value) || 0)}
                    style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }}
                  />
                </div>
                <div className="font-mono" style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {strategyCounts.random_control || 0}
                </div>
              </div>
            </div>

            {/* Total bar matching template */}
            <div
              style={{
                marginTop: '2rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              className="font-mono"
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                TOTAL
              </span>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: isExact100 ? '#22c55e' : '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {isExact100 ? <Check size={14} /> : <AlertTriangle size={14} />}
                {currentTotalPercentage}% · {currentTotalRows} / {budgetRows} rows
              </span>
            </div>
          </div>

          {/* Right Column: Round settings */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <h3 className="font-serif" style={{ fontSize: '1.35rem', fontWeight: 400, color: 'var(--text-main)', margin: 0, fontStyle: 'italic' }}>
              Round settings
            </h3>

            {/* Rows this round */}
            <div>
              <label className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                ROWS THIS ROUND
              </label>
              <input
                type="number"
                value={budgetRows}
                onChange={(e) => setBudgetRows(Math.max(10, parseInt(e.target.value) || 10))}
                className="font-mono"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.55rem',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                }}
              />
            </div>

            {/* Pool */}
            <div>
              <label className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                POOL
              </label>
              <select
                className="font-mono"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.55rem',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                }}
              >
                <option>New CRM rows + "not yet"</option>
                <option>Unlabeled pool only</option>
                <option>All dataset rows</option>
              </select>
            </div>

            {/* Skip rows checked in the last */}
            <div>
              <label className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                SKIP ROWS CHECKED IN THE LAST
              </label>
              <input
                type="text"
                defaultValue="90 days"
                className="font-mono"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.55rem',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                }}
              />
            </div>

            {/* Checkbox: One row per customer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '15px',
                  height: '15px',
                  borderRadius: '2px',
                  backgroundColor: 'var(--amber)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={11} color="#000" strokeWidth={3} />
              </div>
              <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)' }}>
                One row per customer
              </span>
            </div>

            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Never picked: test rows · smote rows (locked)
            </div>

            {/* Label maturity */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <label className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.15rem' }}>
                LABEL MATURITY
              </label>
              <div className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                OUTCOME KNOWN AFTER
              </div>
              <input
                type="text"
                defaultValue="60 days"
                className="font-mono"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.55rem',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                  marginBottom: '0.4rem',
                }}
              />
              <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {round_settings.maturity_subtitle}
              </div>
            </div>

            {/* Analyst time & Expected fixes */}
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '0.8rem',
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr',
                gap: '0.5rem',
              }}
              className="font-mono"
            >
              <div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>ANALYST TIME</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginTop: '0.15rem' }}>
                  {round_settings.analyst_time}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>EXPECTED FIXES</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--amber)', marginTop: '0.15rem' }}>
                  {round_settings.expected_fixes}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3 · PICKS */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.6rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
            3 · Picks
          </h2>

          {/* Filter tabs matching template */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[
              { id: 'all', label: `All · ${budgetRows}` },
              { id: 'near_threshold', label: `Near threshold · ${strategyCounts.near_threshold || 0}` },
              { id: 'models_disagree', label: `Disagree · ${strategyCounts.models_disagree || 0}` },
              { id: 'looks_wrong', label: `Looks wrong · ${strategyCounts.looks_wrong || 0}` },
              { id: 'weak_segments', label: `Segments · ${strategyCounts.weak_segments || 0}` },
              { id: 'random_control', label: `Random · ${strategyCounts.random_control || 0}` },
            ].map((tab) => {
              const isSelected = activeStrategyFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveStrategyFilter(tab.id)}
                  className="font-mono"
                  style={{
                    backgroundColor: isSelected ? 'var(--amber)' : 'var(--bg-surface)',
                    color: isSelected ? '#000' : 'var(--text-muted)',
                    border: `1px solid ${isSelected ? 'var(--amber)' : 'var(--border)'}`,
                    borderRadius: '4px',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2 Columns: 2D Projection Map on left, Candidate Picks list on right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.4fr',
            gap: '1.5rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '1.75rem',
          }}
        >
          {/* Left: Pool Map 2D Projection */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span className="font-serif" style={{ fontSize: '1.25rem', color: 'var(--text-main)', fontStyle: 'italic' }}>
                  Pool map
                </span>
                <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                  2-D PROJECTION
                </span>
              </div>

              {/* Scatter Plot SVG */}
              <div
                style={{
                  width: '100%',
                  height: '320px',
                  backgroundColor: 'var(--bg-main)',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <svg width="100%" height="100%" viewBox="-10 -10 20 20" style={{ display: 'block' }}>
                  {/* Grid lines */}
                  <line x1="-10" y1="0" x2="10" y2="0" stroke="rgba(255,255,255,0.03)" strokeWidth="0.08" />
                  <line x1="0" y1="-10" x2="0" y2="10" stroke="rgba(255,255,255,0.03)" strokeWidth="0.08" />

                  {/* Weak cluster circle */}
                  <circle
                    cx="4.5"
                    cy="4.5"
                    r="2.5"
                    fill="rgba(245, 158, 11, 0.05)"
                    stroke="#f59e0b"
                    strokeWidth="0.1"
                    strokeDasharray="0.3 0.3"
                  />
                  <text
                    x="4.5"
                    y="1.6"
                    fill="#f59e0b"
                    fontSize="0.75"
                    textAnchor="middle"
                    className="font-mono"
                    style={{ fontWeight: 600, letterSpacing: '0.05em' }}
                  >
                    {weak_cluster_label}
                  </text>

                  {/* Points */}
                  {pool_points.map((pt, i) => {
                    const isPicked = pt.status === 'picked' || pt.status === 'picked now';
                    const isChecked = pt.status === 'checked' || pt.status === 'already checked';
                    const color = isPicked ? '#f59e0b' : isChecked ? '#94a3b8' : '#38bdf8';
                    const radius = isPicked ? 0.35 : 0.22;
                    return (
                      <circle
                        key={pt.id || i}
                        cx={pt.x}
                        cy={pt.y}
                        r={radius}
                        fill={color}
                        opacity={isPicked ? 1 : 0.75}
                      >
                        <title>{`${pt.id}: (${pt.x}, ${pt.y}) · ${pt.status}`}</title>
                      </circle>
                    );
                  })}
                </svg>
              </div>

              {/* Legend matching template */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.25rem',
                  marginTop: '0.85rem',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                }}
                className="font-mono"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8', display: 'inline-block' }} />
                  <span>unchecked</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block' }} />
                  <span>already checked</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                  <span>picked now</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Candidate Picks Table */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              {/* Table header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 2.4fr 0.8fr 0.8fr 0.4fr',
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.5rem',
                }}
                className="font-mono"
              >
                <span>CUSTOMER</span>
                <span>WHY PICKED</span>
                <span>P(YES)</span>
                <span>LABEL</span>
                <span style={{ textAlign: 'right' }}></span>
              </div>

              {/* Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '380px', overflowY: 'auto' }}>
                {filteredPicks.slice(0, 10).map((p) => (
                  <div
                    key={p.customer_id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 2.4fr 0.8fr 0.8fr 0.4fr',
                      alignItems: 'center',
                      padding: '0.55rem 0',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      fontSize: '0.78rem',
                    }}
                    className="font-mono"
                  >
                    <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{p.customer_id}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{p.why_picked}</span>
                    <span style={{ color: 'var(--text-main)' }}>{p.p_yes.toFixed(2)}</span>
                    <span
                      style={{
                        color: p.label === 'yes' ? 'var(--amber)' : p.label === 'empty' ? 'var(--text-muted)' : 'var(--text-main)',
                      }}
                    >
                      {p.label}
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleRemovePick(p.customer_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '0.2rem',
                        }}
                        title="Retirer cette ligne"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Note below list matching template */}
            <div
              className="font-mono"
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                marginTop: '1.2rem',
                borderTop: '1px solid var(--border)',
                paddingTop: '0.75rem',
              }}
            >
              Removing a row frees its slot; Datalift picks the next one with the same strategy. The analyst does not see which strategy picked a row, so it can't bias the check.
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4 · IS IT WORTH IT? */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.6rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
            4 · Is it worth it?
          </h2>
          <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            MEASURED ON THE RANDOM CONTROL AND THE LOCKED TEST SET
          </span>
        </div>

        {/* 2 Columns: Bar chart on left, Rounds Table on right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.6fr',
            gap: '1.5rem',
          }}
        >
          {/* Left: Bar Chart */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <span className="font-serif" style={{ fontSize: '1.25rem', color: 'var(--text-main)', fontStyle: 'italic' }}>
                  Wrong labels found
                </span>
                <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                  PER 100 ROWS CHECKED
                </span>
              </div>

              {/* Bar visualization */}
              <div
                style={{
                  height: '160px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-around',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '0.5rem',
                }}
              >
                {/* Bar 1: R1 PICKED */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '55px' }}>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--amber)', fontWeight: 600 }}>
                    40
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: '100px',
                      backgroundColor: 'var(--amber)',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                  <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    R1 · PICKED
                  </span>
                </div>

                {/* Bar 2: R1 RANDOM */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '55px' }}>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    15
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: '38px',
                      border: '1px dashed var(--border-subtle)',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                  <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    R1 · RANDOM
                  </span>
                </div>

                {/* Bar 3: R2 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '55px' }}>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    —
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: 'var(--border)',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                  <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    R2
                  </span>
                </div>
              </div>
            </div>

            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '1.2rem', lineHeight: 1.5 }}>
              If picked rows don't beat random, the strategy mix is changed before the next round.
            </div>
          </div>

          {/* Right: Round evaluation table + Stop rule */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              {/* Table Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1.2fr 1fr 1.8fr 1.2fr',
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.5rem',
                }}
                className="font-mono"
              >
                <span>ROUND</span>
                <span>CHECKED</span>
                <span>FIXED</span>
                <span>HOURS</span>
                <span>DATA</span>
                <span>MODEL</span>
                <span style={{ textAlign: 'right' }}>RECALL Δ</span>
              </div>

              {/* Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.75rem' }} className="font-mono">
                {/* R1 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1.2fr 1fr 1.8fr 1.2fr',
                    fontSize: '0.78rem',
                    color: 'var(--text-main)',
                    alignItems: 'center',
                    padding: '0.4rem 0',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>R1</span>
                  <span>240</span>
                  <span>96</span>
                  <span>8 h</span>
                  <span>v4</span>
                  <span style={{ color: 'var(--amber)' }}>{header.scored_by_model}</span>
                  <span style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>+6.0 %</span>
                </div>

                {/* R2 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1.2fr 1fr 1.8fr 1.2fr',
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    alignItems: 'center',
                    padding: '0.4rem 0',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>R2</span>
                  <span>{budgetRows}</span>
                  <span>—</span>
                  <span>≈ 10 h</span>
                  <span>{header.output_version}</span>
                  <span>—</span>
                  <span style={{ textAlign: 'right' }}>—</span>
                </div>
              </div>
            </div>

            {/* Stop rule block */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                STOP RULE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                <div>
                  <label className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                    STOP WHEN FIXES FALL UNDER
                  </label>
                  <input
                    type="text"
                    value={`${stopRuleFixes}% of checked rows`}
                    onChange={(e) => setStopRuleFixes(parseInt(e.target.value) || 10)}
                    className="font-mono"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.5rem',
                      color: 'var(--text-main)',
                      fontSize: '0.78rem',
                    }}
                  />
                </div>
                <div>
                  <label className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                    AND RECALL GAINS UNDER
                  </label>
                  <input
                    type="text"
                    value={`${stopRuleRecallGain} point`}
                    onChange={(e) => setStopRuleRecallGain(parseInt(e.target.value) || 1)}
                    className="font-mono"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.5rem',
                      color: 'var(--text-main)',
                      fontSize: '0.78rem',
                    }}
                  />
                </div>
              </div>
              <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Two rounds in a row. Then rounds only start on new data or a drift alert.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 5 · AUTOMATION */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.6rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
            5 · Automation
          </h2>
          <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            ROUNDS CAN START ON THEIR OWN; PROMOTION NEVER DOES
          </span>
        </div>

        {/* 6 Automation cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
          }}
        >
          {/* Card 1: Start when new CRM export arrives */}
          <div
            onClick={() => setAutomation((prev) => ({ ...prev, start_on_new_crm: !prev.start_on_new_crm }))}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '2px',
                  backgroundColor: automation.start_on_new_crm ? 'var(--amber)' : 'transparent',
                  border: `1px solid ${automation.start_on_new_crm ? 'var(--amber)' : 'var(--text-muted)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {automation.start_on_new_crm && <Check size={10} color="#000" strokeWidth={3} />}
              </div>
              <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Start when a new CRM export arrives
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>
              Monthly · uses the mix above
            </div>
          </div>

          {/* Card 2: Start when 08 Drift flags a column */}
          <div
            onClick={() => setAutomation((prev) => ({ ...prev, start_on_drift: !prev.start_on_drift }))}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '2px',
                  backgroundColor: automation.start_on_drift ? 'var(--amber)' : 'transparent',
                  border: `1px solid ${automation.start_on_drift ? 'var(--amber)' : 'var(--text-muted)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {automation.start_on_drift && <Check size={10} color="#000" strokeWidth={3} />}
              </div>
              <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Start when 08 Drift flags a column
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>
              Picks focus on the drifted segment
            </div>
          </div>

          {/* Card 3: Re-queue "not yet" rows */}
          <div
            onClick={() => setAutomation((prev) => ({ ...prev, requeue_not_yet: !prev.requeue_not_yet }))}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '2px',
                  backgroundColor: automation.requeue_not_yet ? 'var(--amber)' : 'transparent',
                  border: `1px solid ${automation.requeue_not_yet ? 'var(--amber)' : 'var(--text-muted)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {automation.requeue_not_yet && <Check size={10} color="#000" strokeWidth={3} />}
              </div>
              <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Re-queue "not yet" rows when they mature
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>
              After 60 days
            </div>
          </div>

          {/* Card 4: Retrain in 06 after each round */}
          <div
            onClick={() => setAutomation((prev) => ({ ...prev, retrain_after_round: !prev.retrain_after_round }))}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '2px',
                  backgroundColor: automation.retrain_after_round ? 'var(--amber)' : 'transparent',
                  border: `1px solid ${automation.retrain_after_round ? 'var(--amber)' : 'var(--text-muted)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {automation.retrain_after_round && <Check size={10} color="#000" strokeWidth={3} />}
              </div>
              <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Retrain in 06 after each round
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>
              Template {currentDataset?.name ? `${currentDataset.name}-search.yaml` : 'churn-search.yaml'}
            </div>
          </div>

          {/* Card 5: Notify reviewer */}
          <div
            onClick={() => setAutomation((prev) => ({ ...prev, notify_reviewer: !prev.notify_reviewer }))}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '2px',
                  backgroundColor: automation.notify_reviewer ? 'var(--amber)' : 'transparent',
                  border: `1px solid ${automation.notify_reviewer ? 'var(--amber)' : 'var(--text-muted)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {automation.notify_reviewer && <Check size={10} color="#000" strokeWidth={3} />}
              </div>
              <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Notify reviewer when picks are ready
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>
              Email
            </div>
          </div>

          {/* Card 6: Promote automatically (Not available) */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1.1rem',
              opacity: 0.6,
              cursor: 'not-allowed',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '2px',
                  border: '1px solid var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ width: '6px', height: '2px', backgroundColor: 'var(--text-muted)' }} />
              </div>
              <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Promote automatically
              </span>
            </div>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>
              Not available · always reviewed in 06
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 6 · GUARDRAILS */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '4rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.6rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
            Guardrails
          </h2>
          <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            CHECKED BEFORE A ROUND IS SENT
          </span>
        </div>

        {/* 2x4 Grid of Guardrails */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1.25rem',
          }}
        >
          {guardrails.map((g) => {
            const isWarning = g.status === 'warning';
            return (
              <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  {isWarning ? (
                    <AlertTriangle size={14} color="#f59e0b" strokeWidth={2.5} />
                  ) : (
                    <Check size={14} color="#22c55e" strokeWidth={2.5} />
                  )}
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '0.78rem',
                      color: isWarning ? '#f59e0b' : 'var(--text-main)',
                      fontWeight: 500,
                    }}
                  >
                    {g.title}
                  </span>
                </div>
                <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '1.35rem' }}>
                  {g.description}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* BOTTOM STICKY ACTION BAR */}
      {/* ========================================================================= */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '260px',
          right: 0,
          backgroundColor: '#0c0d0e',
          borderTop: '1px solid var(--border)',
          padding: '1.1rem 3rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 100,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.6)',
        }}
      >
        <div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
            Round 2 · {budgetRows} rows · 5 strategies · creates {header.output_version}
          </div>
          <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            Round log saved: model used, score of every row, why each row was picked
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            className="font-mono"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.65rem 1.1rem',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {isSavingDraft ? <RefreshCw size={13} className="spin" /> : <Save size={13} />}
            <span>Save draft</span>
          </button>

          <button
            type="button"
            onClick={handleSendToLabeling}
            disabled={isSubmitting}
            className="font-mono"
            style={{
              backgroundColor: 'var(--amber)',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '0.65rem 1.35rem',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
            }}
          >
            {isSubmitting ? (
              <RefreshCw size={14} className="spin" />
            ) : (
              <>
                <span>Send {budgetRows} rows to labeling</span>
                <ArrowRight size={14} strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
