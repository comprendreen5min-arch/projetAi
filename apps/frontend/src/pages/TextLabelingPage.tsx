import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, X } from 'lucide-react';
import { api } from '../services/api';
import { Dataset, TextLabelingDataResponse, TextLabelingCheck } from '../types';

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
  blueBorder: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
};

export const TextLabelingPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<TextLabelingDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Queue & pagination
  const [activeQueue, setActiveQueue] = useState<string>('unlabeled');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Filters
  const [taskFilter, setTaskFilter] = useState<string>('One label per ticket');
  const [preLabelFilter, setPreLabelFilter] = useState<string>('ticket-cls-v3 · show top 3');
  const [languageFilter, setLanguageFilter] = useState<string>('All · fr · ar · darija · en');
  const [doubleAnnotationFilter, setDoubleAnnotationFilter] = useState<string>('10% of tickets');

  // Modals & notifications
  const [showDefinitionsModal, setShowDefinitionsModal] = useState<boolean>(false);
  const [showFixModal, setShowFixModal] = useState<boolean>(false);
  const [activeFixCheck, setActiveFixCheck] = useState<TextLabelingCheck | null>(null);
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

  // Fetch labeling data whenever selected dataset, active queue, or index changes
  const fetchLabelingData = useCallback(async (datasetId: string, queue: string, index: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTextLabelingData(datasetId, queue, index);
      setData(res);
      // Pre-select the top suggested label if available
      if (res.workspace?.model_suggestions && res.workspace.model_suggestions.length > 0) {
        setSelectedLabel(res.workspace.model_suggestions[0].label);
      } else if (res.workspace?.labels && res.workspace.labels.length > 0) {
        setSelectedLabel(res.workspace.labels[0].name);
      }
    } catch (err: any) {
      setError('Error loading labeling data: ' + (err.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      fetchLabelingData(selectedDatasetId, activeQueue, currentIndex);
    }
  }, [selectedDatasetId, activeQueue, currentIndex, fetchLabelingData]);

  // Handle Label Decision submission
  const handleDecision = async (label: string, actionType: string = 'accept') => {
    if (!selectedDatasetId || !data) return;
    try {
      await api.submitTextLabelDecision(selectedDatasetId, {
        ticket_id: data.workspace.ticket_id,
        label,
        action: actionType,
      });

      setNotification(`Label "${label}" saved for ticket ${data.workspace.ticket_id}`);
      setTimeout(() => setNotification(null), 3000);

      // Advance to next ticket
      setCurrentIndex(prev => prev + 1);
    } catch (err: any) {
      setNotification(`Error saving label: ${err.message || 'unknown'}`);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is inside an input or select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (!data?.workspace?.labels) return;

      // 1 to 7 keys
      if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const hotkeyNum = parseInt(e.key, 10);
        const match = data.workspace.labels.find(o => o.id === hotkeyNum) || data.workspace.labels[hotkeyNum - 1];
        if (match) {
          setSelectedLabel(match.name);
        }
      } else if (e.key === 'a' || e.key === 'A') {
        // Accept top suggestion
        if (data.workspace.model_suggestions && data.workspace.model_suggestions.length > 0) {
          const top = data.workspace.model_suggestions[0];
          setSelectedLabel(top.label);
          handleDecision(top.label, 'accept_suggestion');
        }
      } else if (e.key === 'Enter') {
        if (selectedLabel) {
          handleDecision(selectedLabel, 'choose_label');
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          setCurrentIndex(prev => prev - 1);
        }
      } else if (e.key === 's' || e.key === 'S') {
        // Skip
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'u' || e.key === 'U') {
        // Unsure
        handleDecision('unsure', 'mark_unsure');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, selectedLabel, currentIndex, selectedDatasetId]);

  // Listen to custom event from App.tsx TopBar
  useEffect(() => {
    const handleDefinitions = () => setShowDefinitionsModal(true);
    window.addEventListener('datalift:label-definitions', handleDefinitions);
    return () => window.removeEventListener('datalift:label-definitions', handleDefinitions);
  }, []);

  const handleSaveV4 = async () => {
    if (!selectedDatasetId || !data) return;
    try {
      const res = await api.saveTextLabelV4(selectedDatasetId, {
        output_version: data.kpis.output || 'v4',
      });
      setNotification(res.message || `Saved as ${data.kpis.output} successfully!`);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification(`Error saving version: ${err.message || 'unknown'}`);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: C.textMuted, fontFamily: 'monospace' }}>
        Loading text labeling workspace...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: C.red, fontFamily: 'monospace' }}>
        {error || 'No labeling data available'}
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
      {/* ── Top Bar / Dataset Selector ────────────────────────────────────── */}
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
              setCurrentIndex(0);
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
            onClick={() => setShowDefinitionsModal(true)}
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
            Label definitions
          </button>
          <button
            type="button"
            onClick={() => navigate('/training')}
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
            <span>Continue to training →</span>
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

      {/* ── Breadcrumb & Subtitle ─────────────────────────────────────────── */}
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

      {/* ── Header: Title & 4 KPIs & Right Gauge ─────────────────────────── */}
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
              <div
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.2rem',
                }}
              >
                TO LABEL
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>
                {data.kpis.to_label}
              </div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.to_label_sub}</div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.2rem',
                }}
              >
                SUSPECTED ERRORS
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>
                {data.kpis.suspected_errors}
              </div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.suspected_errors_sub}</div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.2rem',
                }}
              >
                DONE TODAY
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>
                {data.kpis.done_today}
              </div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.done_today_sub}</div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.2rem',
                }}
              >
                OUTPUT
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#ffffff' }}>{data.kpis.output}</div>
              <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{data.kpis.output_sub}</div>
            </div>
          </div>
        </div>

        {/* Right Gauge */}
        <div style={{ textAlign: 'right', minWidth: '180px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <span
              style={{
                fontSize: '2.8rem',
                fontWeight: 300,
                color: '#64748b',
                fontFamily: '"Playfair Display", Georgia, serif',
              }}
            >
              {data.gauge.coverage_before}
            </span>
            <span style={{ fontSize: '1.8rem', color: '#475569' }}>→</span>
            <span
              style={{
                fontSize: '4.2rem',
                fontWeight: 400,
                color: C.amber,
                fontFamily: '"Playfair Display", Georgia, serif',
                lineHeight: 1,
              }}
            >
              {data.gauge.coverage_after}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1.5rem',
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.08em',
              marginTop: '0.25rem',
            }}
          >
            <span style={{ color: C.textMuted }}>BEFORE</span>
            <span style={{ color: C.amber }}>LABEL COVERAGE / 100</span>
          </div>
        </div>
      </div>

      {/* ── Section 1: Queues ────────────────────────────────────────────── */}
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
            1·Queues
          </h2>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            DATALIFT PICKS WHAT TO LABEL FIRST
          </span>
        </div>

        {/* 4 Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          {data.queues.map(q => {
            const isActive = activeQueue === q.id;
            return (
              <div
                key={q.id}
                onClick={() => {
                  setActiveQueue(q.id);
                  setCurrentIndex(0);
                }}
                style={{
                  backgroundColor: C.card,
                  border: isActive ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1.1rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'monospace',
                        letterSpacing: '0.08em',
                        color: isActive ? C.amber : C.textMuted,
                        fontWeight: 600,
                      }}
                    >
                      {q.title}
                    </span>
                    {isActive && (
                      <span
                        style={{
                          fontSize: '0.6rem',
                          fontFamily: 'monospace',
                          color: C.amber,
                          border: `1px solid ${C.amber}`,
                          padding: '1px 5px',
                          borderRadius: '3px',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '2rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.4rem' }}>
                    {q.count}
                  </div>

                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: C.textMuted,
                      lineHeight: '1.35',
                      marginBottom: '1.25rem',
                      minHeight: '2.5rem',
                    }}
                  >
                    {q.desc}
                  </div>
                </div>

                <div>
                  {/* Progress bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '3px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '2px',
                      overflow: 'hidden',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, q.progress_pct || 0))}%`,
                        height: '100%',
                        backgroundColor: C.amber,
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace' }}>
                      {q.footer_done}
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setActiveQueue(q.id);
                        setCurrentIndex(0);
                      }}
                      style={{
                        backgroundColor: isActive ? C.amber : '#1f2228',
                        color: isActive ? '#000' : C.text,
                        border: `1px solid ${isActive ? C.amber : C.borderLight}`,
                        borderRadius: '4px',
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                      }}
                    >
                      {q.btn_label}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4 Filters Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
          }}
        >
          {/* Filter 1: Task */}
          <div>
            <div
              style={{
                fontSize: '0.62rem',
                fontFamily: 'monospace',
                color: C.textMuted,
                letterSpacing: '0.08em',
                marginBottom: '0.3rem',
              }}
            >
              TASK
            </div>
            <select
              value={taskFilter}
              onChange={e => setTaskFilter(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                color: C.text,
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              <option value="One label per ticket">One label per ticket</option>
              <option value="Multi-label classification">Multi-label classification</option>
              <option value="Hierarchical classification">Hierarchical classification</option>
            </select>
          </div>

          {/* Filter 2: Pre-labeling */}
          <div>
            <div
              style={{
                fontSize: '0.62rem',
                fontFamily: 'monospace',
                color: C.textMuted,
                letterSpacing: '0.08em',
                marginBottom: '0.3rem',
              }}
            >
              PRE-LABELING
            </div>
            <select
              value={preLabelFilter}
              onChange={e => setPreLabelFilter(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                color: C.text,
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              <option value="ticket-cls-v3 · show top 3">ticket-cls-v3 · show top 3</option>
              <option value="ticket-cls-v2 · show top 1">ticket-cls-v2 · show top 1</option>
              <option value="None · raw annotation">None · raw annotation</option>
            </select>
          </div>

          {/* Filter 3: Language */}
          <div>
            <div
              style={{
                fontSize: '0.62rem',
                fontFamily: 'monospace',
                color: C.textMuted,
                letterSpacing: '0.08em',
                marginBottom: '0.3rem',
              }}
            >
              LANGUAGE
            </div>
            <select
              value={languageFilter}
              onChange={e => setLanguageFilter(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                color: C.text,
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              <option value="All · fr · ar · darija · en">All · fr · ar · darija · en</option>
              <option value="darija only">darija only</option>
              <option value="fr only">fr only</option>
              <option value="ar only">ar only</option>
              <option value="en only">en only</option>
            </select>
          </div>

          {/* Filter 4: Double Annotation */}
          <div>
            <div
              style={{
                fontSize: '0.62rem',
                fontFamily: 'monospace',
                color: C.textMuted,
                letterSpacing: '0.08em',
                marginBottom: '0.3rem',
              }}
            >
              DOUBLE ANNOTATION
            </div>
            <select
              value={doubleAnnotationFilter}
              onChange={e => setDoubleAnnotationFilter(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                color: C.text,
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              <option value="10% of tickets">10% of tickets</option>
              <option value="20% of tickets">20% of tickets</option>
              <option value="100% (gold standard)">100% (gold standard)</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Section 2: Workspace ─────────────────────────────────────────── */}
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
            2·Workspace
          </h2>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em' }}>
            {data.workspace.ticket_counter}
          </span>
        </div>

        {/* Workspace 2-Column Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr',
            gap: '1.25rem',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Ticket Card */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.5rem',
            }}
          >
            {/* Ticket metadata header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.72rem',
                color: C.textMuted,
                fontFamily: 'monospace',
                marginBottom: '1.25rem',
              }}
            >
              <span>{data.workspace.ticket_id}</span>
              <span
                style={{
                  backgroundColor: C.blueBg,
                  color: '#93c5fd',
                  border: `1px solid rgba(59, 130, 246, 0.3)`,
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                }}
              >
                {data.workspace.language.toUpperCase()}
              </span>
              <span>{data.workspace.meta}</span>
            </div>

            {/* Ticket text with salient token highlights */}
            <div
              style={{
                fontSize: '1.25rem',
                lineHeight: '1.6',
                color: '#f8fafc',
                fontFamily: '"Playfair Display", Georgia, serif',
                marginBottom: '1.5rem',
              }}
            >
              {data.workspace.tokens.map((tok, idx) => {
                if (tok.highlight) {
                  return (
                    <mark
                      key={idx}
                      style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        borderBottom: '2px solid #3b82f6',
                        color: '#93c5fd',
                        padding: '1px 4px',
                        borderRadius: '3px',
                      }}
                    >
                      {tok.text}
                    </mark>
                  );
                }
                return <span key={idx}>{tok.text}</span>;
              })}
            </div>

            {/* Meaning box */}
            {data.workspace.meaning_en && (
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${C.border}`,
                  borderRadius: '4px',
                  padding: '0.85rem 1rem',
                  marginBottom: '1.75rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    letterSpacing: '0.08em',
                    marginBottom: '0.35rem',
                  }}
                >
                  MEANING
                </div>
                <div style={{ fontSize: '0.82rem', color: '#cbd5e1', fontStyle: 'italic', marginBottom: '0.35rem' }}>
                  {data.workspace.meaning_en}
                </div>
                <div style={{ fontSize: '0.68rem', color: C.textMuted }}>
                  {data.workspace.meaning_sub ||
                    'Blue = words the model relied on. [PHONE] stays masked: annotators never see personal data.'}
                </div>
              </div>
            )}

            {/* Choose the label */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  fontSize: '0.62rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.6rem',
                }}
              >
                CHOOSE THE LABEL
              </div>

              {/* Labels Grid */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                {data.workspace.labels.map(opt => {
                  const isSelected = selectedLabel === opt.name;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedLabel(opt.name)}
                      style={{
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : C.cardElevated,
                        color: isSelected ? '#93c5fd' : C.text,
                        border: isSelected ? '1px solid #3b82f6' : `1px solid ${C.borderLight}`,
                        borderRadius: '4px',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.78rem',
                        fontFamily: 'monospace',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: 'rgba(0,0,0,0.4)',
                          border: `1px solid ${C.borderLight}`,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontSize: '0.7rem',
                          color: isSelected ? '#93c5fd' : C.textMuted,
                        }}
                      >
                        {opt.id}
                      </span>
                      <span>{opt.name}</span>
                      {opt.confidence !== undefined && opt.confidence > 0 && (
                        <span style={{ fontSize: '0.7rem', color: C.textMuted }}>{opt.confidence.toFixed(2)}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Auxiliary buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  marginBottom: '1.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleDecision('not_real_ticket', 'auxiliary')}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.textMuted,
                    borderRadius: '4px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Not a real ticket
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision('unreadable', 'auxiliary')}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.textMuted,
                    borderRadius: '4px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Unreadable / wrong language
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision('unsure', 'auxiliary')}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.textMuted,
                    borderRadius: '4px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Unsure <span style={{ color: '#fff', marginLeft: '2px' }}>U</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => prev + 1)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.textMuted,
                    borderRadius: '4px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Skip <span style={{ color: '#fff', marginLeft: '2px' }}>S</span>
                </button>
              </div>

              {/* Shortcuts hint bar */}
              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  fontSize: '0.7rem',
                  color: C.textMuted,
                  fontFamily: 'monospace',
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: '0.85rem',
                }}
              >
                <span>
                  <strong style={{ color: '#fff' }}>A</strong> accept suggestion
                </span>
                <span>
                  <strong style={{ color: '#fff' }}>1-7</strong> choose label
                </span>
                <span>
                  <strong style={{ color: '#fff' }}>Enter</strong> save & next
                </span>
                <span>
                  <strong style={{ color: '#fff' }}>←</strong> previous ticket
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Workspace Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Box 1: Model Suggestion */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.1rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.62rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.75rem',
                }}
              >
                MODEL SUGGESTION
              </div>

              {data.workspace.model_suggestions.map((sug, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.4rem',
                    fontSize: '0.82rem',
                    fontFamily: 'monospace',
                  }}
                >
                  <span style={{ color: idx === 0 ? '#93c5fd' : C.text }}>{sug.label}</span>
                  <span style={{ color: idx === 0 ? '#93c5fd' : C.textMuted }}>{sug.confidence.toFixed(2)}</span>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (data.workspace.model_suggestions.length > 0) {
                      const top = data.workspace.model_suggestions[0];
                      setSelectedLabel(top.label);
                      handleDecision(top.label, 'accept_suggestion');
                    }
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#1e2430',
                    border: '1px solid #3b82f6',
                    color: '#93c5fd',
                    borderRadius: '4px',
                    padding: '0.45rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Accept A
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision('rejected', 'reject_suggestion')}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.textMuted,
                    borderRadius: '4px',
                    padding: '0.45rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Reject
                </button>
              </div>
            </div>

            {/* Box 2: Similar Tickets Already Labeled */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.1rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.62rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.75rem',
                }}
              >
                SIMILAR TICKETS ALREADY LABELED
              </div>

              {data.workspace.similar_tickets.map((sim, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.6rem',
                    fontSize: '0.78rem',
                  }}
                >
                  <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>"{sim.text}"</span>
                  <span
                    style={{
                      border: `1px solid ${C.amber}`,
                      color: C.amber,
                      fontSize: '0.62rem',
                      fontFamily: 'monospace',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontWeight: 600,
                    }}
                  >
                    {sim.label.toUpperCase()}
                  </span>
                </div>
              ))}

              <div style={{ fontSize: '0.68rem', color: C.textMuted, marginTop: '0.5rem' }}>
                Keeps labels consistent between annotators
              </div>
            </div>

            {/* Box 3: Definition */}
            {data.workspace.definition_text && (
              <div
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1.1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    letterSpacing: '0.08em',
                    marginBottom: '0.5rem',
                  }}
                >
                  {data.workspace.definition_title.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.4' }}>
                  {data.workspace.definition_text}
                </div>
              </div>
            )}

            {/* Box 4: This Ticket Info */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.1rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.62rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  marginBottom: '0.75rem',
                }}
              >
                THIS TICKET
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  marginBottom: '0.35rem',
                }}
              >
                <span style={{ color: C.textMuted }}>Why in queue</span>
                <span style={{ color: '#fff' }}>{data.workspace.this_ticket_meta.why_in_queue}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  marginBottom: '0.35rem',
                }}
              >
                <span style={{ color: C.textMuted }}>Split</span>
                <span style={{ color: '#fff' }}>{data.workspace.this_ticket_meta.split}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  marginBottom: '1rem',
                }}
              >
                <span style={{ color: C.textMuted }}>Paraphrases</span>
                <span style={{ color: C.amber }}>{data.workspace.this_ticket_meta.paraphrases}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setNotification('Ticket flagged for team review');
                    setTimeout(() => setNotification(null), 3000);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.textMuted,
                    borderRadius: '4px',
                    padding: '0.4rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Flag ticket...
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotification('Reviewer requested for ticket');
                    setTimeout(() => setNotification(null), 3000);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.textMuted,
                    borderRadius: '4px',
                    padding: '0.4rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Ask reviewer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Label Checks & Team ──────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: '2.5rem',
          marginBottom: '3rem',
        }}
      >
        {/* Left: 3·Label checks */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: '0.6rem',
              marginBottom: '1rem',
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
              3·Label checks
            </h2>
            <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
              RUN ON EVERY SAVE
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.label_checks.map((chk, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.6rem 0',
                  borderBottom: `1px solid rgba(255, 255, 255, 0.05)`,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#f1f5f9', fontWeight: 500 }}>{chk.title}</div>
                  <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{chk.desc}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: C.amber, fontFamily: 'monospace' }}>
                    {chk.count}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFixCheck(chk);
                      setShowFixModal(true);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: `1px solid ${C.borderLight}`,
                      color: C.text,
                      borderRadius: '4px',
                      padding: '0.3rem 0.75rem',
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    Fix →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Team */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: '0.6rem',
              marginBottom: '1rem',
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
              Team
            </h2>
            <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
              TODAY
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0',
                    fontSize: '0.65rem',
                    color: C.textMuted,
                    fontFamily: 'monospace',
                  }}
                >
                  ANNOTATOR
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '0.5rem 0',
                    fontSize: '0.65rem',
                    color: C.textMuted,
                    fontFamily: 'monospace',
                  }}
                >
                  TICKETS / H
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '0.5rem 0',
                    fontSize: '0.65rem',
                    color: C.textMuted,
                    fontFamily: 'monospace',
                  }}
                >
                  ACCEPTS AI
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '0.5rem 0',
                    fontSize: '0.65rem',
                    color: C.textMuted,
                    fontFamily: 'monospace',
                  }}
                >
                  AGREEMENT
                </th>
              </tr>
            </thead>
            <tbody>
              {data.team.map((mem, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid rgba(255, 255, 255, 0.05)` }}>
                  <td style={{ padding: '0.75rem 0', fontSize: '0.78rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                    {mem.name}
                  </td>
                  <td
                    style={{
                      padding: '0.75rem 0',
                      textAlign: 'right',
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      color: '#fff',
                    }}
                  >
                    {mem.tickets_per_h}
                  </td>
                  <td
                    style={{
                      padding: '0.75rem 0',
                      textAlign: 'right',
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      color: '#fff',
                    }}
                  >
                    {mem.accepts_ai}
                  </td>
                  <td
                    style={{
                      padding: '0.75rem 0',
                      textAlign: 'right',
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      color: '#fff',
                    }}
                  >
                    {mem.agreement}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: '0.7rem', color: C.textMuted, lineHeight: '1.4' }}>
            Agreement is measured on the 10% labeled twice. A darija-speaking reviewer is assigned tickets in darija and
            arabizi.
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
            CHECKED BEFORE SAVING
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1.25rem',
          }}
        >
          {data.guardrails.map((gr, idx) => {
            const isWarn = gr.is_warning;
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <span style={{ marginTop: '2px' }}>
                  {isWarn ? (
                    <AlertTriangle size={15} color={C.amber} />
                  ) : (
                    <Check size={16} color={C.green} />
                  )}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isWarn ? C.amber : '#f1f5f9',
                      marginBottom: '0.15rem',
                    }}
                  >
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
            {data.action_banner?.summary || `${data.kpis.done_today} labeled · 61 corrected · 104 paraphrases updated`}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted }}>
            {data.action_banner?.detail ||
              `Saved as ${data.kpis.output} with the label log attached; the augmentation recipe can replay on it`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={() => {
              setNotification(`Augmentation recipe re-run requested on ${data.kpis.output}`);
              setTimeout(() => setNotification(null), 3000);
            }}
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
            Re-run augmentation on {data.kpis.output}
          </button>
          <button
            type="button"
            onClick={handleSaveV4}
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
            Save as {data.kpis.output}
          </button>
        </div>
      </div>

      {/* ── Modal: Label Definitions ──────────────────────────────────────── */}
      {showDefinitionsModal && (
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
          onClick={() => setShowDefinitionsModal(false)}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              width: '100%',
              maxWidth: '650px',
              padding: '1.75rem',
              position: 'relative',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.25rem',
                borderBottom: `1px solid ${C.border}`,
                paddingBottom: '0.75rem',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontStyle: 'italic',
                  fontFamily: '"Playfair Display", Georgia, serif',
                  color: '#fff',
                }}
              >
                Label definitions · {data.dataset_name}
              </h3>
              <button
                type="button"
                onClick={() => setShowDefinitionsModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: C.textMuted,
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '60vh', overflowY: 'auto' }}>
              {data.workspace.labels.map(opt => (
                <div
                  key={opt.id}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: C.cardElevated,
                    borderRadius: '4px',
                    border: `1px solid ${C.borderLight}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span
                      style={{
                        backgroundColor: C.amberBg,
                        color: C.amber,
                        border: `1px solid ${C.amber}`,
                        padding: '1px 6px',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}
                    >
                      {opt.id}
                    </span>
                    <strong style={{ color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {opt.name}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {opt.name === 'billing'
                      ? 'The invoice or the payment is wrong, double charged, or unexplained fees.'
                      : opt.name === 'refund'
                      ? 'Customer explicitly asks for reimbursement or return of funds.'
                      : opt.name === 'delivery'
                      ? 'Questions about shipment delay, tracking number, package condition.'
                      : opt.name === 'account'
                      ? 'Login, password reset, 2FA, email update or KYC identity verification.'
                      : opt.name === 'technical'
                      ? 'Application crash, bug, website error 500 or timeout.'
                      : opt.name === 'complaint'
                      ? 'General dissatisfaction with customer service or representative behavior.'
                      : 'Cases that strictly do not fall into standard categories.'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowDefinitionsModal(false)}
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

      {/* ── Modal: Fix Check ──────────────────────────────────────────────── */}
      {showFixModal && activeFixCheck && (
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
          onClick={() => setShowFixModal(false)}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              width: '100%',
              maxWidth: '520px',
              padding: '1.75rem',
              position: 'relative',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                borderBottom: `1px solid ${C.border}`,
                paddingBottom: '0.75rem',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontStyle: 'italic',
                  fontFamily: '"Playfair Display", Georgia, serif',
                  color: '#fff',
                }}
              >
                Resolve check: {activeFixCheck.title}
              </h3>
              <button
                type="button"
                onClick={() => setShowFixModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: C.textMuted,
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              {activeFixCheck.count} instances detected. Would you like Datalift to auto-reconcile using majority voting
              and confidence threshold?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowFixModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  borderRadius: '4px',
                  padding: '0.45rem 1rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFixModal(false);
                  setNotification(`Resolved ${activeFixCheck.count} instances for "${activeFixCheck.title}"`);
                  setTimeout(() => setNotification(null), 3500);
                }}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.45rem 1.1rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Auto-reconcile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextLabelingPage;
