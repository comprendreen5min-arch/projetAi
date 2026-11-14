import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  TextDriftDataResponse,
} from '../types';

const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardElevated: '#16171b',
  border: '#1e2025',
  borderLight: '#2a2d35',
  text: '#e1e4ea',
  textMuted: '#6b7280',
  textFaint: '#4b5563',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  amberBg: 'rgba(245, 158, 11, 0.08)',
  amberBorder: 'rgba(245, 158, 11, 0.35)',
  blue: '#3b82f6',
  blueBg: 'rgba(59, 130, 246, 0.15)',
  green: '#22c55e',
  red: '#ef4444',
  redBg: 'rgba(239, 68, 68, 0.1)',
  redBorder: 'rgba(239, 68, 68, 0.35)',
};

export const TextDriftPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<TextDriftDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Signal for Section 2 Inspection Panel
  const [selectedSignalId, setSelectedSignalId] = useState<string>('cluster_23');

  // Quality Checks Filter
  const [qualityFilter, setQualityFilter] = useState<'all' | 'failed' | 'warn' | 'passed'>('all');

  // Section 6 Monitoring Form Inputs
  const [distanceWatch, setDistanceWatch] = useState<string>('0.15');
  const [distanceDrift, setDistanceDrift] = useState<string>('0.30');
  const [windowDays, setWindowDays] = useState<string>('14 days');
  const [minTickets, setMinTickets] = useState<string>('1,000');
  const [sendEmail, setSendEmail] = useState<boolean>(true);
  const [sendSlack, setSendSlack] = useState<boolean>(true);
  const [sendWebhook, setSendWebhook] = useState<boolean>(false);

  // Section 6 Checklist Toggles
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({
    'Check every day at 06:00': true,
    'Check each language on its own': true,
    'Email the owner and the darija reviewer': true,
    'Alert when a new cluster passes 100 tickets': true,
    'Start a 07 round when a topic appears': true,
    'Retrain automatically': false,
  });

  // Modals & Feedback
  const [notification, setNotification] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showNewLabelModal, setShowNewLabelModal] = useState<boolean>(false);
  const [showAdoptModal, setShowAdoptModal] = useState<boolean>(false);
  const [newLabelInput, setNewLabelInput] = useState<string>('account_access');

  // Load text datasets on mount
  useEffect(() => {
    async function loadDatasets() {
      try {
        const list = await api.getDatasets();
        const textDatasets = list.filter((d) => {
          const name = d.name.toLowerCase();
          return (
            name.includes('ticket') ||
            name.includes('support') ||
            name.includes('nlp') ||
            name.includes('review') ||
            name.includes('text') ||
            name.includes('texte') ||
            name.endsWith('.jsonl') ||
            name.endsWith('.txt') ||
            name.endsWith('.csv')
          );
        });
        const usableList = textDatasets.length > 0 ? textDatasets : list;
        setDatasets(usableList);

        const stored = localStorage.getItem('datalift_selected_dataset_id');
        const match = usableList.find((d) => d.id === stored);
        const preferred =
          match ||
          usableList.find((d) => d.name.toLowerCase().includes('support_tickets')) ||
          usableList[0];
        if (preferred) {
          setSelectedDatasetId(preferred.id);
        }
      } catch (err: any) {
        setError('Erreur de chargement des jeux de données textuels: ' + (err.message || 'inconnu'));
      }
    }
    loadDatasets();
  }, []);

  // Synchronize with external dataset changed events (Sidebar etc.)
  useEffect(() => {
    const handleDatasetChanged = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setSelectedDatasetId(e.detail);
      }
    };
    window.addEventListener('datalift:dataset-changed', handleDatasetChanged);
    return () => {
      window.removeEventListener('datalift:dataset-changed', handleDatasetChanged);
    };
  }, []);

  // Listen to TopBar events (Drift history)
  useEffect(() => {
    const handleDriftHistory = () => setShowHistoryModal(true);
    window.addEventListener('datalift:open-drift-history', handleDriftHistory);
    return () => {
      window.removeEventListener('datalift:open-drift-history', handleDriftHistory);
    };
  }, []);

  // Fetch drift data when dataset changes
  const fetchData = useCallback(async (datasetId: string) => {
    if (!datasetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTextDriftData(datasetId);
      setData(res);
      if (res.monitoring?.thresholds) {
        setDistanceWatch(res.monitoring.thresholds.distance_watch.toFixed(2));
        setDistanceDrift(res.monitoring.thresholds.distance_drift.toFixed(2));
        setWindowDays(res.monitoring.thresholds.window_days);
        setMinTickets(res.monitoring.thresholds.min_tickets.toLocaleString());
        setSendEmail(res.monitoring.thresholds.send_email);
        setSendSlack(res.monitoring.thresholds.send_slack);
        setSendWebhook(res.monitoring.thresholds.send_webhook);
      }
      if (res.signals && res.signals.length > 0) {
        setSelectedSignalId(res.signals[1]?.id || res.signals[0].id);
      }
    } catch (err: any) {
      setError('Erreur lors du chargement des données de drift texte: ' + (err.message || 'inconnu'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      fetchData(selectedDatasetId);
    }
  }, [selectedDatasetId, fetchData]);

  // Handlers
  const handleSaveSettings = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.saveTextDriftSettings(selectedDatasetId, {
        distance_watch: parseFloat(distanceWatch),
        distance_drift: parseFloat(distanceDrift),
        window_days: windowDays,
        min_tickets: parseInt(minTickets.replace(/,/g, ''), 10) || 1000,
        send_email: sendEmail,
        send_slack: sendSlack,
        send_webhook: sendWebhook,
      });
      setNotification('✓ Paramètres de dérive sauvegardés avec succès.');
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde: ' + (err.message || 'inconnu'));
    }
  };

  const handleRunCheckNow = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.runTextDriftCheck(selectedDatasetId);
      setNotification(`✓ Vérification terminée: score global = ${res.drift_score} (${res.status_label}).`);
      setTimeout(() => setNotification(null), 4000);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      setError("Erreur lors de l'exécution du test: " + (err.message || 'inconnu'));
    }
  };

  const handleSendClusterTo07 = async (clusterName: string = 'cluster 23') => {
    if (!selectedDatasetId) return;
    try {
      await api.sendTextDriftClusterTo07(selectedDatasetId, { cluster_id: clusterName, count: 148 });
      setNotification(`✓ ${clusterName} (148 tickets) envoyé vers 07 Active learning.`);
      setTimeout(() => {
        setNotification(null);
        navigate('/active-learning');
      }, 1400);
    } catch (err: any) {
      setError("Erreur lors de l'envoi vers 07: " + (err.message || 'inconnu'));
    }
  };

  const handleAdoptReference = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.adoptTextDriftReference(selectedDatasetId);
      setShowAdoptModal(false);
      setNotification('✓ Fenêtre en direct adoptée comme nouvelle référence.');
      setTimeout(() => setNotification(null), 3500);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      setError("Erreur lors de l'adoption: " + (err.message || 'inconnu'));
    }
  };

  // Filtered Quality Checks
  const filteredQualityChecks = useMemo(() => {
    if (!data?.data_quality?.checks) return [];
    if (qualityFilter === 'all') return data.data_quality.checks;
    if (qualityFilter === 'failed') return data.data_quality.checks.filter((c) => c.status_type === 'red');
    if (qualityFilter === 'warn') return data.data_quality.checks.filter((c) => c.status_type === 'amber');
    if (qualityFilter === 'passed') return data.data_quality.checks.filter((c) => c.status_type === 'gray');
    return data.data_quality.checks;
  }, [data, qualityFilter]);

  // Selected Signal Details
  const selectedSignal = useMemo(() => {
    return data?.signals?.find((s) => s.id === selectedSignalId) || data?.signals?.[0];
  }, [data, selectedSignalId]);

  // Dynamic visual data for the selected signal inspection panel
  const inspectionDetails = useMemo(() => {
    if (!selectedSignal) {
      return {
        labels: data?.selected_cluster?.labels || ['Billing', 'Refund', 'Deliver…', 'Account', 'Other', 'cl. 23'],
        trainBars: data?.selected_cluster?.train_bars || [65, 72, 82, 42, 85, 0],
        liveBars: data?.selected_cluster?.live_bars || [68, 70, 80, 62, 88, 34],
        text: data?.selected_cluster?.frequent_words || 'Frequent words: code OTP, mise à jour, application, ma tdkhlch. The model spreads these tickets over account and other with low confidence. It may need its own label.',
        badge: 'DRIFT',
        badgeColor: '#ef4444',
        subtitle: 'EMBEDDINGS · DISTANCE',
      };
    }

    const sid = selectedSignal.id;
    if (sid === 'cluster_23' || sid === 'cluster_shift') {
      return {
        labels: data?.selected_cluster?.labels || ['Billing', 'Refund', 'Deliver…', 'Account', 'Other', 'cl. 23'],
        trainBars: data?.selected_cluster?.train_bars || [65, 72, 82, 42, 85, 0],
        liveBars: data?.selected_cluster?.live_bars || [68, 70, 80, 62, 88, 34],
        text: data?.selected_cluster?.frequent_words || 'Frequent words: code OTP, mise à jour, application, ma tdkhlch. The model spreads these tickets over account and other with low confidence. It may need its own label.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'language_mix') {
      return {
        labels: ['French', 'Darija', 'Arabic', 'English', 'Other'],
        trainBars: [68, 12, 10, 8, 2],
        liveBars: [44, 38, 10, 6, 2],
        text: 'Darija share rose from 12% in training to 38% in the live window (mostly written in Latin letters). The model underperforms on romanized Darija.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'other_predicted') {
      return {
        labels: ['Billing', 'Refund', 'Account', 'Deliver…', 'Other'],
        trainBars: [25, 30, 20, 18, 7],
        liveBars: [20, 22, 17, 15, 26],
        text: 'The proportion of tickets classified into « other » jumped from 7% to 26%, indicating an emergence of unhandled customer intents.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'model_confidence' || sid === 'confidence_drop') {
      return {
        labels: ['>0.90', '0.75-0.90', '0.60-0.75', '0.40-0.60', '<0.40'],
        trainBars: [58, 24, 12, 4, 2],
        liveBars: [34, 26, 18, 14, 8],
        text: 'High-confidence predictions (>0.90) fell from 58% to 34%. More incoming tickets fall under the routing threshold and require triage.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'ticket_length' || sid === 'length_profile') {
      return {
        labels: ['<15 w', '15-30 w', '30-60 w', '60-120 w', '>120 w'],
        trainBars: [15, 42, 28, 11, 4],
        liveBars: [16, 40, 29, 11, 4],
        text: 'Ticket length distribution closely matches the reference training data. No volume or structural formatting anomaly detected.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'unknown_words') {
      return {
        labels: ['Top 1k', 'Top 5k', 'Rare', 'Out of Vocab'],
        trainBars: [78, 14, 6, 2],
        liveBars: [74, 13, 8, 5],
        text: 'Out-of-vocabulary words rate is 0.05. A small set of new technical terms from the mobile app update, but well within expected tolerance.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    return {
      labels: data?.selected_cluster?.labels || ['Class A', 'Class B', 'Class C', 'Class D', 'Other', 'Shift'],
      trainBars: data?.selected_cluster?.train_bars || [60, 70, 65, 50, 40, 0],
      liveBars: data?.selected_cluster?.live_bars || [58, 68, 62, 52, 45, 30],
      text: selectedSignal.what_changed,
      badge: selectedSignal.status,
      badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
      subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
    };
  }, [selectedSignal, data]);

  return (
    <div
      style={{
        backgroundColor: C.bg,
        minHeight: '100vh',
        color: C.text,
        padding: '1.5rem 2rem 5rem 2rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '2rem',
            backgroundColor: '#16171b',
            border: `1px solid ${C.amber}`,
            color: C.amberLight,
            padding: '0.85rem 1.5rem',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{notification}</span>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          style={{
            backgroundColor: C.redBg,
            border: `1px solid ${C.red}`,
            color: C.red,
            padding: '0.85rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Dataset selector bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.75rem',
          paddingBottom: '1rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, textTransform: 'uppercase' }}>
          Jeu de données :
        </span>
        <select
          value={selectedDatasetId}
          onChange={(e) => {
            const newId = e.target.value;
            setSelectedDatasetId(newId);
            localStorage.setItem('datalift_selected_dataset_id', newId);
            window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: newId }));
          }}
          style={{
            backgroundColor: C.card,
            color: C.text,
            border: `1px solid ${C.borderLight}`,
            borderRadius: '4px',
            padding: '0.4rem 0.85rem',
            fontSize: '0.82rem',
            fontFamily: 'monospace',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {loading && (
          <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.amber }}>
            Chargement des données...
          </span>
        )}
      </div>

      {/* Top Header & Breadcrumb */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            fontSize: '0.65rem',
            fontFamily: 'monospace',
            letterSpacing: '0.12em',
            color: C.textMuted,
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
          }}
        >
          {data?.subtitle ||
            'DRIFT · WATCHING TICKET-CLS-V3 IN PRODUCTION · 7 LABELS · 4 LANGUAGES · DAILY CHECK'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1
              style={{
                fontFamily: 'Newsreader, Georgia, serif',
                fontStyle: 'italic',
                fontSize: '2.5rem',
                fontWeight: 400,
                color: '#f4f4f6',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {data?.dataset_name || 'support_tickets.jsonl'}
            </h1>
          </div>

          {/* Large dynamic alert badge on top right */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                display: 'inline-block',
                fontSize: '0.6rem',
                fontFamily: 'monospace',
                letterSpacing: '0.15em',
                color: '#ef4444',
                border: '1px solid #ef4444',
                padding: '0.1rem 0.45rem',
                borderRadius: '3px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                marginBottom: '0.2rem',
              }}
            >
              {data?.alert_badge?.tag || 'ALERT'}
            </div>
            <div
              style={{
                fontFamily: 'Newsreader, Georgia, serif',
                fontStyle: 'italic',
                fontSize: '3.6rem',
                color: C.amber,
                lineHeight: 0.95,
                margin: '0.1rem 0',
              }}
            >
              {data?.alert_badge?.count || '01'}
            </div>
            <div
              style={{
                fontSize: '0.62rem',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
                color: C.textMuted,
                textTransform: 'uppercase',
              }}
            >
              {data?.alert_badge?.label || 'NEW TOPIC'}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Key Metrics Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          marginBottom: '2rem',
          paddingBottom: '1.5rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {/* REFERENCE */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            REFERENCE
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.reference || 'tickets@v3'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.reference_sub || 'train split used by ticket-cls-v3'}
          </div>
        </div>

        {/* LIVE WINDOW */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            LIVE WINDOW
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.live_window || '14 days'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.live_window_sub || '6,820 new tickets'}
          </div>
        </div>

        {/* SIGNALS WATCHED */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            SIGNALS WATCHED
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.signals_watched || '9'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.signals_watched_sub || 'per language and in total'}
          </div>
        </div>

        {/* LAST CHECK */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            LAST CHECK
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.last_check || '06:00'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.last_check_sub || 'today · next tomorrow 06:00'}
          </div>
        </div>
      </div>

      {/* Explanatory Banner: HOW DRIFT WORKS FOR TEXT */}
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '6px',
          padding: '1.25rem 1.5rem',
          marginBottom: '2.5rem',
        }}
      >
        <div
          style={{
            fontSize: '0.68rem',
            fontFamily: 'monospace',
            letterSpacing: '0.12em',
            color: C.amberLight,
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
            fontWeight: 'bold',
          }}
        >
          {data?.info_banner?.title || 'HOW DRIFT WORKS FOR TEXT'}
        </div>
        <p
          style={{
            fontSize: '0.82rem',
            lineHeight: 1.6,
            color: '#c5c8d0',
            margin: 0,
            fontFamily: 'monospace',
          }}
        >
          {data?.info_banner?.text ||
            'Customers change how they write and what they write about. Datalift turns every new ticket into an embedding, after masking, and compares it with the tickets ticket-cls-v3 learned from: language mix, length, topics and how sure the model is. A group of tickets far from every training ticket is shown as a possible new topic.'}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: OVER TIME */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            1 · Over time
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            {data?.over_time?.subtitle || 'LAST 30 DAYS · THE SIGNALS THAT MOVED'}
          </span>
        </div>

        {/* Chart Container */}
        <div
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '1.5rem',
          }}
        >
          {/* Legend row */}
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              fontSize: '0.72rem',
              fontFamily: 'monospace',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: C.amber }}>
              <span style={{ fontWeight: 'bold' }}>—</span>
              <span>cluster 23</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f87171' }}>
              <span style={{ fontWeight: 'bold' }}>—</span>
              <span>language mix</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#9ca3af' }}>
              <span style={{ fontWeight: 'bold' }}>---</span>
              <span>model confidence</span>
            </div>
          </div>

          {/* Time Series SVG Chart */}
          <div style={{ height: '220px', width: '100%', position: 'relative' }}>
            <svg viewBox="0 0 800 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              {/* Horizontal Reference Lines */}
              {/* 0.50 */}
              <text x="35" y="24" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="end">
                0.50
              </text>
              <line x1="45" y1="20" x2="780" y2="20" stroke="#1f232b" strokeWidth="1" />

              {/* 0.30 - Drift threshold */}
              <text x="35" y="74" fill="#f59e0b" fontSize="10" fontFamily="monospace" textAnchor="end">
                0.30
              </text>
              <line
                x1="45"
                y1="70"
                x2="780"
                y2="70"
                stroke="#d97706"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                opacity="0.75"
              />

              {/* 0.15 - Watch threshold */}
              <text x="35" y="124" fill="#fbbf24" fontSize="10" fontFamily="monospace" textAnchor="end">
                0.15
              </text>
              <line
                x1="45"
                y1="120"
                x2="780"
                y2="120"
                stroke="#b45309"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                opacity="0.6"
              />

              {/* 0 Base */}
              <text x="35" y="174" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="end">
                0
              </text>
              <line x1="45" y1="170" x2="780" y2="170" stroke="#1f232b" strokeWidth="1" />

              {/* Event Marker: 4 Nov app update 4.2 */}
              <line x1="610" y1="20" x2="610" y2="170" stroke="#4b5563" strokeWidth="1" strokeDasharray="3 3" />
              <text x="615" y="32" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                4 Nov · app update 4.2
              </text>

              {/* Series 3: Model confidence (dashed gray) */}
              <path
                d="M 60 162 Q 130 158 200 164 T 340 162 T 480 160 T 600 156 Q 660 135 700 125 T 770 128"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.85"
              />

              {/* Series 2: Language mix (solid coral) */}
              <path
                d="M 60 152 Q 120 148 180 152 T 300 150 T 400 136 T 500 125 T 600 115 Q 680 110 730 112 T 770 118"
                fill="none"
                stroke="#f87171"
                strokeWidth="2.2"
              />

              {/* Series 1: Cluster 23 (solid amber with sharp jump) */}
              <path
                d="M 60 168 L 220 166 L 380 168 L 590 164 L 640 68 L 680 72 L 740 64 L 770 68"
                fill="none"
                stroke={C.amber}
                strokeWidth="2.8"
              />

              {/* X Axis Date Labels */}
              <text x="60" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                13 Oct
              </text>
              <text x="220" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                20 Oct
              </text>
              <text x="380" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                27 Oct
              </text>
              <text x="590" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                3 Nov
              </text>
              <text x="760" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                11 Nov
              </text>
            </svg>
          </div>

          {/* Footnotes row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1rem',
              fontSize: '0.68rem',
              fontFamily: 'monospace',
              color: C.textMuted,
            }}
          >
            <span>
              {data?.over_time?.footnote_left ||
                'Cluster 23 appears the day the app update shipped. The darija share rose slowly for weeks: a trend, not an event.'}
            </span>
            <span>{data?.over_time?.footnote_right || 'Curves are illustrative.'}</span>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: SIGNALS */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            2 · Signals
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            REFERENCE VS LAST 14 DAYS
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Signals Table */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.74rem',
                fontFamily: 'monospace',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    color: C.textMuted,
                    fontSize: '0.64rem',
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '0.6rem 0.5rem' }}>SIGNAL</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>KIND</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>TEST</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>WHAT CHANGED</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>WEIGHT</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>DISTANCE</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(data?.signals || []).map((s) => {
                  const isSelected = selectedSignalId === s.id;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSignalId(s.id)}
                      style={{
                        borderBottom: `1px solid ${C.border}`,
                        backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                        outline: isSelected ? `1px solid ${C.amberBorder}` : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: C.text }}>
                        {s.signal}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{s.kind}</td>
                      <td style={{ padding: '0.75rem 0.5rem', color: C.text }}>{s.test}</td>
                      <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted, maxWidth: '240px' }}>
                        {s.what_changed}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{s.weight}</td>
                      <td
                        style={{ padding: '0.75rem 0.5rem', color: C.amber, fontWeight: 'bold' }}
                        title={s.distance_val !== '—' ? `Distance: ${s.distance_val}` : undefined}
                      >
                        {s.distance}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '3px',
                            fontWeight: 'bold',
                            border: `1px solid ${
                              s.status_type === 'red'
                                ? '#ef4444'
                                : s.status_type === 'amber'
                                ? C.amber
                                : '#4b5563'
                            }`,
                            color:
                              s.status_type === 'red'
                                ? '#ef4444'
                                : s.status_type === 'amber'
                                ? C.amber
                                : '#9ca3af',
                            backgroundColor:
                              s.status_type === 'red'
                                ? 'rgba(239, 68, 68, 0.1)'
                                : s.status_type === 'amber'
                                ? 'rgba(245, 158, 11, 0.1)'
                                : 'transparent',
                          }}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Footnotes */}
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <p style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted, margin: 0 }}>
                Each language is checked on its own before the total, so a shift in darija cannot hide behind stable French.
              </p>
              <p style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted, margin: 0 }}>
                Weight = how much the signal changes what the model answers. A new topic with no label weighs more than longer tickets.
              </p>
            </div>
          </div>

          {/* Right Column: Inspection Panel */}
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
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.35rem',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'Newsreader, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.25rem',
                    color: '#f4f4f6',
                    margin: 0,
                  }}
                >
                  {selectedSignal?.signal || 'cluster 23 · new topic'}
                </h3>
                <span
                  style={{
                    fontSize: '0.6rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '2px',
                    fontWeight: 'bold',
                    border: `1px solid ${inspectionDetails.badgeColor}`,
                    color: inspectionDetails.badgeColor,
                    backgroundColor: inspectionDetails.badgeColor === '#ef4444' ? 'rgba(239, 68, 68, 0.1)' : inspectionDetails.badgeColor === C.amber ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                  }}
                >
                  {inspectionDetails.badge}
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: '1.25rem',
                }}
              >
                {inspectionDetails.subtitle}
              </div>

              {/* Bar Chart comparing Train vs Live */}
              <div
                style={{
                  backgroundColor: '#0a0b0d',
                  border: `1px solid ${C.border}`,
                  borderRadius: '5px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ height: '140px', display: 'flex', alignItems: 'flex-end', gap: '1rem', paddingBottom: '0.5rem' }}>
                  {inspectionDetails.labels.map(
                    (lbl, idx) => {
                      const trainH = inspectionDetails.trainBars[idx] ?? 50;
                      const liveH = inspectionDetails.liveBars[idx] ?? 40;
                      return (
                        <div
                          key={lbl}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            height: '100%',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', width: '100%', height: '110px' }}>
                            {/* Train Bar (dark) */}
                            <div
                              style={{
                                flex: 1,
                                height: `${trainH}%`,
                                backgroundColor: '#374151',
                                borderRadius: '2px 2px 0 0',
                              }}
                              title={`Train: ${trainH}%`}
                            />
                            {/* Live Bar (amber) */}
                            <div
                              style={{
                                flex: 1,
                                height: `${liveH}%`,
                                backgroundColor: C.amber,
                                borderRadius: '2px 2px 0 0',
                              }}
                              title={`Live: ${liveH}%`}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: '0.58rem',
                              fontFamily: 'monospace',
                              color: C.textMuted,
                              marginTop: '0.4rem',
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '100%',
                            }}
                          >
                            {lbl}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* Legend */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '1.25rem',
                    fontSize: '0.62rem',
                    fontFamily: 'monospace',
                    marginTop: '0.5rem',
                    borderTop: `1px solid ${C.border}`,
                    paddingTop: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: C.textMuted }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: '#374151', display: 'inline-block' }} />
                    <span>Train · {data?.metrics?.reference?.split('@')[1] || 'v3'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: C.amber }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: C.amber, display: 'inline-block' }} />
                    <span>Live · last {data?.metrics?.live_window || '14 days'}</span>
                  </div>
                </div>
              </div>

              {/* Frequent Words Summary */}
              <p
                style={{
                  fontSize: '0.74rem',
                  fontFamily: 'monospace',
                  color: '#d1d5db',
                  lineHeight: 1.5,
                  margin: '0 0 1.25rem 0',
                }}
              >
                {inspectionDetails.text}
              </p>
            </div>

            {/* Action Buttons */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleSendClusterTo07('cluster 23')}
                  style={{
                    backgroundColor: '#16171b',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Send cluster to 07
                </button>

                <button
                  type="button"
                  onClick={() => setShowNewLabelModal(true)}
                  style={{
                    backgroundColor: '#16171b',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Propose a new label
                </button>
              </div>

              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, textAlign: 'right' }}>
                Bar lengths are illustrative.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: DATA QUALITY */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            3 · Data quality
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            BROKEN DATA IS A PIPELINE PROBLEM, NOT A DRIFT
          </span>
        </div>

        {/* Quality Table Container */}
        <div
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '1.25rem',
          }}
        >
          {/* Summary Badges Header */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setQualityFilter(qualityFilter === 'failed' ? 'all' : 'failed')}
              style={{
                backgroundColor: qualityFilter === 'failed' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                border: '1px solid #ef4444',
                color: '#ef4444',
                padding: '0.2rem 0.65rem',
                borderRadius: '3px',
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              {data?.data_quality?.summary?.failed || 1} FAILED
            </button>

            <button
              type="button"
              onClick={() => setQualityFilter(qualityFilter === 'warn' ? 'all' : 'warn')}
              style={{
                backgroundColor: qualityFilter === 'warn' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                border: `1px solid ${C.amber}`,
                color: C.amber,
                padding: '0.2rem 0.65rem',
                borderRadius: '3px',
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              {data?.data_quality?.summary?.to_review || 2} TO REVIEW
            </button>

            <button
              type="button"
              onClick={() => setQualityFilter(qualityFilter === 'passed' ? 'all' : 'passed')}
              style={{
                backgroundColor: qualityFilter === 'passed' ? 'rgba(107, 114, 128, 0.2)' : 'transparent',
                border: `1px solid ${C.borderLight}`,
                color: C.textMuted,
                padding: '0.2rem 0.65rem',
                borderRadius: '3px',
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              {data?.data_quality?.summary?.passed || 3} PASSED
            </button>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.74rem',
              fontFamily: 'monospace',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: `1px solid ${C.border}`,
                  color: C.textMuted,
                  fontSize: '0.64rem',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '0.6rem 0.5rem' }}>CHECK</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>WHERE</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>LIVE</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>EXPECTED</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>STATUS</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filteredQualityChecks.map((qc, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: C.text }}>{qc.check}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{qc.where}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: C.text }}>{qc.live}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{qc.expected}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        fontWeight: 'bold',
                        border: `1px solid ${
                          qc.status_type === 'red'
                            ? '#ef4444'
                            : qc.status_type === 'amber'
                            ? C.amber
                            : '#4b5563'
                        }`,
                        color:
                          qc.status_type === 'red'
                            ? '#ef4444'
                            : qc.status_type === 'amber'
                            ? C.amber
                            : '#9ca3af',
                      }}
                    >
                      {qc.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    {qc.action_label !== '—' ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (qc.action_route) navigate(qc.action_route);
                        }}
                        style={{
                          backgroundColor: 'transparent',
                          border: `1px solid ${C.borderLight}`,
                          color: C.text,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                        }}
                      >
                        {qc.action_label}
                      </button>
                    ) : (
                      <span style={{ color: C.textFaint }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '1rem', fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.data_quality?.footnote ||
              'Quality runs before drift. Empty or duplicate tickets are left out of the drift window, so a broken channel never looks like a new topic.'}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: IMPACT ON THE MODEL */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            4 · Impact on the model
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            AGENTS CHECK ONLY ROUTED TICKETS
          </span>
        </div>

        {/* 3 Top KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          {(data?.model_impact?.kpis || [
            { title: 'MACRO F1 · ESTIMATED', value: '[RESULT]', tooltip: 'Est F1: ~0.84', sub: "without labels · from the model's own confidence" },
            { title: 'SENT TO A HUMAN', value: '[RESULT]', tooltip: 'Human share: ~18.4%', sub: 'confidence under the routing threshold' },
            { title: 'MACRO F1 · MEASURED', value: 'partial', tooltip: 'Measured F1: ~0.88', sub: 'from agent corrections · 2 days late' },
          ]).map((k, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.08em' }}>
                {k.title}
              </div>
              <div
                style={{
                  fontSize: '1.45rem',
                  fontWeight: 'bold',
                  color: k.value === '[RESULT]' ? C.amber : C.text,
                  margin: '0.35rem 0',
                }}
                title={k.tooltip}
              >
                {k.value}
              </div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Segments Table */}
        <div
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '1.25rem',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.74rem',
              fontFamily: 'monospace',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: `1px solid ${C.border}`,
                  color: C.textMuted,
                  fontSize: '0.64rem',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '0.6rem 0.5rem' }}>SEGMENT · LIVE</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>TICKETS</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>F1 · EST.</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>FLAG</th>
              </tr>
            </thead>
            <tbody>
              {(data?.model_impact?.segments || []).map((seg, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: C.text }}>{seg.segment}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{seg.tickets}</td>
                  <td
                    style={{ padding: '0.75rem 0.5rem', color: C.amber, fontWeight: 'bold' }}
                    title={seg.f1_tooltip}
                  >
                    {seg.f1_est}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        fontWeight: 'bold',
                        border: `1px solid ${
                          seg.flag_type === 'red'
                            ? '#ef4444'
                            : seg.flag_type === 'amber'
                            ? C.amber
                            : '#4b5563'
                        }`,
                        color:
                          seg.flag_type === 'red'
                            ? '#ef4444'
                            : seg.flag_type === 'amber'
                            ? C.amber
                            : '#9ca3af',
                      }}
                    >
                      {seg.flag}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '0.85rem', fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.model_impact?.footnote || 'Texts stay masked: [PHONE] [EMAIL] [NAME], the same rules as training.'}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 5: WHAT TO DO */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            5 · What to do
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            A DRIFT OPENS WORK, NEVER A RELEASE
          </span>
        </div>

        {/* 4 Action Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {(data?.what_to_do?.cards || [
            {
              type: 'IF IT IS EXPECTED',
              title: 'Customers write differently',
              description: 'More darija is the new normal, not a mistake. Make the live window the reference and raise the darija quota in 07.',
              action_label: 'Adopt as new reference',
              action_key: 'adopt_ref',
              is_recommended: false,
            },
            {
              type: 'IF IT IS A DATA BUG',
              title: 'A channel is broken',
              description: 'Masking failed, a channel sends empty tickets or an encoding is wrong. Fix the rule in 02.',
              action_label: 'Open in 02 Cleaning',
              action_key: 'open_cleaning',
              is_recommended: false,
            },
            {
              type: 'RECOMMENDED',
              title: 'A new topic appeared',
              description: 'The OTP tickets fit no label. Label 200 of them in 07, then decide in 05 whether « account access » becomes its own label.',
              action_label: 'Send cluster 23 to 07',
              action_key: 'send_to_07',
              is_recommended: true,
            },
            {
              type: 'IF A LABEL IS ADDED',
              title: 'Retrain on v5',
              description: 'A new label means a new version and a retrain. The label list ships with the model.',
              action_label: 'Retrain in 06',
              action_key: 'retrain_06',
              is_recommended: false,
            },
          ]).map((card, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: C.card,
                border: card.is_recommended ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: card.is_recommended ? '0 0 16px rgba(245, 158, 11, 0.12)' : 'none',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'monospace',
                    color: card.is_recommended ? C.amberLight : C.textMuted,
                    letterSpacing: '0.08em',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                  }}
                >
                  {card.type}
                </div>
                <h3
                  style={{
                    fontFamily: 'Newsreader, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.2rem',
                    color: '#f4f4f6',
                    margin: '0 0 0.5rem 0',
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    color: '#9ca3af',
                    lineHeight: 1.45,
                    margin: '0 0 1.25rem 0',
                  }}
                >
                  {card.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (card.action_key === 'adopt_ref') setShowAdoptModal(true);
                  else if (card.action_key === 'open_cleaning') navigate('/cleaning');
                  else if (card.action_key === 'send_to_07') handleSendClusterTo07('cluster 23');
                  else if (card.action_key === 'retrain_06') navigate('/training');
                }}
                style={{
                  backgroundColor: card.is_recommended ? C.amber : 'transparent',
                  border: card.is_recommended ? 'none' : `1px solid ${C.borderLight}`,
                  color: card.is_recommended ? '#000' : C.text,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.74rem',
                  fontFamily: 'monospace',
                  fontWeight: card.is_recommended ? 'bold' : 'normal',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {card.action_label}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 6: MONITORING */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            6 · Monitoring
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            CHECKS RUN ON THEIR OWN; RETRAINING NEVER DOES
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Checklist */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {(data?.monitoring?.checklist || [
              { label: 'Check every day at 06:00', sub: 'On the last 14 days · at least 1,000 tickets', checked: true },
              { label: 'Check each language on its own', sub: 'FR · darija · AR · EN, then the total', checked: true },
              { label: 'Email the owner and the darija reviewer', sub: 'With sample tickets, masked', checked: true },
              { label: 'Alert when a new cluster passes 100 tickets', sub: 'Possible new label', checked: true },
              { label: 'Start a 07 round when a topic appears', sub: 'Picks focus on the new cluster', checked: true },
              { label: 'Retrain automatically', sub: 'Not available · always reviewed in 06', checked: false, disabled: true },
            ]).map((item, idx) => {
              const isChecked = checklistState[item.label] ?? item.checked;
              return (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.45 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={item.disabled}
                    checked={isChecked}
                    onChange={(e) =>
                      setChecklistState((prev) => ({
                        ...prev,
                        [item.label]: e.target.checked,
                      }))
                    }
                    style={{ accentColor: C.amber, marginTop: '0.2rem' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: C.text }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
                      {item.sub}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Right Column: Thresholds Card */}
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
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.25rem',
                  color: '#f4f4f6',
                  margin: '0 0 1rem 0',
                }}
              >
                Thresholds
              </h3>

              {/* Distances Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.3rem' }}>
                    DISTANCE · WATCH
                  </label>
                  <input
                    type="text"
                    value={distanceWatch}
                    onChange={(e) => setDistanceWatch(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090a0c',
                      border: `1px solid ${C.borderLight}`,
                      color: C.text,
                      padding: '0.45rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.3rem' }}>
                    DISTANCE · DRIFT
                  </label>
                  <input
                    type="text"
                    value={distanceDrift}
                    onChange={(e) => setDistanceDrift(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090a0c',
                      border: `1px solid ${C.borderLight}`,
                      color: C.text,
                      padding: '0.45rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Window & Min Tickets Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.3rem' }}>
                    WINDOW
                  </label>
                  <input
                    type="text"
                    value={windowDays}
                    onChange={(e) => setWindowDays(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090a0c',
                      border: `1px solid ${C.borderLight}`,
                      color: C.text,
                      padding: '0.45rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.3rem' }}>
                    MIN TICKETS
                  </label>
                  <input
                    type="text"
                    value={minTickets}
                    onChange={(e) => setMinTickets(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090a0c',
                      border: `1px solid ${C.borderLight}`,
                      color: C.text,
                      padding: '0.45rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Alerts Checkboxes */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.4rem' }}>
                  SEND ALERTS TO
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sendEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      style={{ accentColor: C.amber }}
                    />
                    <span>Email owner + reviewer</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sendSlack}
                      onChange={(e) => setSendSlack(e.target.checked)}
                      style={{ accentColor: C.amber }}
                    />
                    <span>Slack #datalift-alerts</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: C.textMuted }}>
                    <input
                      type="checkbox"
                      checked={sendWebhook}
                      onChange={(e) => setSendWebhook(e.target.checked)}
                      style={{ accentColor: C.amber }}
                    />
                    <span>Webhook [YOUR URL]</span>
                  </label>
                </div>
              </div>

              {/* CLI Command Snippet */}
              <div
                style={{
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.border}`,
                  borderRadius: '4px',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: C.amberLight,
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                  marginBottom: '1rem',
                }}
              >
                {data?.monitoring?.thresholds?.cli_command ||
                  'datalift drift ticket-cls-v3 --ref tickets@v3 --window 14d --per-language'}
              </div>
            </div>

            {/* Buttons Row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Save settings
                </button>
                <button
                  type="button"
                  onClick={handleRunCheckNow}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Run check now
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNotification('✓ Rapport de dérive exporté avec succès (format PDF / JSON).');
                  setTimeout(() => setNotification(null), 3500);
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.textMuted,
                  padding: '0.4rem',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                Download report
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: GUARDRAILS */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            Guardrails
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            CHECKED ON EVERY DRIFT RUN
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {(data?.guardrails || [
            { label: 'Reference is the production train split', description: 'Never test tickets, never paraphrases', status: 'ok' },
            { label: 'Same masking as training', description: 'Embeddings are made after masking', status: 'ok' },
            { label: 'Each language checked first', description: 'No language may drift unseen', status: 'ok' },
            { label: 'One ticket, one vote', description: 'Chunks of a long ticket count once', status: 'ok' },
            { label: 'Small windows are not judged', description: 'Under 1,000 tickets the check waits', status: 'ok' },
            { label: 'Every check is stored', description: 'Window, reference hash, test, threshold', status: 'ok' },
            { label: 'No automatic retrain', description: 'A drift opens work, never a release', status: 'ok' },
            { label: 'Agent labels are partial', description: 'Only routed tickets get a checked label', status: 'warning' },
          ]).map((g, idx) => {
            const isWarning = g.status === 'warning';
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: C.card,
                  border: isWarning ? '1px solid rgba(245, 158, 11, 0.4)' : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                }}
              >
                <div style={{ marginTop: '0.1rem' }}>
                  {isWarning ? (
                    <AlertTriangle size={15} color={C.amber} />
                  ) : (
                    <Check size={15} color={C.green} />
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      color: isWarning ? C.amberLight : C.text,
                      marginBottom: '0.2rem',
                    }}
                  >
                    {g.label}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                    {g.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* BOTTOM ACTION BAR */}
      {/* ========================================================================= */}
      <div
        style={{
          position: 'sticky',
          bottom: '0',
          left: '0',
          right: '0',
          backgroundColor: '#0c0d0e',
          borderTop: `1px solid ${C.border}`,
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
        }}
      >
        <div>
          <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: C.text, fontWeight: 'bold' }}>
            {data?.bottom_bar?.title || 'ticket-cls-v3 · 1 new topic · darija share up'}
          </div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
            {data?.bottom_bar?.sub || 'Recommended: label cluster 23 in 07 and decide if it needs its own label'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={() => handleSendClusterTo07('cluster 23')}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: C.text,
              padding: '0.5rem 1.15rem',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {data?.bottom_bar?.action_left || 'Send cluster 23 to 07'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/export-api')}
            style={{
              backgroundColor: C.amber,
              border: 'none',
              color: '#000',
              padding: '0.5rem 1.25rem',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {data?.bottom_bar?.action_right || 'Continue to export →'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: DRIFT HISTORY */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.cardElevated,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '1.75rem',
              width: '640px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.35rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                Drift history
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                marginBottom: '1.5rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem' }}>
                  <th style={{ padding: '0.5rem' }}>DATE</th>
                  <th style={{ padding: '0.5rem' }}>REFERENCE</th>
                  <th style={{ padding: '0.5rem' }}>WINDOW</th>
                  <th style={{ padding: '0.5rem' }}>DRIFT SCORE</th>
                  <th style={{ padding: '0.5rem' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { date: '11 Nov 06:00', ref: 'tickets@v3', window: '14 days (6,820)', score: '0.38', status: 'ALERT' },
                  { date: '04 Nov 06:00', ref: 'tickets@v3', window: '14 days (6,410)', score: '0.19', status: 'WATCH' },
                  { date: '28 Oct 06:00', ref: 'tickets@v3', window: '14 days (5,920)', score: '0.12', status: 'STABLE' },
                  { date: '21 Oct 06:00', ref: 'tickets@v3', window: '14 days (5,500)', score: '0.09', status: 'STABLE' },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.text }}>{row.date}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.textMuted }}>{row.ref}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.textMuted }}>{row.window}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.amber, fontWeight: 'bold' }}>{row.score}</td>
                    <td
                      style={{
                        padding: '0.6rem 0.5rem',
                        color: row.status === 'ALERT' ? '#ef4444' : row.status === 'WATCH' ? C.amber : C.green,
                        fontWeight: 'bold',
                      }}
                    >
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1.25rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PROPOSE A NEW LABEL */}
      {/* ========================================================================= */}
      {showNewLabelModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.cardElevated,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '1.75rem',
              width: '500px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.35rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                Propose a new label
              </h3>
              <button
                type="button"
                onClick={() => setShowNewLabelModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.25rem' }}>
              Cluster 23 groups 148 tickets related to OTP and update verification failures. Adding a dedicated class will
              prevent confusion with <code>account</code> and <code>other</code>.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                PROPOSED LABEL NAME
              </label>
              <input
                type="text"
                value={newLabelInput}
                onChange={(e) => setNewLabelInput(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowNewLabelModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem 0.85rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewLabelModal(false);
                  setNotification(`✓ Nouveau label « ${newLabelInput} » proposé. Envoyer vers 07 Active learning.`);
                  setTimeout(() => setNotification(null), 3500);
                }}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Save proposed label
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADOPT REFERENCE CONFIRMATION */}
      {/* ========================================================================= */}
      {showAdoptModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.cardElevated,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '1.75rem',
              width: '520px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.35rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                Adopt live window as reference
              </h3>
              <button
                type="button"
                onClick={() => setShowAdoptModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Are you sure you want to promote the last 14 days (6,820 tickets) as the baseline reference distribution? This
              will reset current drift alert thresholds for future checks.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowAdoptModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem 0.85rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdoptReference}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Confirm adoption
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
