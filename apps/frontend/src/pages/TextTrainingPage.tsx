import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, X } from 'lucide-react';
import { api } from '../services/api';
import { Dataset, TextTrainingDataResponse } from '../types';

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

export const TextTrainingPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<TextTrainingDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Selected Run
  const [runFilter, setRunFilter] = useState<'all' | 'running' | 'done'>('all');
  const [selectedRunId, setSelectedRunId] = useState<string>('ticket-cls-v4');

  // Interactive controls
  const [humanConfidenceThreshold, setHumanConfidenceThreshold] = useState<number>(0.70);
  const [checkedModels, setCheckedModels] = useState<Record<string, boolean>>({
    tfidf: true,
    xlmr: true,
    darija: false,
    llm: true,
    transformer: true,
  });
  const [errorFilter, setErrorFilter] = useState<string>('all');
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Load datasets on mount
  useEffect(() => {
    async function loadDatasets() {
      try {
        const list = await api.getDatasets();
        const textDatasets = list.filter(d => {
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

        const preferred = usableList.find(d => d.name.toLowerCase().includes('support_tickets')) || usableList[0];
        if (preferred) {
          setSelectedDatasetId(preferred.id);
        }
      } catch (err: any) {
        setError('Error loading datasets: ' + (err.message || 'unknown'));
      }
    }
    loadDatasets();
  }, []);

  // Fetch training data
  const fetchData = useCallback(async (datasetId: string, filter: string, runId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTextTrainingData(datasetId, filter, runId);
      setData(res);
      if (res.new_run_config?.models_to_try) {
        const initChecked: Record<string, boolean> = {};
        res.new_run_config.models_to_try.forEach(m => {
          initChecked[m.id] = m.checked;
        });
        setCheckedModels(initChecked);
      }
      if (res.evaluate?.selected_run) {
        setSelectedRunId(res.evaluate.selected_run);
      }
    } catch (err: any) {
      setError('Error loading training data: ' + (err.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      fetchData(selectedDatasetId, runFilter, selectedRunId || undefined);
    }
  }, [selectedDatasetId, runFilter, selectedRunId, fetchData]);

  // Handle compare-runs event from TopBar
  useEffect(() => {
    const handleCompare = () => setShowCompareModal(true);
    window.addEventListener('datalift:compare-runs', handleCompare);
    return () => window.removeEventListener('datalift:compare-runs', handleCompare);
  }, []);

  const handleStartRun = async () => {
    if (!selectedDatasetId || !data) return;
    try {
      const res = await api.startTextTrainingRun(selectedDatasetId, {
        dataset_version: data.new_run_config.dataset_version,
        models: Object.keys(checkedModels).filter(k => checkedModels[k]),
        fine_tuning: data.new_run_config.fine_tuning,
      });
      setNotification(res.message || 'New training run launched successfully!');
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification('Error starting run: ' + (err.message || 'unknown'));
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handlePromoteCandidate = async () => {
    if (!selectedDatasetId || !data) return;
    try {
      const res = await api.promoteTextCandidate(selectedDatasetId, {
        model_id: data.runs_section?.runs[1]?.id || 'ticket-cls-v4',
      });
      setNotification(res.message || 'Model promoted to production successfully!');
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification('Error promoting model: ' + (err.message || 'unknown'));
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const filteredRuns = useMemo(() => {
    if (!data?.runs_section?.runs) return [];
    if (runFilter === 'running') return data.runs_section.runs.filter(r => r.is_running);
    if (runFilter === 'done') return data.runs_section.runs.filter(r => !r.is_running);
    return data.runs_section.runs;
  }, [data, runFilter]);

  // Dynamic calculation for human routing slider
  const humanRoutingStats = useMemo(() => {
    const baseAuto = 78;
    const autoPct = Math.min(95, Math.max(50, Math.round(baseAuto - (humanConfidenceThreshold - 0.70) * 80)));
    const accPct = Math.min(99.4, Math.max(91.0, +(96.2 + (humanConfidenceThreshold - 0.70) * 12).toFixed(1)));
    return {
      auto: `${autoPct}%`,
      accuracy: `${accPct}%`,
    };
  }, [humanConfidenceThreshold]);

  // Dynamic filter for errors to look at
  const filteredErrors = useMemo(() => {
    if (!data?.evaluate?.errors_to_look_at) return [];
    if (errorFilter === 'billing_refund') {
      return data.evaluate.errors_to_look_at.filter(
        e => e.label_pred.toLowerCase().includes('refund') || e.label_pred.toLowerCase().includes('billing')
      );
    }
    if (errorFilter === 'darija') {
      return data.evaluate.errors_to_look_at.filter(e => e.language?.toUpperCase() === 'DARIJA');
    }
    return data.evaluate.errors_to_look_at;
  }, [data, errorFilter]);

  if (loading && !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: C.textMuted, fontFamily: 'monospace' }}>
        Loading text training workspace...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: C.red, fontFamily: 'monospace' }}>
        {error || 'No training data available'}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: C.bg,
        color: C.text,
        minHeight: '100vh',
        padding: '1.5rem 2rem 5rem 2rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* ── Top Bar: Dataset Selector & Actions ────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.75rem',
          paddingBottom: '1rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            JEU DE DONNÉES :
          </span>
          <select
            value={selectedDatasetId}
            onChange={e => {
              setSelectedDatasetId(e.target.value);
              setSelectedRunId('');
            }}
            style={{
              backgroundColor: C.card,
              color: C.text,
              border: `1px solid ${C.borderLight}`,
              borderRadius: '4px',
              padding: '0.35rem 0.85rem',
              fontSize: '0.82rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {datasets.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setShowCompareModal(true)}
            style={{
              backgroundColor: 'transparent',
              color: C.text,
              border: `1px solid ${C.borderLight}`,
              padding: '0.42rem 0.95rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Compare runs
          </button>
          <button
            type="button"
            onClick={() => navigate('/active-learning')}
            style={{
              backgroundColor: C.amber,
              color: '#000',
              border: 'none',
              padding: '0.42rem 1.1rem',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>Continue to active learning →</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '4.5rem',
            right: '2rem',
            zIndex: 9999,
            backgroundColor: '#1f2937',
            border: `1px solid ${C.amber}`,
            color: '#fff',
            padding: '0.65rem 1.25rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontFamily: 'monospace',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <Check size={16} color={C.amber} />
          <span>{notification}</span>
        </div>
      )}

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: '0.68rem',
          color: C.textMuted,
          fontFamily: 'monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: '0.4rem',
        }}
      >
        {data.breadcrumb}
      </div>

      {/* ── Header: Title & 4 KPIs & Right Badge ──────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '2rem',
          alignItems: 'flex-start',
          marginBottom: '2.5rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: 400,
              fontStyle: 'italic',
              fontFamily: '"Playfair Display", Georgia, serif',
              letterSpacing: '-0.02em',
              margin: '0 0 1.25rem 0',
              color: '#ffffff',
            }}
          >
            {data.display_title || data.dataset_name}
          </h1>

          {/* 4 KPIs row */}
          <div style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.2rem' }}>
                RUNS
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>{data.kpis.runs}</div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.runs_sub}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.2rem' }}>
                DATA
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>{data.kpis.data_version}</div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.data_sub}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.2rem' }}>
                COMPUTE
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>{data.kpis.compute}</div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.compute_sub}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.2rem' }}>
                IN PRODUCTION
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>{data.kpis.in_production}</div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.in_production_sub}</div>
            </div>
          </div>
        </div>

        {/* Big Candidate Badge (Right) */}
        <div style={{ textAlign: 'right', minWidth: '150px' }}>
          <div style={{ marginBottom: '0.25rem' }}>
            <span
              style={{
                fontSize: '0.62rem',
                border: `1px solid ${C.amber}`,
                color: C.amber,
                padding: '1px 6px',
                borderRadius: '3px',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
                fontWeight: 600,
              }}
            >
              CANDIDATE
            </span>
          </div>
          <div
            style={{
              fontSize: '4.5rem',
              fontWeight: 400,
              fontStyle: 'italic',
              color: C.amber,
              fontFamily: '"Playfair Display", Georgia, serif',
              lineHeight: 1,
            }}
          >
            {data.candidate_version}
          </div>
          <div
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              color: C.textMuted,
              letterSpacing: '0.12em',
              marginTop: '0.2rem',
            }}
          >
            {data.candidate_badge}
          </div>
        </div>
      </div>

      {/* ── Section 1: 1·New run ─────────────────────────────────────────── */}
      <div style={{ marginBottom: '3rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.6rem',
            marginBottom: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              fontStyle: 'italic',
              fontFamily: '"Playfair Display", Georgia, serif',
              margin: 0,
              color: '#ffffff',
            }}
          >
            1·New run
          </h2>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            EVERYTHING HERE IS SAVED WITH THE RUN
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1.2fr 1fr',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* Col 1: DATA */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
              DATA
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.68rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>
                DATASET VERSION
              </label>
              <select
                defaultValue={data.new_run_config.dataset_version}
                style={{
                  width: '100%',
                  backgroundColor: C.cardElevated,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  color: C.text,
                  padding: '0.45rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                }}
              >
                <option value={data.new_run_config.dataset_version}>{data.new_run_config.dataset_version}</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.68rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>
                TRAIN VIEW
              </label>
              <select
                defaultValue={data.new_run_config.train_view}
                style={{
                  width: '100%',
                  backgroundColor: C.cardElevated,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  color: C.text,
                  padding: '0.45rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                }}
              >
                <option value={data.new_run_config.train_view}>{data.new_run_config.train_view}</option>
              </select>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, marginTop: '0.25rem', lineHeight: '1.3' }}>
                {data.new_run_config.train_view_detail}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.68rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>
                LANGUAGES
              </label>
              <select
                defaultValue={data.new_run_config.languages}
                style={{
                  width: '100%',
                  backgroundColor: C.cardElevated,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  color: C.text,
                  padding: '0.45rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                }}
              >
                <option value={data.new_run_config.languages}>{data.new_run_config.languages}</option>
              </select>
            </div>

            {/* Models to try checkboxes */}
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                MODELS TO TRY
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {data.new_run_config.models_to_try.map(m => {
                  const isChecked = checkedModels[m.id] ?? m.checked;
                  return (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                        color: isChecked ? '#fff' : C.textMuted,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => setCheckedModels(prev => ({ ...prev, [m.id]: !isChecked }))}
                        style={{ accentColor: C.amber }}
                      />
                      <span>{m.name}</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, marginTop: '0.6rem', lineHeight: '1.3' }}>
                The LLM reference sees masked text only and never becomes the production model.
              </div>
            </div>
          </div>

          {/* Col 2: TASK AND METRIC & FINE-TUNING */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
              TASK AND METRIC
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.68rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>
                TASK
              </label>
              <select
                defaultValue={data.new_run_config.task}
                style={{
                  width: '100%',
                  backgroundColor: C.cardElevated,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  color: C.text,
                  padding: '0.45rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                }}
              >
                <option value={data.new_run_config.task}>{data.new_run_config.task}</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.68rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>
                OPTIMIZE
              </label>
              <select
                defaultValue={data.new_run_config.optimize}
                style={{
                  width: '100%',
                  backgroundColor: C.cardElevated,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  color: C.text,
                  padding: '0.45rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                }}
              >
                <option value={data.new_run_config.optimize}>{data.new_run_config.optimize}</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.68rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>
                RARE LABELS
              </label>
              <select
                defaultValue={data.new_run_config.rare_labels}
                style={{
                  width: '100%',
                  backgroundColor: C.cardElevated,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  color: C.text,
                  padding: '0.45rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                }}
              >
                <option value={data.new_run_config.rare_labels}>{data.new_run_config.rare_labels}</option>
              </select>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, marginTop: '0.25rem' }}>
                {data.new_run_config.rare_labels_detail}
              </div>
            </div>

            {/* Fine-Tuning Grid */}
            <div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                FINE-TUNING
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', color: C.textMuted, display: 'block' }}>MAX LENGTH</label>
                  <div style={{ backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, padding: '0.35rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {data.new_run_config.fine_tuning.max_length}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: C.textMuted, display: 'block' }}>LEARNING RATE</label>
                  <div style={{ backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, padding: '0.35rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {data.new_run_config.fine_tuning.learning_rate}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: C.textMuted, display: 'block' }}>EPOCHS</label>
                  <div style={{ backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, padding: '0.35rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {data.new_run_config.fine_tuning.epochs}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: C.textMuted, display: 'block' }}>BATCH</label>
                  <div style={{ backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, padding: '0.35rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {data.new_run_config.fine_tuning.batch}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, lineHeight: '1.3' }}>
                {data.new_run_config.fine_tuning.detail}
              </div>
            </div>
          </div>

          {/* Col 3: Checks before start */}
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
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', marginBottom: '0.85rem' }}>
                Checks before start
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
                {data.new_run_config.checks_before_start.map((chk, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <span style={{ marginTop: '2px' }}>
                      {chk.is_warning ? (
                        <AlertTriangle size={14} color={C.amber} />
                      ) : (
                        <Check size={14} color={C.green} />
                      )}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: chk.is_warning ? C.amber : '#e2e8f0', fontWeight: 500 }}>
                        {chk.title}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{chk.subtitle}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Command box */}
              <div
                style={{
                  backgroundColor: '#000',
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  color: '#cbd5e1',
                  marginBottom: '1rem',
                  overflowX: 'auto',
                }}
              >
                {data.new_run_config.command}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleStartRun}
                  style={{
                    flex: 1,
                    backgroundColor: C.amber,
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.5rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Start run
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotification('Template configuration saved.');
                    setTimeout(() => setNotification(null), 3000);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    borderRadius: '4px',
                    padding: '0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Save as template
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNotification('Scheduled automated recurring run.');
                  setTimeout(() => setNotification(null), 3000);
                }}
                style={{
                  width: '100%',
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.textMuted,
                  borderRadius: '4px',
                  padding: '0.35rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Schedule...
              </button>
            </div>
          </div>
        </div>

        {/* Compute & Reproducibility Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3rem',
            padding: '0.65rem 1rem',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: `1px solid ${C.border}`,
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontFamily: 'monospace',
          }}
        >
          <span style={{ color: C.textMuted, fontSize: '0.65rem' }}>COMPUTE AND REPRODUCIBILITY</span>
          <div>
            <span style={{ color: C.textMuted }}>WORKER: </span>
            <span style={{ color: '#fff' }}>{data.new_run_config.compute_reproducibility.worker}</span>
          </div>
          <div>
            <span style={{ color: C.textMuted }}>PRECISION: </span>
            <span style={{ color: '#fff' }}>{data.new_run_config.compute_reproducibility.precision}</span>
          </div>
          <div>
            <span style={{ color: C.textMuted }}>CODE: </span>
            <span style={{ color: '#fff' }}>{data.new_run_config.compute_reproducibility.code}</span>
          </div>
          <div>
            <span style={{ color: C.textMuted }}>ESTIMATE: </span>
            <span style={{ color: C.amber }}>{data.new_run_config.compute_reproducibility.estimate}</span>
          </div>
        </div>
      </div>

      {/* ── Section 2: 2·Runs ────────────────────────────────────────────── */}
      <div style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.6rem',
            marginBottom: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              fontStyle: 'italic',
              fontFamily: '"Playfair Display", Georgia, serif',
              margin: 0,
              color: '#ffffff',
            }}
          >
            2·Runs
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Filter pills */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={() => setRunFilter('all')}
                style={{
                  backgroundColor: runFilter === 'all' ? C.amberBg : 'transparent',
                  border: runFilter === 'all' ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                  color: runFilter === 'all' ? C.amber : C.textMuted,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                All · {data.runs_section?.counts?.all ?? 5}
              </button>
              <button
                type="button"
                onClick={() => setRunFilter('running')}
                style={{
                  backgroundColor: runFilter === 'running' ? C.amberBg : 'transparent',
                  border: runFilter === 'running' ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                  color: runFilter === 'running' ? C.amber : C.textMuted,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Running · {data.runs_section?.counts?.running ?? 1}
              </button>
              <button
                type="button"
                onClick={() => setRunFilter('done')}
                style={{
                  backgroundColor: runFilter === 'done' ? C.amberBg : 'transparent',
                  border: runFilter === 'done' ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                  color: runFilter === 'done' ? C.amber : C.textMuted,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Done · {data.runs_section?.counts?.done ?? 4}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${C.borderLight}`,
                color: C.text,
                borderRadius: '4px',
                padding: '0.25rem 0.75rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Compare 2 selected
            </button>
          </div>
        </div>

        {/* 2-Column: Left Table, Right Active Live Card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1.1fr',
            gap: '1.25rem',
            alignItems: 'start',
          }}
        >
          {/* Left Table */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1rem',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>RUN</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>DATA</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>MODEL</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>STATUS</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>MACRO F1 VAL</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>TIME</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>TAG</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map(r => {
                  const isSelected = selectedRunId === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRunId(r.id)}
                      style={{
                        borderBottom: `1px solid rgba(255, 255, 255, 0.05)`,
                        backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.78rem', fontFamily: 'monospace', color: '#fff', fontWeight: 500 }}>
                        {r.id}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted }}>
                        {r.data}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.78rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                        {r.model}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {r.is_running ? (
                          <span style={{ color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3b82f6', display: 'inline-block' }} />
                            {r.status}
                          </span>
                        ) : (
                          <span style={{ color: C.textMuted }}>{r.status}</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontSize: '0.78rem', fontFamily: 'monospace', color: '#fff' }}>
                        {r.macro_f1}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted }}>
                        {r.time}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        {r.tag === 'LIVE' ? (
                          <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid #3b82f6', fontSize: '0.62rem', padding: '1px 6px', borderRadius: '3px', fontFamily: 'monospace', fontWeight: 600 }}>
                            LIVE
                          </span>
                        ) : r.tag === 'CANDIDATE' ? (
                          <span style={{ border: `1px solid ${C.amber}`, color: C.amber, fontSize: '0.62rem', padding: '1px 6px', borderRadius: '3px', fontFamily: 'monospace', fontWeight: 600 }}>
                            CANDIDATE
                          </span>
                        ) : r.tag === 'PRODUCTION' ? (
                          <span style={{ backgroundColor: C.amber, color: '#000', fontSize: '0.62rem', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace', fontWeight: 600 }}>
                            PRODUCTION
                          </span>
                        ) : (
                          <span style={{ border: `1px solid ${C.borderLight}`, color: C.textMuted, fontSize: '0.62rem', padding: '1px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>
                            {r.tag}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ fontSize: '0.68rem', color: C.textMuted, marginTop: '0.75rem' }}>
              The LLM reference has a cost per call, shown on the run. It is a yardstick, not a candidate.
            </div>
          </div>

          {/* Right Live Card */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 600, color: '#fff' }}>
                {data.runs_section?.active_run?.id || 'ticket-cls-v4-b'}
              </span>
              <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid #3b82f6', fontSize: '0.62rem', padding: '1px 6px', borderRadius: '3px', fontFamily: 'monospace', fontWeight: 600 }}>
                {data.runs_section?.active_run?.status_badge || 'RUNNING'}
              </span>
            </div>

            <div style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace', marginBottom: '1rem' }}>
              {data.runs_section?.active_run?.epoch_status || 'Epoch 2 / 4 · step 1,840 / 5,410 · GPU 92% · ETA 21 min'}
            </div>

            {/* SVG Loss Curve */}
            <div style={{ backgroundColor: '#000', borderRadius: '4px', border: `1px solid ${C.borderLight}`, padding: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: C.textMuted, fontFamily: 'monospace', marginBottom: '0.35rem' }}>
                <span>LOSS</span>
                <span>EPOCH 1</span>
              </div>

              <svg viewBox="0 0 300 90" style={{ width: '100%', height: '90px', overflow: 'visible' }}>
                {/* Horizontal reference grid */}
                <line x1="0" y1="20" x2="300" y2="20" stroke="#1f242d" strokeDasharray="3 3" />
                <line x1="0" y1="50" x2="300" y2="50" stroke="#1f242d" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="300" y2="80" stroke="#1f242d" />

                {/* Train loss curve (cyan/blue) */}
                <path
                  d="M 10 20 Q 90 60 180 72 T 280 80"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
                <circle cx="280" cy="80" r="3" fill="#38bdf8" />

                {/* Val loss curve (indigo/blue) */}
                <path
                  d="M 10 30 Q 90 70 180 78 T 280 76"
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="2"
                />
                <circle cx="280" cy="76" r="3" fill="#818cf8" />
              </svg>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', fontFamily: 'monospace', marginTop: '0.5rem', color: C.textMuted }}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <span style={{ color: '#38bdf8' }}>— train loss</span>
                  <span style={{ color: '#818cf8' }}>— val loss</span>
                </div>
                <span>val macro F1 per epoch: {data.runs_section?.active_run?.loss_curve?.val_f1 || '0.88'}</span>
              </div>
            </div>

            {/* Mini Log Console */}
            <div
              style={{
                backgroundColor: '#050506',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.6rem 0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                color: '#94a3b8',
                marginBottom: '1rem',
                lineHeight: '1.4',
              }}
            >
              {(data.runs_section?.active_run?.logs || [
                '15:02 epoch 1 done · checkpoint saved',
                '15:03 val: 8,410 tickets · 1 min 10',
                '15:04 epoch 2 started · lr 1.6e-5',
              ]).map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>

            {/* Live Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setNotification('Run stopping signal sent.');
                  setTimeout(() => setNotification(null), 3000);
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.red,
                  borderRadius: '4px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotification('Showing full container logs.');
                  setTimeout(() => setNotification(null), 3000);
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  borderRadius: '4px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Open logs
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotification('Notification alert set for completion.');
                  setTimeout(() => setNotification(null), 3000);
                }}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.textMuted,
                  borderRadius: '4px',
                  padding: '0.35rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Notify me when done
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: 3·Evaluate ────────────────────────────────────────── */}
      <div style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.6rem',
            marginBottom: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              fontStyle: 'italic',
              fontFamily: '"Playfair Display", Georgia, serif',
              margin: 0,
              color: '#ffffff',
            }}
          >
            3·Evaluate
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              <span style={{ color: C.textMuted }}>RUN</span>
              <select
                value={selectedRunId}
                onChange={e => setSelectedRunId(e.target.value)}
                style={{
                  backgroundColor: C.card,
                  color: C.text,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              >
                {data.runs_section?.runs.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.id}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              <span style={{ color: C.textMuted }}>SPLIT</span>
              <select
                defaultValue={data.evaluate.selected_split}
                style={{
                  backgroundColor: C.card,
                  color: C.text,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              >
                <option value={data.evaluate.selected_split}>{data.evaluate.selected_split}</option>
              </select>
            </div>
          </div>
        </div>

        {/* 5 KPI Summary Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '1rem',
            marginBottom: '1.75rem',
          }}
        >
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              MACRO F1
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: C.amber, fontFamily: '"Playfair Display", Georgia, serif' }}>
              {data.evaluate.summary_kpis.macro_f1}
            </div>
            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{data.evaluate.summary_kpis.macro_f1_sub}</div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              ACCURACY
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: '#fff', fontFamily: '"Playfair Display", Georgia, serif' }}>
              {data.evaluate.summary_kpis.accuracy}
            </div>
            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{data.evaluate.summary_kpis.accuracy_sub}</div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              WORST LABEL
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', fontFamily: '"Playfair Display", Georgia, serif' }}>
              {data.evaluate.summary_kpis.worst_label}
            </div>
            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{data.evaluate.summary_kpis.worst_label_sub}</div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              WORST LANGUAGE
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', fontFamily: '"Playfair Display", Georgia, serif' }}>
              {data.evaluate.summary_kpis.worst_language}
            </div>
            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{data.evaluate.summary_kpis.worst_language_sub}</div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              TEST SET
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#94a3b8', fontFamily: '"Playfair Display", Georgia, serif' }}>
              {data.evaluate.summary_kpis.test_set}
            </div>
            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{data.evaluate.summary_kpis.test_set_sub}</div>
          </div>
        </div>

        {/* 2x2 Grid: Per Label & Confusion Matrix (Top), Per Language & Human Routing (Bottom) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
          {/* Top Left: Per Label */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', fontStyle: 'italic', fontFamily: '"Playfair Display", Georgia, serif' }}>
                Per label
              </span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>VAL</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>LABEL</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>TICKETS</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>PRECISION</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>RECALL</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>F1</th>
                </tr>
              </thead>
              <tbody>
                {data.evaluate.per_label.map(pl => (
                  <tr key={pl.label} style={{ borderBottom: `1px solid rgba(255, 255, 255, 0.04)` }}>
                    <td style={{ padding: '0.5rem 0', fontSize: '0.78rem', fontFamily: 'monospace', color: '#fff' }}>{pl.label}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted }}>{pl.tickets}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{pl.precision}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{pl.recall}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontSize: '0.78rem', fontFamily: 'monospace', color: C.amber, fontWeight: 600 }}>{pl.f1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Right: Confusion Matrix */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', fontStyle: 'italic', fontFamily: '"Playfair Display", Georgia, serif' }}>
                Confusion matrix
              </span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>ROWS TRUE · COLUMNS PREDICTED</span>
            </div>

            {/* Matrix Heatmap */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '1rem' }}>
              {/* Header column labels */}
              <div style={{ display: 'grid', gridTemplateColumns: `45px repeat(${data.evaluate.confusion_matrix.labels.length}, 1fr)`, gap: '3px', textAlign: 'center', fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted }}>
                <span />
                {data.evaluate.confusion_matrix.labels.map(lbl => (
                  <span key={lbl}>{lbl}</span>
                ))}
              </div>

              {/* Rows */}
              {data.evaluate.confusion_matrix.matrix.map((row, rIdx) => {
                const rowLabel = data.evaluate.confusion_matrix.labels[rIdx] || `C${rIdx}`;
                return (
                  <div
                    key={rIdx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `45px repeat(${row.length}, 1fr)`,
                      gap: '3px',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rowLabel}
                    </span>
                    {row.map((val, cIdx) => {
                      const isDiag = rIdx === cIdx;
                      let bg = '#16181d';
                      if (isDiag) {
                        bg = val >= 90 ? '#f59e0b' : val >= 80 ? '#d97706' : '#b45309';
                      } else if (val > 5) {
                        bg = 'rgba(180, 83, 9, 0.4)';
                      } else if (val > 1) {
                        bg = 'rgba(255, 255, 255, 0.05)';
                      }
                      return (
                        <div
                          key={cIdx}
                          style={{
                            backgroundColor: bg,
                            color: isDiag ? (val >= 90 ? '#000' : '#fff') : '#94a3b8',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            borderRadius: '2px',
                            fontWeight: isDiag ? 600 : 400,
                          }}
                        >
                          {val}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              {data.evaluate.confusion_matrix.buttons.map(b => (
                <button
                  key={b.filter}
                  type="button"
                  onClick={() => {
                    setNotification(`Filtered view for: ${b.label}`);
                    setTimeout(() => setNotification(null), 3000);
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    borderRadius: '4px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
              Shading is illustrative. Each cell opens its tickets with the words the model relied on.
            </div>
          </div>

          {/* Bottom Left: Per Language */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', fontStyle: 'italic', fontFamily: '"Playfair Display", Georgia, serif' }}>
                Per language
              </span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>NO LANGUAGE MAY REGRESS</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>LANGUAGE</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>TICKETS</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>MACRO F1</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>VS V3</th>
                </tr>
              </thead>
              <tbody>
                {data.evaluate.per_language.map(pl => (
                  <tr key={pl.language} style={{ borderBottom: `1px solid rgba(255, 255, 255, 0.04)` }}>
                    <td style={{ padding: '0.5rem 0', fontSize: '0.78rem', fontFamily: 'monospace', color: '#fff' }}>{pl.language}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted }}>{pl.tickets}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontSize: '0.78rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{pl.macro_f1}</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.green }}>{pl.vs_v3}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
              Also sliced by channel (email, chat, form), by length and by real vs chunked tickets.
            </div>
          </div>

          {/* Bottom Right: Send to a human when unsure */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', fontStyle: 'italic', fontFamily: '"Playfair Display", Georgia, serif' }}>
                Send to a human when unsure
              </span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>USED BY 09 EXPORT</span>
            </div>

            {/* Threshold Curve SVG */}
            <div style={{ backgroundColor: '#000', borderRadius: '4px', border: `1px solid ${C.borderLight}`, padding: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.amber, marginBottom: '0.25rem' }}>
                ACCURACY
              </div>
              <svg viewBox="0 0 300 80" style={{ width: '100%', height: '80px', overflow: 'visible' }}>
                <path d="M 10 20 Q 150 25 290 75" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
                <line x1={`${10 + humanConfidenceThreshold * 280}`} y1="0" x2={`${10 + humanConfidenceThreshold * 280}`} y2="80" stroke="#38bdf8" strokeDasharray="3 3" strokeWidth="1.5" />
                <text x={`${15 + humanConfidenceThreshold * 280}`} y="15" fill="#38bdf8" fontSize="10" fontFamily="monospace">
                  {humanConfidenceThreshold.toFixed(2)}
                </text>
              </svg>
              <div style={{ textAlign: 'right', fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted }}>
                SHARE HANDLED AUTOMATICALLY →
              </div>
            </div>

            {/* Slider */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                <span>BELOW THIS CONFIDENCE, ROUTE TO A HUMAN</span>
                <span style={{ color: C.amber, fontWeight: 600 }}>{humanConfidenceThreshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.50"
                max="0.95"
                step="0.05"
                value={humanConfidenceThreshold}
                onChange={e => setHumanConfidenceThreshold(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: C.amber }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'monospace', borderTop: `1px solid ${C.border}`, paddingTop: '0.5rem' }}>
              <span style={{ color: C.textMuted }}>HANDLED AUTOMATICALLY: <strong style={{ color: '#fff' }}>{humanRoutingStats.auto}</strong></span>
              <span style={{ color: C.textMuted }}>ACCURACY ON THOSE: <strong style={{ color: C.green }}>{humanRoutingStats.accuracy}</strong></span>
            </div>
          </div>
        </div>

        {/* Errors to look at table */}
        <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontStyle: 'italic', fontFamily: '"Playfair Display", Georgia, serif', color: '#fff' }}>
              Errors to look at
            </h3>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setErrorFilter('all')}
                style={{
                  backgroundColor: errorFilter === 'all' ? C.amberBg : 'transparent',
                  border: errorFilter === 'all' ? `1px solid ${C.amber}` : `1px solid ${C.borderLight}`,
                  color: errorFilter === 'all' ? C.amber : C.textMuted,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Most confident mistakes
              </button>
              <button
                type="button"
                onClick={() => setErrorFilter('billing_refund')}
                style={{
                  backgroundColor: errorFilter === 'billing_refund' ? C.amberBg : 'transparent',
                  border: errorFilter === 'billing_refund' ? `1px solid ${C.amber}` : `1px solid ${C.borderLight}`,
                  color: errorFilter === 'billing_refund' ? C.amber : C.textMuted,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                billing ↔ refund
              </button>
              <button
                type="button"
                onClick={() => setErrorFilter('darija')}
                style={{
                  backgroundColor: errorFilter === 'darija' ? C.amberBg : 'transparent',
                  border: errorFilter === 'darija' ? `1px solid ${C.amber}` : `1px solid ${C.borderLight}`,
                  color: errorFilter === 'darija' ? C.amber : C.textMuted,
                  borderRadius: '4px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                darija only
              </button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>TICKET</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 1rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>TEXT · BLUE = WORDS THE MODEL USED</th>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>LABEL → PREDICTED</th>
                <th style={{ textAlign: 'right', padding: '0.4rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filteredErrors.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: C.textMuted, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    No error samples matching this filter.
                  </td>
                </tr>
              ) : (
                filteredErrors.map((err, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid rgba(255, 255, 255, 0.04)` }}>
                  <td style={{ padding: '0.75rem 0', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#fff' }}>{err.ticket_id}</div>
                    <span style={{ backgroundColor: C.blueBg, color: '#93c5fd', fontSize: '0.6rem', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>
                      {err.language}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', fontFamily: '"Playfair Display", Georgia, serif', color: '#f8fafc' }}>
                    {err.tokens.map((tok, tIdx) => (
                      tok.highlight ? (
                        <mark key={tIdx} style={{ backgroundColor: 'rgba(59, 130, 246, 0.18)', borderBottom: '2px solid #3b82f6', color: '#93c5fd', padding: '1px 3px', borderRadius: '2px' }}>
                          {tok.text}
                        </mark>
                      ) : (
                        <span key={tIdx}>{tok.text}</span>
                      )
                    ))}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                    {err.label_pred}
                  </td>
                  <td style={{ padding: '0.75rem 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                      {err.actions.map(act => (
                        <button
                          key={act}
                          type="button"
                          onClick={() => {
                            if (act.includes('05')) {
                              navigate('/labeling');
                            } else {
                              setNotification(`Action '${act}' recorded.`);
                              setTimeout(() => setNotification(null), 3000);
                            }
                          }}
                          style={{
                            backgroundColor: 'transparent',
                            border: `1px solid ${C.borderLight}`,
                            color: C.text,
                            borderRadius: '4px',
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                          }}
                        >
                          {act}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>

          <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
            "Clarify definition" opens the label definitions used in 05, so annotators and the model learn the same rule.
          </div>
        </div>
      </div>

      {/* ── Section 4: 4·Compare and promote ─────────────────────────────── */}
      <div style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.6rem',
            marginBottom: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              fontStyle: 'italic',
              fontFamily: '"Playfair Display", Georgia, serif',
              margin: 0,
              color: '#ffffff',
            }}
          >
            4·Compare and promote
          </h2>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            SAME LOCKED TEST SET OR NO COMPARISON
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.25rem', alignItems: 'start' }}>
          {/* Comparison Table */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>
                    ON TEST · 8,407 TICKETS
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>
                    TICKET-CLS-V3 · PROD
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem', fontSize: '0.65rem', color: C.amber, fontFamily: 'monospace' }}>
                    TICKET-CLS-V4 · CAND.
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>
                    CHANGE
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.compare_and_promote.comparison_table.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid rgba(255, 255, 255, 0.04)` }}>
                    <td style={{ padding: '0.65rem 0', fontSize: '0.78rem', color: '#fff', fontFamily: 'monospace' }}>{row.metric}</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted }}>{row.prod_val}</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontSize: '0.78rem', fontFamily: 'monospace', color: '#fff', fontWeight: 600 }}>{row.cand_val}</td>
                    <td style={{ padding: '0.65rem 0', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: row.change.includes('+') || row.change.includes('✓') ? C.green : C.amber }}>
                      {row.change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right Checklist: Before Production */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontStyle: 'italic', fontFamily: '"Playfair Display", Georgia, serif', color: '#fff' }}>
              Before production
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
              {data.compare_and_promote.before_production.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.76rem', color: item.checked ? '#e2e8f0' : C.textMuted }}>
                  <span>{item.checked ? <Check size={14} color={C.green} /> : <span style={{ width: 14, display: 'inline-block', textAlign: 'center' }}>○</span>}</span>
                  <span>{item.title}</span>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: '#000', border: `1px solid ${C.borderLight}`, borderRadius: '4px', padding: '0.5rem 0.75rem', fontSize: '0.72rem', fontFamily: 'monospace', color: '#cbd5e1', marginBottom: '0.75rem' }}>
              {data.compare_and_promote.replay_command}
            </div>

            <div style={{ fontSize: '0.68rem', color: C.textMuted, lineHeight: '1.3' }}>
              Formats: Hugging Face model · ONNX · Docker image for 09 Export. Tokenizer, label list and masking rules ship with the model.
            </div>
          </div>
        </div>
      </div>

      {/* ── Section Guardrails ───────────────────────────────────────────── */}
      <div style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.6rem',
            marginBottom: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 400,
              fontStyle: 'italic',
              fontFamily: '"Playfair Display", Georgia, serif',
              margin: 0,
              color: '#ffffff',
            }}
          >
            Guardrails
          </h2>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            CHECKED BEFORE EVERY RUN AND PROMOTION
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
          {data.guardrails.map((gr, idx) => {
            const isWarn = gr.is_warning;
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <span style={{ marginTop: '2px' }}>
                  {isWarn ? <AlertTriangle size={15} color={C.amber} /> : <Check size={16} color={C.green} />}
                </span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: isWarn ? C.amber : '#f1f5f9', marginBottom: '0.15rem' }}>
                    {gr.title}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{gr.subtitle}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Action Banner ─────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '1.25rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.2rem' }}>
            {data.action_banner.summary}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted }}>
            {data.action_banner.detail}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={handlePromoteCandidate}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: C.text,
              borderRadius: '4px',
              padding: '0.55rem 1.1rem',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {data.action_banner.secondary_action}
          </button>
          <button
            type="button"
            onClick={() => navigate('/active-learning')}
            style={{
              backgroundColor: C.amber,
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '0.55rem 1.35rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {data.action_banner.primary_action}
          </button>
        </div>
      </div>

      {/* ── Compare Runs Modal ───────────────────────────────────────────── */}
      {showCompareModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={() => setShowCompareModal(false)}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              width: '100%',
              maxWidth: '750px',
              padding: '1.75rem',
              position: 'relative',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontStyle: 'italic', fontFamily: '"Playfair Display", Georgia, serif', color: '#fff' }}>
                Compare Runs · {data.dataset_name}
              </h3>
              <button type="button" onClick={() => setShowCompareModal(false)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>RUN ID</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>MODEL</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>MACRO F1</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>TIME</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0', fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.runs_section?.runs.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid rgba(255, 255, 255, 0.04)` }}>
                    <td style={{ padding: '0.6rem 0', fontSize: '0.78rem', fontFamily: 'monospace', color: '#fff' }}>{r.id}</td>
                    <td style={{ padding: '0.6rem', fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{r.model}</td>
                    <td style={{ padding: '0.6rem', textAlign: 'right', fontSize: '0.78rem', fontFamily: 'monospace', color: C.amber, fontWeight: 600 }}>{r.macro_f1}</td>
                    <td style={{ padding: '0.6rem', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted }}>{r.time}</td>
                    <td style={{ padding: '0.6rem 0', textAlign: 'right', fontSize: '0.72rem', fontFamily: 'monospace', color: '#cbd5e1' }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.45rem 1rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextTrainingPage;
