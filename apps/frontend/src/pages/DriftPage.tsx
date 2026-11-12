import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  AlertTriangle,
  RefreshCw,
  X,
  Save,
  Download,
  ExternalLink,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  DriftStateResponse,
  DriftSignalItem,
} from '../types';

export const DriftPage: React.FC = () => {
  const navigate = useNavigate();

  // 1. Dataset state
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [state, setState] = useState<DriftStateResponse | null>(null);

  // 2. Interactive Selection & Filters
  const [selectedSignalIndex, setSelectedSignalIndex] = useState<number>(0);
  const [qualityFilter, setQualityFilter] = useState<'ALL' | 'FAIL' | 'WARN' | 'PASS'>('ALL');

  // 3. Monitoring Thresholds form state
  const [psiWatchInput, setPsiWatchInput] = useState<string>('0.10');
  const [psiDriftInput, setPsiDriftInput] = useState<string>('0.25');
  const [windowDaysInput, setWindowDaysInput] = useState<string>('7');
  const [minRowsInput, setMinRowsInput] = useState<string>('500');
  const [emailAlertsChecked, setEmailAlertsChecked] = useState<boolean>(true);

  // 4. Modals & Actions
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showClassifierModal, setShowClassifierModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isRunningCheck, setIsRunningCheck] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // TopBar listener for "Historique de dérive"
  useEffect(() => {
    const handleHistoryEvent = () => setShowHistoryModal(true);
    window.addEventListener('datalift:open-drift-history', handleHistoryEvent);
    return () => window.removeEventListener('datalift:open-drift-history', handleHistoryEvent);
  }, []);

  // Initial datasets load
  useEffect(() => {
    api.getDatasets()
      .then((data) => {
        setDatasets(data);
        if (data.length > 0) {
          const defaultDs = data.find((d) => d.name === 'data' || d.name === 'customer_churn.csv') || data[0];
          setSelectedDatasetId(defaultDs.id);
        }
      })
      .catch((err) => {
        console.error('Error fetching datasets:', err);
        showToast('Erreur lors du chargement des jeux de données.', 'error');
      });
  }, []);

  // Load drift state for selected dataset
  const loadDriftState = (datasetId: string) => {
    setLoading(true);
    api.getDriftState(datasetId)
      .then((res) => {
        setState(res);
        setSelectedSignalIndex(0);
        setPsiWatchInput(res.thresholds.psi_watch.toFixed(2));
        setPsiDriftInput(res.thresholds.psi_drift.toFixed(2));
        setWindowDaysInput(res.thresholds.window_days.toString());
        setMinRowsInput(res.thresholds.min_rows.toString());
        setEmailAlertsChecked(res.thresholds.email_alerts);
      })
      .catch((err) => {
        console.error('Error loading drift state:', err);
        showToast('Erreur lors du calcul de la dérive.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedDatasetId) {
      loadDriftState(selectedDatasetId);
    }
  }, [selectedDatasetId]);

  // Selected signal for Section 2 inspector
  const currentSignal: DriftSignalItem | undefined = useMemo(() => {
    if (!state || !state.signals || state.signals.length === 0) return undefined;
    return state.signals[selectedSignalIndex] || state.signals[0];
  }, [state, selectedSignalIndex]);

  // Filtered Data Quality rows
  const filteredQualityChecks = useMemo(() => {
    if (!state || !state.quality_checks) return [];
    if (qualityFilter === 'ALL') return state.quality_checks;
    return state.quality_checks.filter((q) => q.status === qualityFilter);
  }, [state, qualityFilter]);

  // Save Threshold Settings
  const handleSaveSettings = async () => {
    if (!selectedDatasetId) return;
    setIsSavingSettings(true);
    try {
      const res = await api.updateDriftSettings(selectedDatasetId, {
        psi_watch: parseFloat(psiWatchInput) || 0.10,
        psi_drift: parseFloat(psiDriftInput) || 0.25,
        window_days: parseInt(windowDaysInput, 10) || 7,
        min_rows: parseInt(minRowsInput, 10) || 500,
        email_alerts: emailAlertsChecked,
      });
      setState(res);
      showToast('Seuils de surveillance enregistrés avec succès !', 'success');
    } catch (err) {
      console.error('Error updating drift settings:', err);
      showToast('Échec de la sauvegarde des paramètres.', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Run Check Now
  const handleRunCheckNow = async () => {
    if (!selectedDatasetId) return;
    setIsRunningCheck(true);
    try {
      const res = await api.runDriftCheckNow(selectedDatasetId);
      showToast(res.message, 'success');
      loadDriftState(selectedDatasetId);
    } catch (err) {
      console.error('Error running check now:', err);
      showToast('Erreur lors de l’exécution du check de dérive.', 'error');
    } finally {
      setIsRunningCheck(false);
    }
  };

  // Download Report
  const handleDownloadReport = () => {
    if (!state) return;
    const reportJson = JSON.stringify(state, null, 2);
    const blob = new Blob([reportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datalift-drift-${state.header.dataset_name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Rapport de dérive téléchargé.', 'info');
  };

  // Action decision handlers
  const handleDecisionAction = (actionType: string) => {
    if (actionType === 'adopt_reference') {
      showToast('La fenêtre active de 7 jours a été adoptée comme nouvelle référence !', 'success');
    } else if (actionType === 'open_cleaning') {
      navigate('/cleaning');
    } else if (actionType === 'start_active_learning') {
      navigate('/active-learning');
    } else if (actionType === 'open_training') {
      navigate('/training');
    }
  };

  if (loading && !state) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af', minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={28} className="animate-spin" style={{ color: '#f59e0b', marginBottom: '1rem' }} />
        <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem', letterSpacing: '0.05em' }}>
          Calcul de la dérive des distributions (PSI, KS, Chi², Classifieur)...
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444' }}>
        Impossible de charger les métriques de dérive pour ce jeu de données.
      </div>
    );
  }

  const { header, quality_summary, model_impact, decisions, cli_command, guardrails } = state;

  return (
    <div style={{ backgroundColor: '#0c0d0e', color: '#e5e7eb', minHeight: '100vh', paddingBottom: '7rem', fontSize: '0.85rem' }}>
      
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            zIndex: 9999,
            backgroundColor: notification.type === 'error' ? '#7f1d1d' : notification.type === 'info' ? '#1e3a8a' : '#064e3b',
            color: '#fff',
            border: `1px solid ${notification.type === 'error' ? '#ef4444' : notification.type === 'info' ? '#3b82f6' : '#10b981'}`,
            borderRadius: '6px',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.82rem',
          }}
        >
          {notification.type === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Container */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.75rem 2rem' }}>
        
        {/* ========================================================= */}
        {/* HEADER & CONTEXT BAR */}
        {/* ========================================================= */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            {/* Monospace uppercase metadata breadcrumb */}
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', letterSpacing: '0.08em', color: '#71717a', marginBottom: '0.35rem' }}>
              DRIFT · WATCHING {header.production_model_name.toUpperCase()} IN PRODUCTION · REFERENCE = TRAIN SPLIT OF {header.reference_version_label.toUpperCase()} · DAILY CHECK
            </div>
            
            {/* Serif Italic Title with Dataset Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: '2.5rem', fontWeight: 400, color: '#f3f4f6', margin: 0, letterSpacing: '-0.02em' }}>
                {header.dataset_name}
              </h1>

              {/* Dataset Switcher Dropdown */}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  style={{
                    backgroundColor: '#18191c',
                    color: '#e5e7eb',
                    border: '1px solid #2a2c33',
                    borderRadius: '4px',
                    padding: '0.25rem 1.75rem 0.25rem 0.6rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    appearance: 'none',
                    outline: 'none',
                  }}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#71717a' }} />
              </div>
            </div>
          </div>

          {/* Top Right ALERT Badge: 02 COLUMNS DRIFTING */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.12em', color: '#f59e0b', marginBottom: '0.15rem' }}>
              ALERT
            </div>
            <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '4.5rem', lineHeight: '1', fontWeight: 300, color: '#f59e0b' }}>
              {header.drifting_columns_count.toString().padStart(2, '0')}
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', letterSpacing: '0.15em', color: '#a1a1aa' }}>
              COLUMNS DRIFTING
            </div>
          </div>
        </div>

        {/* 4 KPI Top Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
          {/* REFERENCE */}
          <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1rem 1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a', marginBottom: '0.35rem' }}>
              REFERENCE
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.35rem', color: '#f3f4f6', fontWeight: 600 }}>
              {header.reference_version_label}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.25rem' }}>
              {header.reference_subtitle}
            </div>
          </div>

          {/* LIVE WINDOW */}
          <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1rem 1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a', marginBottom: '0.35rem' }}>
              LIVE WINDOW
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.35rem', color: '#f3f4f6', fontWeight: 600 }}>
              {header.live_window_label}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.25rem' }}>
              {header.live_window_subtitle}
            </div>
          </div>

          {/* SIGNALS WATCHED */}
          <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1rem 1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a', marginBottom: '0.35rem' }}>
              SIGNALS WATCHED
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.35rem', color: '#f3f4f6', fontWeight: 600 }}>
              {header.signals_watched_count}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.25rem' }}>
              {header.signals_watched_subtitle}
            </div>
          </div>

          {/* LAST CHECK */}
          <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1rem 1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a', marginBottom: '0.35rem' }}>
              LAST CHECK
            </div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.35rem', color: '#f3f4f6', fontWeight: 600 }}>
              {header.last_check_time}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.25rem' }}>
              {header.last_check_subtitle}
            </div>
          </div>
        </div>

        {/* Informative Blue Callout Box */}
        <div
          style={{
            backgroundColor: 'rgba(30, 58, 138, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '4px',
            padding: '1rem 1.25rem',
            marginBottom: '2.5rem',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.12em', color: '#60a5fa', marginBottom: '0.35rem', fontWeight: 600 }}>
            HOW DRIFT WORKS FOR TABLES
          </div>
          <div style={{ fontSize: '0.8rem', color: '#93c5fd', lineHeight: '1.5' }}>
            The model learned from the CRM as it was when {header.reference_version_label} was tagged. Every day Datalift compares the new rows with the rows {header.production_model_name} was trained on, column by column, and watches what the model predicts. Whether a customer really churned is only known 60 days later, so until then the model's quality is estimated, not measured.
          </div>
        </div>


        {/* ========================================================= */}
        {/* 1 · OVER TIME (30-DAY DRIFT TREND) */}
        {/* ========================================================= */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.6rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
              1 · Over time
            </h2>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a' }}>
              LAST 30 DAYS · THE SIGNALS THAT MOVED
            </span>
          </div>

          <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1.5rem 1.75rem' }}>
            {/* Chart Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono, monospace)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                <span style={{ display: 'inline-block', width: '18px', height: '2px', backgroundColor: '#f59e0b' }} />
                <span>contract</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
                <span style={{ display: 'inline-block', width: '18px', height: '2px', backgroundColor: '#ef4444' }} />
                <span>monthly_charges</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a1a1aa' }}>
                <span style={{ display: 'inline-block', width: '18px', borderTop: '2px dashed #71717a' }} />
                <span>city</span>
              </div>
            </div>

            {/* SVG Interactive Multi-Line Chart */}
            <div style={{ position: 'relative', width: '100%', height: '260px' }}>
              <svg width="100%" height="100%" viewBox="0 0 900 240" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                {/* Horizontal reference grid lines */}
                {/* 0.50 Line */}
                <line x1="40" y1="20" x2="880" y2="20" stroke="#1f2128" strokeWidth="1" />
                <text x="15" y="24" fill="#52525b" fontSize="10" fontFamily="monospace">0.50</text>

                {/* 0.25 Drift Threshold (Red dashed) */}
                <line x1="40" y1="90" x2="880" y2="90" stroke="rgba(239, 68, 68, 0.4)" strokeWidth="1" strokeDasharray="4 4" />
                <text x="15" y="94" fill="#ef4444" fontSize="10" fontFamily="monospace">0.25</text>

                {/* 0.10 Watch Threshold (Amber dashed) */}
                <line x1="40" y1="160" x2="880" y2="160" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="1" strokeDasharray="4 4" />
                <text x="15" y="164" fill="#f59e0b" fontSize="10" fontFamily="monospace">0.10</text>

                {/* 0.00 Base line */}
                <line x1="40" y1="205" x2="880" y2="205" stroke="#1f2128" strokeWidth="1" />
                <text x="25" y="208" fill="#52525b" fontSize="10" fontFamily="monospace">0</text>

                {/* Vertical Event Marker at Nov 1 (x ≈ 650) */}
                <line x1="650" y1="20" x2="650" y2="205" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
                <text x="655" y="32" fill="#d4d4d8" fontSize="10" fontFamily="monospace">1 Nov · new prices and offer</text>

                {/* Line 1: contract (amber) */}
                {/* Points: 13 Oct (90, 168), 20 Oct (260, 172), 27 Oct (450, 164), 3 Nov (690, 80), 11 Nov (850, 70) */}
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  points="90,168 260,172 450,164 630,170 690,80 770,72 850,75"
                />

                {/* Line 2: monthly_charges (red/coral) */}
                {/* Points: 13 Oct (90, 175), 20 Oct (260, 178), 27 Oct (450, 170), 3 Nov (690, 72), 11 Nov (850, 82) */}
                <polyline
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  points="90,175 260,178 450,170 630,180 690,72 770,95 850,82"
                />

                {/* Line 3: city (gray dashed) */}
                {/* Points: 13 Oct (90, 185), 20 Oct (260, 180), 27 Oct (450, 186), 3 Nov (690, 165), 11 Nov (850, 150) */}
                <polyline
                  fill="none"
                  stroke="#a1a1aa"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  points="90,185 260,180 450,186 630,192 690,165 770,158 850,150"
                />

                {/* X-axis date labels */}
                <text x="90" y="225" fill="#71717a" fontSize="10" fontFamily="monospace" textAnchor="middle">13 Oct</text>
                <text x="260" y="225" fill="#71717a" fontSize="10" fontFamily="monospace" textAnchor="middle">20 Oct</text>
                <text x="450" y="225" fill="#71717a" fontSize="10" fontFamily="monospace" textAnchor="middle">27 Oct</text>
                <text x="690" y="225" fill="#71717a" fontSize="10" fontFamily="monospace" textAnchor="middle">3 Nov</text>
                <text x="850" y="225" fill="#71717a" fontSize="10" fontFamily="monospace" textAnchor="middle">11 Nov</text>
              </svg>
            </div>

            {/* Footnote notes */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.72rem', color: '#71717a', borderTop: '1px solid #1f2128', paddingTop: '0.75rem' }}>
              <span>Both alerts start on 1 Nov, the day prices and the offer changed: a business change, not a data bug.</span>
              <span style={{ fontStyle: 'italic' }}>Curves are illustrative.</span>
            </div>
          </div>
        </div>


        {/* ========================================================= */}
        {/* 2 · SIGNALS & INSPECTOR */}
        {/* ========================================================= */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.6rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
              2 · Signals
            </h2>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a' }}>
              REFERENCE VS LAST 7 DAYS · CLICK A ROW
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.25rem' }}>
            
            {/* Left: Signals Table */}
            <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #23252a', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.08em', color: '#71717a' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>SIGNAL</th>
                    <th style={{ padding: '0.75rem 0.75rem' }}>KIND</th>
                    <th style={{ padding: '0.75rem 0.75rem' }}>TEST</th>
                    <th style={{ padding: '0.75rem 0.75rem' }}>WHAT CHANGED</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>WEIGHT</th>
                  </tr>
                </thead>
                <tbody>
                  {state.signals.map((sig, idx) => {
                    const isSelected = idx === selectedSignalIndex;
                    return (
                      <tr
                        key={sig.signal}
                        onClick={() => setSelectedSignalIndex(idx)}
                        style={{
                          borderBottom: '1px solid #1a1b1f',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono, monospace)', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#f59e0b' : '#e5e7eb' }}>
                          {sig.signal}
                        </td>
                        <td style={{ padding: '0.75rem 0.75rem', color: '#9ca3af', fontSize: '0.74rem' }}>
                          {sig.kind}
                        </td>
                        <td style={{ padding: '0.75rem 0.75rem', fontFamily: 'var(--font-mono, monospace)', color: '#d1d5db', fontSize: '0.74rem' }}>
                          {sig.test}
                        </td>
                        <td style={{ padding: '0.75rem 0.75rem', color: '#9ca3af', fontSize: '0.74rem', maxWidth: '240px' }}>
                          {sig.what_changed}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', color: sig.weight.startsWith('#1') ? '#f59e0b' : '#71717a' }}>
                          {sig.weight}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Subtitle footnote */}
              <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid #1f2128', fontSize: '0.7rem', color: '#71717a', lineHeight: '1.45' }}>
                A column is flagged after two checks in a row above the drift threshold. Columns dropped in 06 (customer_id, cancel_date) are not monitored. Weight = the column's rank in "What drives the model" from 06. Rows are sorted by distance x weight: a drift on contract (#1) matters more than on city (#9).
              </div>
            </div>

            {/* Right: Interactive Signal Inspector Card */}
            {currentSignal && (
              <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: '1.35rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
                      {currentSignal.signal}
                    </h3>
                    {currentSignal.is_drift && (
                      <span style={{ border: '1px solid #f59e0b', color: '#f59e0b', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', letterSpacing: '0.1em', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                        DRIFT
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.08em', color: '#71717a', marginBottom: '1.5rem' }}>
                    {currentSignal.kind.toUpperCase()} · {currentSignal.test.toUpperCase()}
                  </div>

                  {/* Vertical bar comparison */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3rem', height: '140px', borderBottom: '1px solid #23252a', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    {/* Train Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <div
                        style={{
                          width: '36px',
                          height: `${Math.max(20, (currentSignal.inspector.train_bars[0]?.pct || 30) * 1.5)}px`,
                          border: '1px solid #52525b',
                          backgroundColor: 'transparent',
                          borderRadius: '2px',
                        }}
                      />
                      <span style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono, monospace)' }}>
                        Looks like train
                      </span>
                    </div>

                    {/* Live Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <div
                        style={{
                          width: '36px',
                          height: `${Math.max(25, (currentSignal.inspector.live_bars[0]?.pct || 70) * 1.5)}px`,
                          backgroundColor: '#f59e0b',
                          borderRadius: '2px',
                        }}
                      />
                      <span style={{ fontSize: '0.68rem', color: '#d1d5db', fontFamily: 'var(--font-mono, monospace)' }}>
                        Looks like live
                      </span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono, monospace)', marginBottom: '1rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ width: '10px', height: '10px', border: '1px solid #71717a', display: 'inline-block' }} />
                      Train · v3
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ width: '10px', height: '10px', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                      Live · last 7 days
                    </span>
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: '0.74rem', color: '#9ca3af', lineHeight: '1.45', marginBottom: '1rem' }}>
                    {currentSignal.inspector.description}
                  </p>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowClassifierModal(true)}
                    style={{
                      width: '100%',
                      backgroundColor: '#18191c',
                      border: '1px solid #2a2c33',
                      color: '#e5e7eb',
                      padding: '0.45rem',
                      borderRadius: '4px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <span>Open classifier report</span>
                    <ExternalLink size={12} />
                  </button>
                  <div style={{ fontSize: '0.65rem', color: '#52525b', textAlign: 'center', marginTop: '0.4rem', fontStyle: 'italic' }}>
                    Bar lengths are illustrative.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>


        {/* ========================================================= */}
        {/* 3 · DATA QUALITY */}
        {/* ========================================================= */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.6rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
              3 · Data quality
            </h2>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a' }}>
              BROKEN DATA IS A PIPELINE PROBLEM, NOT A DRIFT
            </span>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setQualityFilter('FAIL')}
              style={{
                backgroundColor: qualityFilter === 'FAIL' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                border: '1px solid #ef4444',
                color: '#ef4444',
                padding: '0.25rem 0.65rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.68rem',
                cursor: 'pointer',
              }}
            >
              {quality_summary.failed} FAILED
            </button>
            <button
              type="button"
              onClick={() => setQualityFilter('WARN')}
              style={{
                backgroundColor: qualityFilter === 'WARN' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                border: '1px solid #f59e0b',
                color: '#f59e0b',
                padding: '0.25rem 0.65rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.68rem',
                cursor: 'pointer',
              }}
            >
              {quality_summary.to_review} TO REVIEW
            </button>
            <button
              type="button"
              onClick={() => setQualityFilter('PASS')}
              style={{
                backgroundColor: qualityFilter === 'PASS' ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
                border: '1px solid #52525b',
                color: '#9ca3af',
                padding: '0.25rem 0.65rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.68rem',
                cursor: 'pointer',
              }}
            >
              {quality_summary.passed} PASSED
            </button>
            <button
              type="button"
              onClick={() => setQualityFilter('ALL')}
              style={{
                backgroundColor: qualityFilter === 'ALL' ? '#23252a' : 'transparent',
                border: '1px solid #23252a',
                color: '#d1d5db',
                padding: '0.25rem 0.65rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.68rem',
                cursor: 'pointer',
              }}
            >
              ALL
            </button>
          </div>

          {/* Quality Checks Table */}
          <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #23252a', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.08em', color: '#71717a' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>CHECK</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>WHERE</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>LIVE</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>EXPECTED</th>
                  <th style={{ padding: '0.75rem 0.75rem' }}>STATUS</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredQualityChecks.map((q) => (
                  <tr key={q.id} style={{ borderBottom: '1px solid #1a1b1f' }}>
                    <td style={{ padding: '0.75rem 1rem', color: '#e5e7eb', fontWeight: 500 }}>
                      {q.check_type}
                    </td>
                    <td style={{ padding: '0.75rem 0.75rem', fontFamily: 'var(--font-mono, monospace)', color: '#d1d5db', fontSize: '0.74rem' }}>
                      {q.where_column}
                    </td>
                    <td style={{ padding: '0.75rem 0.75rem', color: '#9ca3af', fontSize: '0.74rem' }}>
                      {q.live_val}
                    </td>
                    <td style={{ padding: '0.75rem 0.75rem', fontFamily: 'var(--font-mono, monospace)', color: '#71717a', fontSize: '0.74rem' }}>
                      {q.expected_val}
                    </td>
                    <td style={{ padding: '0.75rem 0.75rem' }}>
                      <span
                        style={{
                          border: `1px solid ${q.status === 'FAIL' ? '#ef4444' : q.status === 'WARN' ? '#f59e0b' : '#3f3f46'}`,
                          color: q.status === 'FAIL' ? '#ef4444' : q.status === 'WARN' ? '#f59e0b' : '#71717a',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: '0.62rem',
                          letterSpacing: '0.08em',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '2px',
                        }}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      {q.action_button ? (
                        <button
                          type="button"
                          onClick={() => navigate('/cleaning')}
                          style={{
                            backgroundColor: '#18191c',
                            border: '1px solid #2a2c33',
                            color: '#e5e7eb',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '3px',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                          }}
                        >
                          {q.action_button}
                        </button>
                      ) : (
                        <span style={{ color: '#52525b', fontFamily: 'var(--font-mono, monospace)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>


        {/* ========================================================= */}
        {/* 4 · IMPACT ON THE MODEL */}
        {/* ========================================================= */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.6rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
              4 · Impact on the model
            </h2>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a' }}>
              UNTIL OUTCOMES ARRIVE, QUALITY IS ESTIMATED
            </span>
          </div>

          {/* 3 Top Impact Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
            {/* ESTIMATED RECALL */}
            <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1rem 1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a', marginBottom: '0.35rem' }}>
                RECALL · YES · ESTIMATED
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.5rem', color: '#f59e0b', fontWeight: 600 }}>
                {Math.round(model_impact.recall_yes_estimated * 100)}%
              </div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.25rem' }}>
                without labels · from the model's own confidence
              </div>
            </div>

            {/* SCORED YES LIVE VS TRAIN */}
            <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1rem 1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a', marginBottom: '0.35rem' }}>
                SCORED YES · LIVE VS TRAIN
              </div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.5rem', color: '#f3f4f6', fontWeight: 600 }}>
                {model_impact.scored_yes_live_pct}% vs {model_impact.scored_yes_train_pct}%
              </div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.25rem' }}>
                share above the 0.42 threshold
              </div>
            </div>

            {/* MEASURED RECALL */}
            <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1rem 1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a', marginBottom: '0.35rem' }}>
                RECALL · YES · MEASURED
              </div>
              <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: '1.5rem', color: '#71717a', fontWeight: 400 }}>
                {typeof model_impact.recall_yes_measured === 'number' ? `${Math.round(model_impact.recall_yes_measured * 100)}%` : 'waiting'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.25rem' }}>
                outcomes for this window arrive on 1 Dec
              </div>
            </div>
          </div>

          {/* Segment Breakdown Table */}
          <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #23252a', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.08em', color: '#71717a' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>SEGMENT · LIVE</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ROWS</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>RECALL YES · EST.</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>FLAG</th>
                </tr>
              </thead>
              <tbody>
                {model_impact.segments.map((seg, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1a1b1f' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono, monospace)', color: '#e5e7eb' }}>
                      {seg.segment_name}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', color: '#d1d5db' }}>
                      {seg.rows_count != null ? seg.rows_count.toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', color: '#f59e0b' }}>
                      {Math.round(seg.recall_yes_est * 100)}%
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <span
                        style={{
                          border: `1px solid ${
                            seg.flag === 'DRIFT'
                              ? '#ef4444'
                              : seg.flag === 'NEW'
                              ? '#f59e0b'
                              : seg.flag === 'WATCH'
                              ? '#d97706'
                              : '#3f3f46'
                          }`,
                          color:
                            seg.flag === 'DRIFT'
                              ? '#ef4444'
                              : seg.flag === 'NEW'
                              ? '#f59e0b'
                              : seg.flag === 'WATCH'
                              ? '#d97706'
                              : '#71717a',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: '0.62rem',
                          letterSpacing: '0.08em',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '2px',
                        }}
                      >
                        {seg.flag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #1f2128', fontSize: '0.7rem', color: '#71717a' }}>
              Segments are the drifted values plus the weak slices found in 06.
            </div>
          </div>
        </div>


        {/* ========================================================= */}
        {/* 5 · WHAT TO DO (4 DECISION CARDS) */}
        {/* ========================================================= */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.6rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
              5 · What to do
            </h2>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a' }}>
              A DRIFT OPENS WORK, NEVER A RELEASE
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {decisions.map((card, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: '#121316',
                  border: card.is_recommended ? '1px solid #f59e0b' : '1px solid #23252a',
                  borderRadius: '4px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: card.is_recommended ? '0 0 15px rgba(245, 158, 11, 0.08)' : 'none',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.65rem',
                      letterSpacing: '0.1em',
                      color: card.is_recommended ? '#f59e0b' : '#71717a',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {card.category}
                  </div>
                  <h4 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: '1.15rem', color: '#f3f4f6', margin: '0 0 0.5rem 0', fontWeight: 400 }}>
                    {card.title}
                  </h4>
                  <p style={{ fontSize: '0.74rem', color: '#9ca3af', lineHeight: '1.45', margin: '0 0 1.25rem 0' }}>
                    {card.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDecisionAction(card.action_type)}
                  style={{
                    width: '100%',
                    backgroundColor: card.is_recommended ? '#f59e0b' : '#18191c',
                    border: card.is_recommended ? 'none' : '1px solid #2a2c33',
                    color: card.is_recommended ? '#0c0d0e' : '#e5e7eb',
                    fontWeight: card.is_recommended ? 600 : 400,
                    padding: '0.5rem',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {card.button_label}
                </button>
              </div>
            ))}
          </div>
        </div>


        {/* ========================================================= */}
        {/* 6 · MONITORING & THRESHOLDS */}
        {/* ========================================================= */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.6rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
              6 · Monitoring
            </h2>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a' }}>
              CHECKS RUN ON THEIR OWN; RETRAINING NEVER DOES
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.25rem' }}>
            
            {/* Left: Automated Monitoring Rules */}
            <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={16} style={{ color: '#22c55e', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '0.8rem' }}>Check every day at 06:00</div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a' }}>On the last 7 days · at least 500 rows</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={16} style={{ color: '#22c55e', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '0.8rem' }}>Alert after 2 checks in a row</div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a' }}>One noisy day does not raise an alert</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={16} style={{ color: '#22c55e', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '0.8rem' }}>Email the owner and the reviewer</div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a' }}>With the drifted columns and segments</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={16} style={{ color: '#22c55e', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '0.8rem' }}>Start a 07 round when a column drifts</div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a' }}>Picks focus on the drifted segment</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Check size={16} style={{ color: '#22c55e', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '0.8rem' }}>Re-measure when outcomes arrive</div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a' }}>Measured recall replaces the estimate after 60 days</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ color: '#52525b', fontFamily: 'var(--font-mono, monospace)', marginLeft: '3px', marginRight: '4px' }}>—</span>
                <div>
                  <div style={{ color: '#71717a', fontWeight: 500, fontSize: '0.8rem' }}>Retrain automatically</div>
                  <div style={{ fontSize: '0.72rem', color: '#52525b' }}>Not available · always reviewed in 06</div>
                </div>
              </div>
            </div>

            {/* Right: Thresholds Form & CLI & Buttons */}
            <div style={{ backgroundColor: '#121316', border: '1px solid #23252a', borderRadius: '4px', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.15rem', color: '#f3f4f6', margin: '0 0 1rem 0', fontWeight: 400 }}>
                  Thresholds
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', color: '#71717a', marginBottom: '0.25rem' }}>
                      PSI · WATCH FROM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={psiWatchInput}
                      onChange={(e) => setPsiWatchInput(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#18191c',
                        border: '1px solid #2a2c33',
                        color: '#f3f4f6',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.78rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', color: '#71717a', marginBottom: '0.25rem' }}>
                      PSI · DRIFT FROM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={psiDriftInput}
                      onChange={(e) => setPsiDriftInput(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#18191c',
                        border: '1px solid #2a2c33',
                        color: '#f3f4f6',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.78rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', color: '#71717a', marginBottom: '0.25rem' }}>
                      WINDOW
                    </label>
                    <input
                      type="number"
                      value={windowDaysInput}
                      onChange={(e) => setWindowDaysInput(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#18191c',
                        border: '1px solid #2a2c33',
                        color: '#f3f4f6',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.78rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', color: '#71717a', marginBottom: '0.25rem' }}>
                      MIN ROWS
                    </label>
                    <input
                      type="number"
                      value={minRowsInput}
                      onChange={(e) => setMinRowsInput(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#18191c',
                        border: '1px solid #2a2c33',
                        color: '#f3f4f6',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.78rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.62rem', color: '#71717a', marginBottom: '0.25rem' }}>
                    SEND ALERTS TO
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.74rem', color: '#d1d5db', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={emailAlertsChecked}
                      onChange={(e) => setEmailAlertsChecked(e.target.checked)}
                      style={{ accentColor: '#f59e0b' }}
                    />
                    <span>Email owner + reviewer</span>
                  </label>
                </div>
              </div>

              <div>
                {/* CLI Command snippet */}
                <div
                  style={{
                    backgroundColor: '#0c0d0e',
                    border: '1px solid #1f2128',
                    borderRadius: '3px',
                    padding: '0.5rem 0.75rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    color: '#9ca3af',
                    marginBottom: '0.85rem',
                    wordBreak: 'break-all',
                  }}
                >
                  {cli_command}
                </div>

                {/* Actions row: Save settings, Run check now, Download report */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings}
                    style={{
                      flex: 1,
                      backgroundColor: '#18191c',
                      border: '1px solid #2a2c33',
                      color: '#e5e7eb',
                      padding: '0.45rem',
                      borderRadius: '4px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {isSavingSettings ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                    <span>Save settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRunCheckNow}
                    disabled={isRunningCheck}
                    style={{
                      flex: 1.2,
                      backgroundColor: '#f59e0b',
                      border: 'none',
                      color: '#0c0d0e',
                      fontWeight: 600,
                      padding: '0.45rem',
                      borderRadius: '4px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {isRunningCheck ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                    <span>Run check now</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadReport}
                    title="Download full JSON drift report"
                    style={{
                      backgroundColor: '#18191c',
                      border: '1px solid #2a2c33',
                      color: '#71717a',
                      padding: '0.45rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* ========================================================= */}
        {/* 7 · GUARDRAILS BEFORE ALERTING */}
        {/* ========================================================= */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.6rem', fontWeight: 400, color: '#f3f4f6', margin: 0 }}>
              Guardrails before alerting
            </h2>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#71717a' }}>
              NO FALSE ALARMS ON NOISY BATCHES
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {guardrails.map((g) => (
              <div
                key={g.id}
                style={{
                  backgroundColor: '#121316',
                  border: '1px solid #23252a',
                  borderRadius: '4px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                }}
              >
                {g.status === 'ok' ? (
                  <Check size={15} style={{ color: '#22c55e', marginTop: '2px', flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={15} style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ color: '#e5e7eb', fontWeight: 500, fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                    {g.title}
                  </div>
                  <div style={{ color: '#71717a', fontSize: '0.7rem', lineHeight: '1.4' }}>
                    {g.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>


      {/* ========================================================= */}
      {/* BOTTOM STICKY BAR */}
      {/* ========================================================= */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: '#0c0d0e',
          borderTop: '1px solid #23252a',
          padding: '0.85rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 -10px 30px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.82rem', color: '#e5e7eb' }}>
            <strong style={{ color: '#f59e0b' }}>{header.drifting_columns_count} columns drifting</strong> · {header.drifting_columns.join(', ')} · estimated recall down 4%
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => navigate('/active-learning')}
            style={{
              backgroundColor: '#18191c',
              border: '1px solid #2a2c33',
              color: '#e5e7eb',
              padding: '0.55rem 1.15rem',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            Start focused round in 07
          </button>

          <button
            type="button"
            onClick={() => navigate('/export-api')}
            style={{
              backgroundColor: '#f59e0b',
              border: 'none',
              color: '#0c0d0e',
              fontWeight: 600,
              padding: '0.55rem 1.25rem',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <span>Continue to export →</span>
          </button>
        </div>
      </div>


      {/* ========================================================= */}
      {/* MODAL: DRIFT HISTORY */}
      {/* ========================================================= */}
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
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#121316',
              border: '1px solid #23252a',
              borderRadius: '6px',
              width: '680px',
              maxWidth: '90vw',
              padding: '1.75rem',
              color: '#e5e7eb',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: '1.5rem', fontWeight: 400, margin: 0, color: '#f3f4f6' }}>
                  Historique des vérifications de dérive
                </h3>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: '#71717a', marginTop: '0.2rem' }}>
                  JOURNAL DES RUNS QUOTIDIENS ET CALCULS IMMÉDIATS
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '1.25rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #23252a', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.65rem', color: '#71717a', textAlign: 'left' }}>
                    <th style={{ padding: '0.6rem 0.75rem' }}>DATE / HEURE</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>MODÈLE</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>FENÊTRE</th>
                    <th style={{ padding: '0.6rem 0.75rem' }}>DÉRIVES DÉTECTÉES</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>RAPPEL ESTIMÉ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #1a1b1f' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono, monospace)' }}>Aujourd'hui 06:00</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{header.production_model_name}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>7 jours</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#f59e0b', fontWeight: 500 }}>{header.drifting_columns.join(', ')}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#f59e0b', fontFamily: 'var(--font-mono, monospace)' }}>{Math.round(model_impact.recall_yes_estimated * 100)}%</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1a1b1f' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono, monospace)' }}>Hier 06:00</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{header.production_model_name}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>7 jours</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#f59e0b', fontWeight: 500 }}>{header.drifting_columns.join(', ')}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#f59e0b', fontFamily: 'var(--font-mono, monospace)' }}>79%</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #1a1b1f' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono, monospace)' }}>2 Nov 06:00</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{header.production_model_name}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>7 jours</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#71717a' }}>Aucune</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#22c55e', fontFamily: 'var(--font-mono, monospace)' }}>82%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{
                  backgroundColor: '#18191c',
                  border: '1px solid #2a2c33',
                  color: '#e5e7eb',
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================= */}
      {/* MODAL: MULTIVARIATE CLASSIFIER REPORT */}
      {/* ========================================================= */}
      {showClassifierModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#121316',
              border: '1px solid #23252a',
              borderRadius: '6px',
              width: '620px',
              maxWidth: '90vw',
              padding: '1.75rem',
              color: '#e5e7eb',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: '1.5rem', fontWeight: 400, margin: 0, color: '#f3f4f6' }}>
                  Rapport du Classifieur Multivarié
                </h3>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', color: '#71717a', marginTop: '0.2rem' }}>
                  DISCRIMINATION ENTRE DONNÉES ENTRAÎNEMENT ET PRODUCTION
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClassifierModal(false)}
                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ backgroundColor: '#18191c', padding: '0.75rem', borderRadius: '4px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: 'var(--font-mono, monospace)' }}>AUC-ROC</div>
                <div style={{ fontSize: '1.4rem', color: '#f59e0b', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>0.81</div>
                <div style={{ fontSize: '0.65rem', color: '#ef4444' }}>Dérive détectée (&gt; 0.65)</div>
              </div>
              <div style={{ backgroundColor: '#18191c', padding: '0.75rem', borderRadius: '4px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: 'var(--font-mono, monospace)' }}>PRECISION LIVE</div>
                <div style={{ fontSize: '1.4rem', color: '#e5e7eb', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>74%</div>
                <div style={{ fontSize: '0.65rem', color: '#71717a' }}>Séparation nette</div>
              </div>
              <div style={{ backgroundColor: '#18191c', padding: '0.75rem', borderRadius: '4px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#71717a', fontFamily: 'var(--font-mono, monospace)' }}>SIGNALS DOMINANTS</div>
                <div style={{ fontSize: '1.4rem', color: '#e5e7eb', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>2</div>
                <div style={{ fontSize: '0.65rem', color: '#71717a' }}>contract, charges</div>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.7rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>
                Colonnes les plus contributives à la séparation:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#e5e7eb', marginBottom: '0.2rem' }}>
                    <span>contract</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#f59e0b' }}>48%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#1f2128', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '48%', height: '100%', backgroundColor: '#f59e0b' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#e5e7eb', marginBottom: '0.2rem' }}>
                    <span>monthly_charges</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#ef4444' }}>32%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#1f2128', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '32%', height: '100%', backgroundColor: '#ef4444' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#e5e7eb', marginBottom: '0.2rem' }}>
                    <span>city (Tanger new category)</span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#a1a1aa' }}>12%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#1f2128', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '12%', height: '100%', backgroundColor: '#a1a1aa' }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowClassifierModal(false)}
                style={{
                  backgroundColor: '#18191c',
                  border: '1px solid #2a2c33',
                  color: '#e5e7eb',
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
