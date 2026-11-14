import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  ImageDriftDataResponse,
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

export const ImageDriftPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<ImageDriftDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Signal for Section 2 Inspection Panel
  const [selectedSignalId, setSelectedSignalId] = useState<string>('brightness_cam_4');

  // Quality Checks Filter
  const [qualityFilter, setQualityFilter] = useState<'all' | 'failed' | 'warn' | 'passed'>('all');

  // Section 6 Monitoring Form Inputs
  const [ksWatch, setKsWatch] = useState<string>('0.10');
  const [ksDrift, setKsDrift] = useState<string>('0.20');
  const [windowDays, setWindowDays] = useState<string>('7 days');
  const [minFramesCam, setMinFramesCam] = useState<string>('200');
  const [sendEmail, setSendEmail] = useState<boolean>(true);
  const [sendSlack, setSendSlack] = useState<boolean>(true);
  const [sendWebhook, setSendWebhook] = useState<boolean>(false);

  // Section 6 Checklist Toggles
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({
    'Device stats every hour': true,
    'Random frames every day': true,
    'Alert after 3 checks in a row': true,
    'New camera → 300 random frames to 07': true,
    'Email the line manager': true,
    'Retrain automatically': false,
  });

  // Modals & Feedback
  const [notification, setNotification] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showAdoptModal, setShowAdoptModal] = useState<boolean>(false);
  const [showDeviceModal, setShowDeviceModal] = useState<boolean>(false);
  const [reportNote, setReportNote] = useState<string>(
    'Anomalie de luminosité constatée sur line 2 · cam 4 depuis le 3 Nov (travail de nuit). Merci de vérifier le projecteur d\'éclairage ou de nettoyer l\'optique.'
  );

  // Load image datasets on mount
  useEffect(() => {
    async function loadDatasets() {
      try {
        const list = await api.getDatasets();
        const imageDatasets = list.filter((d) => {
          const name = d.name.toLowerCase();
          return (
            name.includes('defect') ||
            name.includes('product') ||
            name.includes('image') ||
            name.includes('vision') ||
            name.includes('solar') ||
            name.endsWith('.zip') ||
            name.endsWith('.tar')
          );
        });
        const usableList = imageDatasets.length > 0 ? imageDatasets : list;
        setDatasets(usableList);

        const stored = localStorage.getItem('datalift_selected_dataset_id');
        const match = usableList.find((d) => d.id === stored);
        const preferred =
          match ||
          usableList.find((d) => d.name.toLowerCase().includes('product_defects')) ||
          usableList[0];
        if (preferred) {
          setSelectedDatasetId(preferred.id);
        }
      } catch (err: any) {
        setError('Erreur de chargement des jeux de données image: ' + (err.message || 'inconnu'));
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
      const res = await api.getImageDriftData(datasetId);
      setData(res);
      if (res.monitoring?.thresholds) {
        setKsWatch(res.monitoring.thresholds.ks_watch_from.toFixed(2));
        setKsDrift(res.monitoring.thresholds.ks_drift_from.toFixed(2));
        setWindowDays(res.monitoring.thresholds.window);
        setMinFramesCam(res.monitoring.thresholds.min_frames_cam.toString());
        setSendEmail(res.monitoring.thresholds.send_email);
        setSendSlack(res.monitoring.thresholds.send_slack);
        setSendWebhook(res.monitoring.thresholds.send_webhook);
      }
      if (res.signals && res.signals.length > 0) {
        setSelectedSignalId(res.signals[1]?.id || res.signals[0].id);
      }
    } catch (err: any) {
      setError('Erreur lors du chargement des données de dérive image: ' + (err.message || 'inconnu'));
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
      await api.saveImageDriftSettings(selectedDatasetId, {
        ks_watch_from: parseFloat(ksWatch),
        ks_drift_from: parseFloat(ksDrift),
        window: windowDays,
        min_frames_cam: parseInt(minFramesCam, 10) || 200,
        send_email: sendEmail,
        send_slack: sendSlack,
        send_webhook: sendWebhook,
      });
      setNotification('✓ Paramètres de dérive image sauvegardés avec succès.');
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde: ' + (err.message || 'inconnu'));
    }
  };

  const handleRunCheckNow = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.runImageDriftCheck(selectedDatasetId);
      setNotification(`✓ Vérification CV terminée: score = ${res.drift_score} (${res.status_label}).`);
      setTimeout(() => setNotification(null), 4000);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      setError("Erreur lors de l'exécution du test: " + (err.message || 'inconnu'));
    }
  };

  const handleSendTo07 = async (count: number = 300) => {
    if (!selectedDatasetId) return;
    try {
      await api.sendImageDriftTo07(selectedDatasetId, { count });
      setNotification(`✓ ${count} images ciblées envoyées vers 07 Active learning.`);
      setTimeout(() => {
        setNotification(null);
        navigate('/image-active-learning');
      }, 1400);
    } catch (err: any) {
      setError("Erreur lors de l'envoi vers 07: " + (err.message || 'inconnu'));
    }
  };

  const handleAdoptReference = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.adoptImageDriftReference(selectedDatasetId, { camera: 'cam 6' });
      setShowAdoptModal(false);
      setNotification('✓ Cam 6 adoptée comme nouvelle référence.');
      setTimeout(() => setNotification(null), 3500);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      setError("Erreur lors de l'adoption: " + (err.message || 'inconnu'));
    }
  };

  const handleReportToLine = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.reportImageDriftToLine(selectedDatasetId, {
        camera: 'cam 4',
        note: reportNote,
      });
      setShowReportModal(false);
      setNotification('✓ Rapport d\'incident transmis à l\'équipe maintenance ligne.');
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setError("Erreur lors du signalement: " + (err.message || 'inconnu'));
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

  // Dynamic visual details for the right inspection panel
  const inspectionDetails = useMemo(() => {
    if (!selectedSignal) {
      return {
        labels: data?.selected_signal_detail?.labels || ['Very dark', 'Dark', 'Normal', 'Bright', 'Very bright'],
        trainBars: data?.selected_signal_detail?.train_bars || [15, 38, 88, 45, 18],
        liveBars: data?.selected_signal_detail?.live_bars || [40, 52, 70, 36, 16],
        text: data?.selected_signal_detail?.description || 'Only night shifts moved. Too-dark frames hide scratches; 02 already sends frames under the brightness floor to cleaning, not to labeling.',
        badge: 'DRIFT',
        badgeColor: '#ef4444',
        subtitle: 'IMAGE STAT · KS',
      };
    }

    const sid = selectedSignal.id;
    if (sid === 'brightness_cam_4' || sid === 'exposure_drift') {
      return {
        labels: data?.selected_signal_detail?.labels || ['Very dark', 'Dark', 'Normal', 'Bright', 'Very bright'],
        trainBars: data?.selected_signal_detail?.train_bars || [15, 38, 88, 45, 18],
        liveBars: data?.selected_signal_detail?.live_bars || [40, 52, 70, 36, 16],
        text: data?.selected_signal_detail?.description || 'Only night shifts moved. Too-dark frames hide scratches; 02 already sends frames under the brightness floor to cleaning, not to labeling.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'new_cam_6') {
      return {
        labels: ['Angle A', 'Angle B', 'Angle C', 'Angle D', 'New Cam 6'],
        trainBars: [45, 52, 48, 40, 0],
        liveBars: [42, 49, 44, 38, 41],
        text: 'New camera installed on Line 1 on 5 Nov with an altered point-of-view angle never seen during v3 training. Requires 300 labeled frames in 07.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'sharpness_cam_2' || sid === 'blur_stat') {
      return {
        labels: ['Sharp', 'Optimal', 'Slight blur', 'Blurry'],
        trainBars: [75, 20, 5, 0],
        liveBars: [48, 32, 16, 4],
        text: 'Laplacian focal sharpness steadily degrading over the last 3 weeks on Cam 2. Likely optical lens dust deposition requiring manual cleaning.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'mean_confidence') {
      return {
        labels: ['>0.90', '0.75-0.90', '0.60-0.75', '<0.60'],
        trainBars: [68, 22, 8, 2],
        liveBars: [44, 32, 16, 8],
        text: 'Average model detection confidence noticeably decreased on Cam 4 and Cam 6 only. The rest of the vision fleet remains unaffected.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    if (sid === 'boxes_per_frame' || sid === 'aspect_ratio') {
      return {
        labels: ['0 boxes', '1 box', '2-3 boxes', '>3 boxes'],
        trainBars: [45, 35, 16, 4],
        liveBars: [44, 36, 16, 4],
        text: 'Bounding box density per frame is identical to the baseline training set. No defect count clustering anomaly detected.',
        badge: selectedSignal.status,
        badgeColor: selectedSignal.status_type === 'red' ? '#ef4444' : selectedSignal.status_type === 'amber' ? C.amber : '#9ca3af',
        subtitle: `${selectedSignal.kind.toUpperCase()} · ${selectedSignal.test.toUpperCase()}`,
      };
    }

    return {
      labels: data?.selected_signal_detail?.labels || ['Class A', 'Class B', 'Class C', 'Class D', 'Shift'],
      trainBars: data?.selected_signal_detail?.train_bars || [60, 70, 65, 50, 0],
      liveBars: data?.selected_signal_detail?.live_bars || [58, 68, 62, 52, 35],
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
            Chargement des données de dérive image...
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
            'DRIFT · WATCHING YOLO-DEFECTS-V3 ON THE LINE MINI PCS · OBJECT DETECTION · 6 CLASSES'}
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
              {data?.display_title || `${data?.dataset_name || 'product_defects'}/`}
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
              {data?.alert_badge?.count || '02'}
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
              {data?.alert_badge?.label || 'CAMERAS DRIFTING'}
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
            {data?.metrics?.reference || 'defects@v3'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.reference_sub || 'train split used by yolo-defects-v3'}
          </div>
        </div>

        {/* LIVE WINDOW */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            LIVE WINDOW
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.live_window || '7 days'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.live_window_sub || '48,300 frames seen · 6,950 uploaded'}
          </div>
        </div>

        {/* SIGNALS WATCHED */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            SIGNALS WATCHED
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.signals_watched || '8 × cam'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.signals_watched_sub || 'every signal, camera by camera'}
          </div>
        </div>

        {/* LAST CHECK */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            LAST CHECK
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.last_check || '16:00'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.last_check_sub || 'device stats hourly · images daily'}
          </div>
        </div>
      </div>

      {/* Explanatory Banner: HOW DRIFT WORKS FOR IMAGES */}
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
          {data?.info_banner?.title || 'HOW DRIFT WORKS FOR IMAGES'}
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
            'The mini PCs already run the model on every frame. Each hour they send small statistics (brightness, sharpness, boxes per frame, confidence), and the random 1-in-200 frames reach Datalift. Both are compared with the images yolo-defects-v3 was trained on, camera by camera, because one camera can drift while the others stay fine.'}
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
              <span>brightness · cam 4</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f87171' }}>
              <span style={{ fontWeight: 'bold' }}>—</span>
              <span>new cam 6</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#9ca3af' }}>
              <span style={{ fontWeight: 'bold' }}>---</span>
              <span>sharpness · cam 2</span>
            </div>
          </div>

          {/* Time Series SVG Chart */}
          <div style={{ height: '220px', width: '100%', position: 'relative' }}>
            <svg viewBox="0 0 800 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              {/* 0.50 Line */}
              <text x="35" y="24" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="end">
                0.50
              </text>
              <line x1="45" y1="20" x2="780" y2="20" stroke="#1f232b" strokeWidth="1" />

              {/* 0.20 - Drift threshold */}
              <text x="35" y="94" fill="#f59e0b" fontSize="10" fontFamily="monospace" textAnchor="end">
                0.20
              </text>
              <line
                x1="45"
                y1="90"
                x2="780"
                y2="90"
                stroke="#d97706"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                opacity="0.75"
              />

              {/* 0.10 - Watch threshold */}
              <text x="35" y="134" fill="#fbbf24" fontSize="10" fontFamily="monospace" textAnchor="end">
                0.10
              </text>
              <line
                x1="45"
                y1="130"
                x2="780"
                y2="130"
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

              {/* Event Marker 1: 3 Nov lamp changed */}
              <line x1="590" y1="20" x2="590" y2="170" stroke="#4b5563" strokeWidth="1" strokeDasharray="3 3" />
              <text x="595" y="22" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                3 Nov · lamp changed
              </text>

              {/* Event Marker 2: 5 Nov cam 6 installed */}
              <line x1="630" y1="20" x2="630" y2="170" stroke="#4b5563" strokeWidth="1" strokeDasharray="3 3" />
              <text x="635" y="36" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                5 Nov · cam 6 installed
              </text>

              {/* Series 3: sharpness · cam 2 (dashed gray climbing slowly) */}
              <path
                d="M 60 162 Q 150 156 240 155 T 400 150 T 540 144 T 620 138 T 710 134 T 770 130"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.85"
              />

              {/* Series 2: new cam 6 (starts on 5 Nov high and remains above 0.20) */}
              <path
                d="M 630 48 Q 670 56 710 52 T 745 62 T 770 52"
                fill="none"
                stroke="#f87171"
                strokeWidth="2.5"
              />

              {/* Series 1: brightness · cam 4 (sharp jump up on 3 Nov above 0.20) */}
              <path
                d="M 60 164 L 180 160 L 320 166 L 460 162 L 570 164 L 610 74 L 640 72 L 680 78 L 730 72 L 770 76"
                fill="none"
                stroke={C.amber}
                strokeWidth="2.8"
              />

              {/* X Axis Date Labels */}
              <text x="60" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                13 Oct
              </text>
              <text x="240" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                20 Oct
              </text>
              <text x="420" y="190" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
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
                'Cam 6 has no history before 5 Nov, so it starts above the drift line. Cam 2 is slowly getting blurrier: a lens to clean.'}
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
            REFERENCE VS LAST 7 DAYS
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
                Device statistics need no image upload. Only the random frames and the uncertain frames from 07 leave the line.
              </p>
              <p style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted, margin: 0 }}>
                Weight = how much the signal can hide a defect. Darkness and a new angle weigh more than the number of boxes.
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
                  {selectedSignal?.signal || 'brightness · line 2 · cam 4'}
                </h3>
                <span
                  style={{
                    fontSize: '0.6rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '2px',
                    fontWeight: 'bold',
                    border: `1px solid ${inspectionDetails.badgeColor}`,
                    color: inspectionDetails.badgeColor,
                    backgroundColor:
                      inspectionDetails.badgeColor === '#ef4444'
                        ? 'rgba(239, 68, 68, 0.1)'
                        : inspectionDetails.badgeColor === C.amber
                        ? 'rgba(245, 158, 11, 0.1)'
                        : 'transparent',
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
                  {inspectionDetails.labels.map((lbl, idx) => {
                    const trainH = inspectionDetails.trainBars[idx] ?? 40;
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
                  })}
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
                    <span>Live · last {data?.metrics?.live_window || '7 days'}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleSendTo07(300)}
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
                  Send night frames to 07
                </button>

                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
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
                  Report to the line
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
                          if (qc.action_key === 'report_line') setShowReportModal(true);
                          else if (qc.action_key === 'open_device') setShowDeviceModal(true);
                          else if (qc.action_key === 'review_02') navigate('/cleaning');
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
              'Quality runs before drift. Corrupt or too-dark frames go to 02, never to labeling, and are left out of the drift window.'}
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
            MEASURED PER CAMERA, NOT ONLY IN TOTAL
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
            { title: 'MAP@50 · ESTIMATED', value: '[RESULT]', tooltip: 'Estimated mAP@50: ~0.79', sub: "without labels · from the model's own confidence" },
            { title: 'CRACKS FLAGGED · CAM 4 & 6', value: '[RESULT]', tooltip: 'Discrepancy: -32%', sub: 'compared with the other cameras' },
            { title: 'CRACK RECALL · MEASURED', value: 'partial', tooltip: 'Measured recall: ~0.84', sub: 'from QC checks · about 3 days late' },
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
                <th style={{ padding: '0.6rem 0.5rem' }}>FRAMES</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>MAP@50 · EST.</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>FLAG</th>
              </tr>
            </thead>
            <tbody>
              {(data?.model_impact?.segments || []).map((seg, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: C.text }}>{seg.segment}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{seg.frames}</td>
                  <td
                    style={{ padding: '0.75rem 0.5rem', color: C.amber, fontWeight: 'bold' }}
                    title={seg.map_tooltip}
                  >
                    {seg.map_est}
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
            {data?.model_impact?.footnote ||
              'Counts are uploaded frames. Device statistics cover all 48,300 frames.'}
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
              title: 'The new camera stays',
              description: 'Cam 6 is permanent, so its view becomes normal once it is labeled. Add its frames to the reference after round 4.',
              action_label: 'Adopt cam 6 as reference',
              action_key: 'adopt_cam6',
              is_recommended: false,
            },
            {
              type: 'IF IT IS ON SITE',
              title: 'Fix the line, not the model',
              description: 'A changed lamp, a dirty lens or a moved camera. Send a note to the line manager with sample frames.',
              action_label: 'Report to the line',
              action_key: 'report_line',
              is_recommended: false,
            },
            {
              type: 'RECOMMENDED',
              title: 'The model has a gap',
              description: 'Label 300 random frames from cam 6 and the night frames from cam 4 in 07. Cold start before uncertainty works.',
              action_label: 'Start focused round in 07',
              action_key: 'start_07',
              is_recommended: true,
            },
            {
              type: 'THEN',
              title: 'Retrain and shadow',
              description: 'Retrain in 06 on v5, then shadow mode on one mini PC before the fleet.',
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
                  if (card.action_key === 'adopt_cam6') setShowAdoptModal(true);
                  else if (card.action_key === 'report_line') setShowReportModal(true);
                  else if (card.action_key === 'start_07') handleSendTo07(300);
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
              { label: 'Device stats every hour', sub: 'Brightness, sharpness, boxes and confidence per camera', checked: true },
              { label: 'Random frames every day', sub: '1 in 200 · the same rule as 07', checked: true },
              { label: 'Alert after 3 checks in a row', sub: 'A passing shadow does not raise an alert', checked: true },
              { label: 'New camera → 300 random frames to 07', sub: 'Cold start before uncertainty works', checked: true },
              { label: 'Email the line manager', sub: 'With sample frames from the camera', checked: true },
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

              {/* KS Distances Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.3rem' }}>
                    KS · WATCH FROM
                  </label>
                  <input
                    type="text"
                    value={ksWatch}
                    onChange={(e) => setKsWatch(e.target.value)}
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
                    KS · DRIFT FROM
                  </label>
                  <input
                    type="text"
                    value={ksDrift}
                    onChange={(e) => setKsDrift(e.target.value)}
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

              {/* Window & Min Frames / Cam Row */}
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
                    MIN FRAMES / CAM
                  </label>
                  <input
                    type="text"
                    value={minFramesCam}
                    onChange={(e) => setMinFramesCam(e.target.value)}
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
                  'datalift drift yolo-defects-v3 --ref defects@v3 --window 7d --per-camera'}
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
                  setNotification('✓ Rapport de dérive image exporté avec succès (format PDF / JSON).');
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
            { title: 'Checked camera by camera', desc: 'One camera cannot hide in the total', status: 'ok' },
            { title: 'Reference is the production train split', desc: 'Never test images, never copy-paste images', status: 'ok' },
            { title: 'Too dark goes to 02', desc: 'Not to labeling', status: 'ok' },
            { title: 'Stats need no upload', desc: 'Images stay on the line unless picked', status: 'ok' },
            { title: 'Small windows are not judged', desc: 'Under 200 frames per camera the check waits', status: 'ok' },
            { title: 'Every check is stored', desc: 'Window, camera, reference hash, threshold', status: 'ok' },
            { title: 'No automatic retrain', desc: 'Shadow on one device before the fleet', status: 'ok' },
            { title: 'Crack is rare', desc: 'Crack recall is measured weekly, not daily', status: 'warn' },
          ]).map((g, idx) => {
            const isWarn = g.status === 'warn';
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: C.card,
                  border: isWarn ? '1px solid rgba(245, 158, 11, 0.4)' : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                }}
              >
                <div style={{ marginTop: '0.1rem' }}>
                  {isWarn ? (
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
                      color: isWarn ? C.amberLight : C.text,
                      marginBottom: '0.2rem',
                    }}
                  >
                    {g.title}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                    {g.desc}
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
            {data?.bottom_bar?.title || 'yolo-defects-v3 · cam 4 darker at night · new cam 6'}
          </div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
            {data?.bottom_bar?.sub || 'Recommended: 300 random frames from cam 6 and the night frames from cam 4 to 07'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={() => handleSendTo07(300)}
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
            {data?.bottom_bar?.action_left || 'Start focused round in 07'}
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
                Vision drift history · {data?.dataset_name || 'product_defects'}
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
                  { date: '11 Nov 16:00', ref: 'defects@v3', window: '7 days (48,300 frames)', score: '0.26', status: 'ALERT' },
                  { date: '04 Nov 16:00', ref: 'defects@v3', window: '7 days (46,100 frames)', score: '0.12', status: 'WATCH' },
                  { date: '28 Oct 16:00', ref: 'defects@v3', window: '7 days (47,500 frames)', score: '0.07', status: 'STABLE' },
                  { date: '21 Oct 16:00', ref: 'defects@v3', window: '7 days (45,800 frames)', score: '0.06', status: 'STABLE' },
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
      {/* MODAL 2: REPORT TO THE LINE */}
      {/* ========================================================================= */}
      {showReportModal && (
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
                Report to the line · Maintenance dispatch
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.25rem' }}>
              Camera <strong>Line 2 · Cam 4</strong> detected a 6% dark frames spike during night shifts. A physical lamp replacement or angle misalignment may be present on the production conveyor.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                DISPATCH NOTE FOR LINE SUPERVISOR
              </label>
              <textarea
                rows={4}
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
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
                onClick={handleReportToLine}
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
                Send report to line
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADOPT CAM 6 AS REFERENCE */}
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
                Adopt Cam 6 as reference
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
              Cam 6 was permanently installed on Line 1 on 5 Nov. Adopting it will add its focal point and perspective to the reference training baseline distribution, resetting its new-camera drift alert.
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

      {/* ========================================================================= */}
      {/* MODAL 4: OPEN DEVICE DETAILS */}
      {/* ========================================================================= */}
      {showDeviceModal && (
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
              width: '560px',
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
                Edge mini PC status · Line 1 · Cam 3
              </h3>
              <button
                type="button"
                onClick={() => setShowDeviceModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.75rem', fontFamily: 'monospace', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.4rem' }}>
                <span style={{ color: C.textMuted }}>DEVICE IP :</span>
                <span style={{ color: C.text }}>192.168.10.43 (Line 1 Edge)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.4rem' }}>
                <span style={{ color: C.textMuted }}>UPTIME :</span>
                <span style={{ color: C.text }}>99.2% (rebooted yesterday · 40m offline)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.4rem' }}>
                <span style={{ color: C.textMuted }}>INFERENCE ACCELERATOR :</span>
                <span style={{ color: C.text }}>Intel OpenVINO NPU · 18ms / frame</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.4rem' }}>
                <span style={{ color: C.textMuted }}>CURRENT STREAM STATUS :</span>
                <span style={{ color: C.green, fontWeight: 'bold' }}>ONLINE · 30 FPS</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeviceModal(false);
                  setNotification('✓ Ping de diagnostic envoyé à la mini PC Line 1 Cam 3.');
                  setTimeout(() => setNotification(null), 3000);
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
                Run diagnostic ping
              </button>
              <button
                type="button"
                onClick={() => setShowDeviceModal(false)}
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

