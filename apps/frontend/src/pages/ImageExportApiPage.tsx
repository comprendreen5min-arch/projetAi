import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  ImageExportStateResponse,
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

export const ImageExportApiPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [state, setState] = useState<ImageExportStateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Section 1: Selected Version & Format & Options
  const [selectedVersion, setSelectedVersion] = useState<string>('v4');
  const [selectedFormat, setSelectedFormat] = useState<string>('yolo');
  const [exportOptions, setExportOptions] = useState<Record<string, boolean>>({
    splits: true,
    blur_pii: true,
    copy_paste: false,
    letterbox: false,
    no_defect_frames: true,
  });

  // Section 2: Selected Model Package Format
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>('openvino_int8');

  // Section 3: Selected Deployment Option
  const [selectedDeployOption, setSelectedDeployOption] = useState<string>('line_mini_pcs');

  // Section 4: Webhooks toggles
  const [webhookToggles, setWebhookToggles] = useState<Record<string, boolean>>({
    'dataset.version_tagged': true,
    'model.promoted': true,
    'drift.alert': true,
    'device.offline': true,
  });

  // Modals state
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState<boolean>(false);
  const [showShadowModal, setShowShadowModal] = useState<boolean>(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState<boolean>(false);
  const [showAddWebhookModal, setShowAddWebhookModal] = useState<boolean>(false);
  const [showSwaggerModal, setShowSwaggerModal] = useState<boolean>(false);

  // Form inputs for modals
  const [newKeyName, setNewKeyName] = useState<string>('QC Tablet Operator');
  const [newKeyScope, setNewKeyScope] = useState<string>('detect');
  const [newWebhookUrl, setNewWebhookUrl] = useState<string>('https://factory.internal/webhooks/vision');

  // Load datasets on mount
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

  // Listen to dataset changes from Sidebar
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

  // Listen to TopBar events (Version history & Deploy to staging / shadow)
  useEffect(() => {
    const handleVersionHistory = () => setShowVersionHistoryModal(true);
    const handleDeploy = () => setShowShadowModal(true);
    window.addEventListener('datalift:open-version-history', handleVersionHistory);
    window.addEventListener('datalift:deploy-to-staging', handleDeploy);
    window.addEventListener('datalift:start-shadow', handleDeploy);
    return () => {
      window.removeEventListener('datalift:open-version-history', handleVersionHistory);
      window.removeEventListener('datalift:deploy-to-staging', handleDeploy);
      window.removeEventListener('datalift:start-shadow', handleDeploy);
    };
  }, []);

  // Fetch state when datasetId changes
  const fetchState = useCallback(async (datasetId: string) => {
    if (!datasetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getImageExportState(datasetId);
      setState(res);
      if (res.datasets_export?.versions && res.datasets_export.versions.length > 0) {
        const cur = res.datasets_export.versions.find((v) => v.is_current) || res.datasets_export.versions[0];
        setSelectedVersion(cur.version);
      }
    } catch (err: any) {
      setError('Erreur lors du chargement des données export image: ' + (err.message || 'inconnu'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      fetchState(selectedDatasetId);
    }
  }, [selectedDatasetId, fetchState]);

  // Handlers
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setNotification(`✓ ${label} copié dans le presse-papiers.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDownloadDataset = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.downloadImageDataset(selectedDatasetId, {
        version: selectedVersion,
        format: selectedFormat,
        options: exportOptions,
      });
      setNotification(`✓ ${res.filename} téléchargé (${res.message}).`);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setError('Erreur lors du téléchargement: ' + (err.message || 'inconnu'));
    }
  };

  const handleBuildPackage = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.buildImageModelPackage(selectedDatasetId, {
        format: selectedModelFormat,
      });
      setNotification(`✓ Package ${selectedModelFormat} compilé avec succès (${res.package_id}).`);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setError('Erreur lors de la compilation: ' + (err.message || 'inconnu'));
    }
  };

  const handleStartShadow = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.startImageShadow(selectedDatasetId, {
        device: 'Line 2 · 1 device',
      });
      setShowShadowModal(false);
      setNotification(`✓ Mode shadow activé sur Line 2 (${res.message}).`);
      setTimeout(() => setNotification(null), 4000);
      fetchState(selectedDatasetId);
    } catch (err: any) {
      setError('Erreur lors du démarrage shadow: ' + (err.message || 'inconnu'));
    }
  };

  const handleCreateApiKey = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.createImageApiKey(selectedDatasetId, {
        name: newKeyName,
        scope: newKeyScope,
      });
      setShowCreateKeyModal(false);
      setNotification(`✓ Nouvelle clé API créée : ${res.key}`);
      setTimeout(() => setNotification(null), 5000);
      fetchState(selectedDatasetId);
    } catch (err: any) {
      setError('Erreur création clé API: ' + (err.message || 'inconnu'));
    }
  };

  const handleAddWebhook = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.addImageWebhook(selectedDatasetId, {
        url: newWebhookUrl,
        events: Object.keys(webhookToggles).filter((k) => webhookToggles[k]),
      });
      setShowAddWebhookModal(false);
      setNotification(`✓ Webhook enregistré pour ${res.url}`);
      setTimeout(() => setNotification(null), 4000);
      fetchState(selectedDatasetId);
    } catch (err: any) {
      setError('Erreur ajout webhook: ' + (err.message || 'inconnu'));
    }
  };

  const handleRollback = async (targetVersion: string) => {
    if (!selectedDatasetId) return;
    try {
      await api.rollbackImageModel(selectedDatasetId, { target_version: targetVersion });
      setNotification(`✓ Rollback vers ${targetVersion} appliqué.`);
      setTimeout(() => setNotification(null), 4000);
      fetchState(selectedDatasetId);
    } catch (err: any) {
      setError('Erreur lors du rollback: ' + (err.message || 'inconnu'));
    }
  };

  // Dynamic code snippet for Section 1
  const codeSnippet = useMemo(() => {
    const rawName = state?.dataset_name?.replace('/', '') || 'defects';
    const tag = `${rawName}@${selectedVersion}`;
    const py = `# Python\nimport datalift\ndatalift.download("${tag}", format="${selectedFormat}", to="./${rawName}")\n\n# REST\nGET [YOUR DOMAIN]/v1/datasets/${rawName}/${selectedVersion}/export?format=${selectedFormat}&split=all`;
    return py;
  }, [state, selectedVersion, selectedFormat]);

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
            Chargement des données d'export image...
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
          {state?.header?.breadcrumb ||
            'EXPORT · YOLO-DEFECTS-V4 · CANDIDATE FROM 06 · 6 CLASSES · EDGE BUDGET ≤ 120 MS PER FRAME'}
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
              {state?.header?.model_title || 'yolo-defects-v4 · YOLO11-s'}
            </h1>
          </div>

          {/* Large dynamic approved badge on top right */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                display: 'inline-block',
                fontSize: '0.6rem',
                fontFamily: 'monospace',
                letterSpacing: '0.15em',
                color: C.amber,
                border: `1px solid ${C.amber}`,
                padding: '0.1rem 0.45rem',
                borderRadius: '3px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                marginBottom: '0.2rem',
              }}
            >
              {state?.header?.badge_approved || 'APPROVED IN 06'}
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
              {state?.header?.versions_on_line || '02'}
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
              VERSIONS ON THE LINE
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
        {/* MODEL */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            MODEL
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {state?.header?.model_name || 'yolo-defects-v4'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {state?.header?.model_sub || 'trained on v4 · replayable'}
          </div>
        </div>

        {/* IN PRODUCTION */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            IN PRODUCTION
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {state?.header?.in_production || 'yolo-defects-v3'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {state?.header?.in_production_sub || 'on the line mini PCs'}
          </div>
        </div>

        {/* TARGET */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            TARGET
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {state?.header?.target || 'OpenVINO INT8'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {state?.header?.target_sub || 'line mini PCs · CPU'}
          </div>
        </div>

        {/* FRAMES · 7 DAYS */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            FRAMES · 7 DAYS
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {state?.header?.frames_7days || '48,300'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {state?.header?.frames_7days_sub || 'all scored on the device'}
          </div>
        </div>
      </div>

      {/* Explanatory Banner: HOW EXPORT WORKS FOR IMAGES */}
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
          HOW EXPORT WORKS FOR IMAGES
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
          {state?.header?.info_box ||
            'Two things leave Datalift. The data: any tagged version of the images with their boxes, in YOLO, COCO or Pascal VOC, ready for another training tool. The model: it runs where the camera is, on the line mini PCs, so a defect is flagged without sending video anywhere. Datalift converts it for the device, checks its speed there, then rolls it out one mini PC at a time.'}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: DATASETS */}
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
            1 · Datasets
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
            {state?.datasets_export?.subtitle || 'EVERY TAGGED VERSION, IN A STANDARD FORMAT'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left Column: Versions Table + Format Pickers */}
          <div>
            {/* Versions Table */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '1.5rem',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>VERSION</th>
                    <th style={{ padding: '0.65rem 1rem' }}>SIZE</th>
                    <th style={{ padding: '0.65rem 1rem' }}>MADE FROM</th>
                    <th style={{ padding: '0.65rem 1rem' }}>STATE</th>
                  </tr>
                </thead>
                <tbody>
                  {state?.datasets_export?.versions?.map((ver, idx) => {
                    const isSelected = selectedVersion === ver.version;
                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedVersion(ver.version)}
                        style={{
                          borderBottom: `1px solid ${C.border}`,
                          backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                          borderLeft: isSelected ? `3px solid ${C.amber}` : '3px solid transparent',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem', color: isSelected ? C.amberLight : C.text, fontWeight: isSelected ? 600 : 400 }}>
                          {ver.version}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: C.textMuted }}>
                          {ver.size}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: C.textMuted }}>
                          {ver.made_from}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {ver.state === 'CURRENT' ? (
                            <span
                              style={{
                                backgroundColor: C.amber,
                                color: '#000',
                                fontSize: '0.65rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '3px',
                                fontWeight: 'bold',
                              }}
                            >
                              CURRENT
                            </span>
                          ) : ver.state === 'TAGGED' ? (
                            <span
                              style={{
                                border: '1px solid #d97706',
                                color: '#d97706',
                                fontSize: '0.65rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '3px',
                                fontWeight: 'bold',
                              }}
                            >
                              TAGGED
                            </span>
                          ) : (
                            <span
                              style={{
                                border: '1px dashed #4b5563',
                                color: '#6b7280',
                                fontSize: '0.65rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '3px',
                              }}
                            >
                              DRAFT
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* DATA FORMAT · PICK ONE */}
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                DATA FORMAT · PICK ONE
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                {[
                  { id: 'yolo', name: 'YOLO', desc: 'One .txt per image, for Ultralytics.' },
                  { id: 'coco', name: 'COCO', desc: 'One JSON with all boxes, for most tools.' },
                  { id: 'pascal_voc', name: 'Pascal VOC', desc: 'One XML per image, for older tools.' },
                  { id: 'cvat', name: 'CVAT', desc: 'Re-open the boxes in CVAT to edit them.' },
                ].map((fmt) => {
                  const isSelected = selectedFormat === fmt.id;
                  return (
                    <div
                      key={fmt.id}
                      onClick={() => setSelectedFormat(fmt.id)}
                      style={{
                        backgroundColor: C.card,
                        border: isSelected ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                        borderRadius: '6px',
                        padding: '1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '80px',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isSelected ? C.amberLight : C.text, fontFamily: 'monospace' }}>
                          {fmt.name}
                        </span>
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            border: isSelected ? `4px solid ${C.amber}` : `1px solid ${C.textFaint}`,
                            backgroundColor: isSelected ? '#000' : 'transparent',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace', marginTop: '0.45rem' }}>
                        {fmt.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: What goes in the export */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.5rem',
            }}
          >
            <h3
              style={{
                fontFamily: 'Newsreader, Georgia, serif',
                fontStyle: 'italic',
                fontSize: '1.25rem',
                color: '#f4f4f6',
                margin: '0 0 1.25rem 0',
              }}
            >
              What goes in the export
            </h3>

            {/* Checkboxes List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}>
              {[
                { id: 'splits', label: 'Keep the splits from 04', sub: 'train / val / test · by scene group' },
                { id: 'blur_pii', label: 'Faces and plates blurred', sub: 'always, if any appear' },
                { id: 'copy_paste', label: 'Include copy-paste images', sub: 'train only, marked as generated' },
                { id: 'letterbox', label: 'Letterboxed to 1280 px', sub: 'off = original size, boxes rescaled' },
                { id: 'no_defect_frames', label: 'Include frames with no defect', sub: 'needed to learn the background' },
              ].map((opt) => (
                <label key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={exportOptions[opt.id] ?? false}
                    onChange={(e) =>
                      setExportOptions((prev) => ({ ...prev, [opt.id]: e.target.checked }))
                    }
                    style={{
                      accentColor: C.amber,
                      marginTop: '0.2rem',
                      cursor: 'pointer',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: C.text, fontWeight: 500 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                      {opt.sub}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Summary Line */}
            <div
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.65rem 0.85rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: C.amberLight,
                marginBottom: '1rem',
              }}
            >
              {state?.dataset_name?.replace('/', '') || 'defects'}@{selectedVersion} · {selectedFormat.toUpperCase()} ·{' '}
              {state?.datasets_export?.versions?.find((v) => v.version === selectedVersion)?.size || '12,218 images'}
            </div>

            {/* Code Box */}
            <div
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.85rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                color: '#d1d5db',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
                marginBottom: '1.25rem',
              }}
            >
              {codeSnippet}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={handleDownloadDataset}
                style={{
                  flex: 1,
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
              >
                Download {state?.dataset_name?.replace('/', '') || 'defects'}@{selectedVersion}
              </button>

              <button
                type="button"
                onClick={() => handleCopy(codeSnippet, 'Commande d\'export')}
                style={{
                  backgroundColor: 'transparent',
                  color: C.text,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Copy API call
              </button>
            </div>

            <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
              Only tagged versions download. A draft can be previewed, not exported.
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: MODEL PACKAGE */}
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
            2 · Model package
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
            {state?.model_package?.subtitle || 'ONE MODEL, ONE PACKAGE, EVERYTHING IT NEEDS'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Format Selector */}
          <div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, marginBottom: '0.75rem', textTransform: 'uppercase' }}>
              FORMAT · PICK ONE
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
              {[
                {
                  id: 'openvino_int8',
                  name: 'OpenVINO INT8',
                  desc: 'Fast on the line mini PCs. Calibrated on 300 train images.',
                  sub: 'LINE MINI PCS · EDGE',
                },
                {
                  id: 'onnx_fp32',
                  name: 'ONNX FP32',
                  desc: 'Full precision. For GPU servers and comparisons.',
                  sub: 'GPU SERVER',
                },
                {
                  id: 'docker',
                  name: 'Docker image',
                  desc: 'A REST API that takes a photo and returns boxes.',
                  sub: 'HAND PHOTOS · QC APP',
                },
                {
                  id: 'pytorch',
                  name: 'PyTorch .pt',
                  desc: 'The training weights, for further training.',
                  sub: 'RESEARCH · FINE-TUNING',
                },
              ].map((fmt) => {
                const isSelected = selectedModelFormat === fmt.id;
                return (
                  <div
                    key={fmt.id}
                    onClick={() => setSelectedModelFormat(fmt.id)}
                    style={{
                      backgroundColor: C.card,
                      border: isSelected ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                      borderRadius: '6px',
                      padding: '1.1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '110px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isSelected ? C.amberLight : C.text, fontFamily: 'monospace' }}>
                          {fmt.name}
                        </span>
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            border: isSelected ? `4px solid ${C.amber}` : `1px solid ${C.textFaint}`,
                            backgroundColor: isSelected ? '#000' : 'transparent',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace', lineHeight: 1.4 }}>
                        {fmt.desc}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textFaint, marginTop: '0.75rem', letterSpacing: '0.08em' }}>
                      {fmt.sub}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, lineHeight: 1.5 }}>
              INT8 is calibrated on train images only, never on test. Its mAP is compared with FP32 on the locked test set before publish.
            </div>
          </div>

          {/* Right Column: What ships with it */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.5rem',
            }}
          >
            <h3
              style={{
                fontFamily: 'Newsreader, Georgia, serif',
                fontStyle: 'italic',
                fontSize: '1.25rem',
                color: '#f4f4f6',
                margin: '0 0 1.25rem 0',
              }}
            >
              What ships with it
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}>
              {(state?.model_package?.what_ships || [
                { label: 'Model · yolo-defects-v4', sub: 'YOLO11-s · weights and version' },
                { label: 'Class list · 6 classes', sub: 'crack, scratch and 4 others · fixed order' },
                { label: 'Preprocessing', sub: 'letterbox to 1280 px, as in 04' },
                { label: 'Thresholds per class', sub: 'crack kept low so it is never missed' },
                { label: 'Upload rule for 07', sub: 'boxes 0.30–0.60 and 1 random frame in 200' },
                { label: 'Model card', sub: 'per-class metrics, edge latency, known limits' },
              ]).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <Check size={14} color={C.amber} style={{ marginTop: '0.15rem' }} />
                  <div>
                    <div style={{ fontSize: '0.76rem', fontFamily: 'monospace', color: C.text, fontWeight: 500 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                      {item.sub}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* CLI Snippet Box */}
            <div
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.75rem',
                fontSize: '0.74rem',
                fontFamily: 'monospace',
                color: '#d1d5db',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>datalift export {state?.header?.model_name || 'yolo-defects-v4'} --format {selectedModelFormat.replace('_', '-')}</span>
              <button
                type="button"
                onClick={() => handleCopy(`datalift export ${state?.header?.model_name || 'yolo-defects-v4'} --format ${selectedModelFormat.replace('_', '-')}`, 'Commande CLI')}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}
              >
                <Copy size={13} />
              </button>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleBuildPackage}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: C.text,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.76rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Build package
              </button>

              <button
                type="button"
                onClick={() => {
                  setNotification('✓ Model card téléchargée (yolo-defects-v4-card.md).');
                  setTimeout(() => setNotification(null), 3500);
                }}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  color: C.text,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.76rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Download model card
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: DEPLOY */}
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
            3 · Deploy
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
            {state?.deploy?.subtitle || 'ONE DEVICE FIRST, THEN THE FLEET'}
          </span>
        </div>

        {/* 5-Step Pipeline */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          {(state?.deploy?.pipeline || [
            { step: '1 · BUILD', title: 'INT8 converted', status: '✓ done · 9 min', active: false, done: true },
            { step: '2 · DEVICE TEST', title: 'Speed on a mini PC', status: '✓ under 120 ms', active: false, done: true },
            { step: '3 · SHADOW', title: 'Line 2 · 1 device', status: 'now · boxes logged only', active: true, done: false },
            { step: '4 · LINE 2', title: 'All mini PCs of line 2', status: 'waiting', active: false, done: false },
            { step: '5 · FLEET', title: 'All lines', status: 'waiting · after review', active: false, done: false },
          ]).map((p, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: C.card,
                border: p.active ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.1rem 1rem',
                minHeight: '85px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: p.active ? C.amberLight : C.textMuted, letterSpacing: '0.1em' }}>
                  {p.step}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: p.active ? '#fff' : C.text, marginTop: '0.3rem', fontFamily: 'monospace' }}>
                  {p.title}
                </div>
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  color: p.done ? C.green : p.active ? C.amber : C.textFaint,
                  marginTop: '0.5rem',
                }}
              >
                {p.status}
              </div>
            </div>
          ))}
        </div>

        {/* 3 Deployment Option Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            {
              id: 'line_mini_pcs',
              tag: 'SELECTED',
              title: 'Line mini PCs',
              desc: 'Pushed to the devices one by one. Each keeps the previous model to roll back offline.',
            },
            {
              id: 'hosted_api',
              tag: 'OPTION',
              title: 'Hosted API',
              desc: "Upload a photo, get the boxes. For the QC team's hand photos.",
            },
            {
              id: 'gpu_server',
              tag: 'OPTION',
              title: 'Your GPU server',
              desc: 'Run the Docker image with ONNX FP32 for bulk re-checks.',
            },
          ].map((card) => {
            const isSelected = selectedDeployOption === card.id;
            return (
              <div
                key={card.id}
                onClick={() => setSelectedDeployOption(card.id)}
                style={{
                  backgroundColor: C.card,
                  border: isSelected ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div
                  style={{
                    fontSize: '0.6rem',
                    fontFamily: 'monospace',
                    letterSpacing: '0.1em',
                    color: isSelected ? C.amberLight : C.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: '0.4rem',
                    fontWeight: 'bold',
                  }}
                >
                  {card.tag}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: isSelected ? '#fff' : C.text, fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                  {card.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace', lineHeight: 1.5 }}>
                  {card.desc}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: API */}
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
            4 · API
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
            {state?.api_section?.subtitle || 'SAME MASKS, SAME THRESHOLDS AS IN 06'}
          </span>
        </div>

        {/* Endpoint Top Bar */}
        <div
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'monospace', fontSize: '0.82rem' }}>
            <span
              style={{
                backgroundColor: C.amber,
                color: '#000',
                padding: '0.2rem 0.5rem',
                borderRadius: '3px',
                fontWeight: 'bold',
                fontSize: '0.72rem',
              }}
            >
              POST
            </span>
            <span style={{ color: C.text }}>
              {state?.api_section?.endpoint_path || '[YOUR DOMAIN]/v1/defects/detect'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={() => handleCopy(state?.api_section?.endpoint_path || '[YOUR DOMAIN]/v1/defects/detect', 'URL Endpoint')}
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
              Copy
            </button>

            <button
              type="button"
              onClick={() => setShowSwaggerModal(true)}
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
              OpenAPI spec
            </button>

            <button
              type="button"
              onClick={() => setShowSwaggerModal(true)}
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
              Try it in Swagger
            </button>
          </div>
        </div>

        {/* 3-Column API Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Col 1: REQUEST */}
          <div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.1em', color: C.textMuted, marginBottom: '0.5rem' }}>
              REQUEST · CURL
            </div>
            <div
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.85rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                color: '#d1d5db',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.4,
                marginBottom: '1rem',
              }}
            >
              {state?.api_section?.curl_snippet ||
                'curl -X POST [YOUR DOMAIN]/v1/defects/detect \\\n  -H "Authorization: Bearer $DATALIFT_KEY" \\\n  -F "image=@IMG_11204.jpg" \\\n  -F "line=2" \\\n  -F "camera=4"'}
            </div>

            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.1em', color: C.textMuted, marginBottom: '0.5rem' }}>
              REQUEST · PYTHON
            </div>
            <div
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.85rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                color: '#d1d5db',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.4,
                marginBottom: '0.75rem',
              }}
            >
              {state?.api_section?.python_snippet ||
                'from datalift import Client\nimport os\n\ndl = Client(api_key=os.environ["DATALIFT_KEY"])\n\nr = dl.detect("defects", "IMG_11204.jpg", line=2, camera=4)\nfor box in r.boxes:\n    print(box.cls, box.score, box.xywh)'}
            </div>

            <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, lineHeight: 1.4 }}>
              Boxes are x, y, width, height in the 1280 px letterboxed image, uncertain = true means the frame matches the 07 upload rule.
            </div>
          </div>

          {/* Col 2: RESPONSE */}
          <div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.1em', color: C.textMuted, marginBottom: '0.5rem' }}>
              RESPONSE
            </div>
            <div
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.85rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                color: '#d1d5db',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.4,
                minHeight: '260px',
              }}
            >
              {JSON.stringify(
                state?.api_section?.response_json || {
                  image: 'IMG_11204.jpg',
                  size: [1280, 1280],
                  boxes: [
                    { class: 'scratch', score: '[RESULT]', box: [412, 288, 96, 41] },
                    { class: 'crack', score: '[RESULT]', box: [655, 702, 38, 120] },
                  ],
                  uncertain: true,
                  model: 'yolo-defects-v4',
                  runtime: 'openvino-int8',
                },
                null,
                2
              )}
            </div>
          </div>

          {/* Col 3: API keys & Webhooks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* API keys card */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace', color: C.text }}>
                  API keys
                </span>
                <button
                  type="button"
                  onClick={() => setShowCreateKeyModal(true)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.3rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Create key
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                {(state?.api_section?.keys || [
                  { name: 'QC tablet app', tag: 'LIVE', tag_type: 'live', detail: 'dl_live_****41fe · detect', used: 'used 12 min ago' },
                  { name: 'Line devices', tag: 'LIVE', tag_type: 'live', detail: 'device certs · pull model · send stats', used: 'used hourly' },
                  { name: 'Staging tests', tag: 'TEST', tag_type: 'test', detail: 'dl_test_****9a03 · detect', used: 'used today' },
                ]).map((k, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                    <div>
                      <div style={{ color: C.text, fontWeight: 500 }}>{k.name}</div>
                      <div style={{ color: C.textMuted, fontSize: '0.65rem' }}>{k.detail}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          backgroundColor: k.tag === 'LIVE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                          color: k.tag === 'LIVE' ? C.green : '#9ca3af',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '3px',
                          fontSize: '0.6rem',
                          fontWeight: 'bold',
                        }}
                      >
                        {k.tag}
                      </span>
                      <div style={{ color: C.textFaint, fontSize: '0.62rem', marginTop: '0.2rem' }}>{k.used}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: '0.65rem' }}>
                <div>RATE LIMIT: <span style={{ color: C.text }}>20 req / s</span></div>
                <div>MAX INPUT: <span style={{ color: C.text }}>1 image · 20 MB</span></div>
              </div>
              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textFaint, marginTop: '0.4rem' }}>
                A key is shown once, scoped to one project, and can be revoked at any time.
              </div>
            </div>

            {/* Webhooks card */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace', color: C.text }}>
                  Webhooks
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddWebhookModal(true)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.3rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Add webhook
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {(state?.api_section?.webhooks || [
                  { event: 'dataset.version_tagged', desc: 'a new version is tagged in 04' },
                  { event: 'model.promoted', desc: 'a version reaches production' },
                  { event: 'drift.alert', desc: 'an alert is raised in 08' },
                  { event: 'device.offline', desc: 'a mini PC stops reporting' },
                ]).map((wh, idx) => {
                  const isEnabled = webhookToggles[wh.event] ?? true;
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                      <div>
                        <div style={{ color: C.text, fontWeight: 500 }}>{wh.event}</div>
                        <div style={{ color: C.textMuted, fontSize: '0.65rem' }}>{wh.desc}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setWebhookToggles((prev) => ({ ...prev, [wh.event]: !isEnabled }))
                        }
                        style={{
                          backgroundColor: isEnabled ? C.amber : '#2a2d35',
                          color: isEnabled ? '#000' : '#9ca3af',
                          border: 'none',
                          borderRadius: '3px',
                          padding: '0.15rem 0.45rem',
                          fontSize: '0.62rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        {isEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>
                POST → [YOUR URL] · signed with a secret
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 5: VERSIONS AND TRAFFIC */}
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
            5 · Versions and traffic
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
            {state?.versions_traffic?.subtitle || 'EVERY PREDICTION IS LOGGED WITH ITS MODEL VERSION'}
          </span>
        </div>

        {/* 4 Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {(state?.versions_traffic?.kpis || [
            { label: 'LATENCY ON DEVICE · P50', value: '[RESULT]', sub: 'per frame · INT8' },
            { label: 'LATENCY ON DEVICE · P95', value: '[RESULT]', sub: 'budget 120 ms' },
            { label: 'FRAMES UPLOADED', value: '14%', sub: '6,950 of 48,300 · rule from 07' },
            { label: 'DEVICES ONLINE', value: '[RESULT]', sub: 'reported in the last hour' },
          ]).map((kpi, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 600, color: C.amber, margin: '0.25rem 0' }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Versions Table */}
        <div
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            overflow: 'hidden',
            marginBottom: '0.75rem',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem', fontFamily: 'monospace' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1rem' }}>VERSION</th>
                <th style={{ padding: '0.75rem 1rem' }}>RUNS ON</th>
                <th style={{ padding: '0.75rem 1rem' }}>STATUS</th>
                <th style={{ padding: '0.75rem 1rem' }}>TRAFFIC</th>
                <th style={{ padding: '0.75rem 1rem' }}>P95</th>
                <th style={{ padding: '0.75rem 1rem' }}>ERRORS</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {(state?.versions_traffic?.table || [
                {
                  version: 'yolo-defects-v3',
                  runs_on: 'All line mini PCs',
                  status: 'PRODUCTION',
                  traffic: 'acts',
                  p95: '[RESULT]',
                  errors: '[RESULT]',
                  action_label: 'Roll back to v2',
                  action_key: 'rollback_v2',
                },
                {
                  version: 'yolo-defects-v4',
                  runs_on: 'Line 2 · 1 device',
                  status: 'SHADOW',
                  traffic: 'logged only',
                  p95: '[RESULT]',
                  errors: '[RESULT]',
                  action_label: 'Extend to line 2',
                  action_key: 'extend_line2',
                },
                {
                  version: 'yolo-defects-v2',
                  runs_on: '—',
                  status: 'ARCHIVED',
                  traffic: '—',
                  p95: '—',
                  errors: '—',
                  action_label: 'Restore',
                  action_key: 'restore_v2',
                },
              ]).map((row, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.75rem 1rem', color: C.text, fontWeight: 500 }}>{row.version}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.textMuted }}>{row.runs_on}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {row.status === 'PRODUCTION' ? (
                      <span style={{ backgroundColor: C.amber, color: '#000', fontSize: '0.62rem', padding: '0.2rem 0.5rem', borderRadius: '3px', fontWeight: 'bold' }}>
                        PRODUCTION
                      </span>
                    ) : row.status === 'SHADOW' ? (
                      <span style={{ border: `1px dashed ${C.amber}`, color: C.amber, fontSize: '0.62rem', padding: '0.15rem 0.45rem', borderRadius: '3px', fontWeight: 'bold' }}>
                        SHADOW
                      </span>
                    ) : (
                      <span style={{ backgroundColor: '#22252a', color: '#6b7280', fontSize: '0.62rem', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                        ARCHIVED
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: C.textMuted }}>{row.traffic}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.amber, fontWeight: 'bold' }}>{row.p95}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.textMuted }}>{row.errors}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (row.action_key.includes('rollback')) handleRollback('v2');
                        else if (row.action_key.includes('extend')) setShowShadowModal(true);
                        else {
                          setNotification(`✓ Action ${row.action_label} effectuée.`);
                          setTimeout(() => setNotification(null), 3000);
                        }
                      }}
                      style={{
                        backgroundColor: 'transparent',
                        border: `1px solid ${C.borderLight}`,
                        color: C.text,
                        padding: '0.35rem 0.75rem',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                      }}
                    >
                      {row.action_label}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted }}>
          In shadow, v4 sees the same frames as v3 and its boxes are logged, never acted on. Disagreements go to the 07 pool.
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 6: GUARDRAILS */}
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
            CHECKED BEFORE EVERY EXPORT AND SWITCH
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {(state?.guardrails || [
            { title: 'Speed measured on the device', desc: 'Not on the training GPU', status: 'ok' },
            { title: 'INT8 calibrated on train only', desc: 'Never on test images', status: 'ok' },
            { title: 'Shadow before switch', desc: 'One device first, then the fleet', status: 'ok' },
            { title: "Crack recall can't regress", desc: 'Rollout is blocked otherwise', status: 'ok' },
            { title: 'Offline roll back', desc: 'Each device keeps the previous model', status: 'ok' },
            { title: 'Video stays on the line', desc: 'Only stats and picked frames leave', status: 'ok' },
            { title: 'Every run can be replayed', desc: 'data + config + code + seed + environment', status: 'ok' },
            { title: 'Cam 6 is new', desc: "Not in v4's training data · see 08", status: 'warn' },
          ]).map((g, idx) => {
            const isWarn = g.status === 'warn';
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: C.card,
                  border: isWarn ? `1px solid ${C.amberBorder}` : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                }}
              >
                <div style={{ marginTop: '0.1rem' }}>
                  {isWarn ? <AlertTriangle size={15} color={C.amber} /> : <Check size={15} color={C.green} />}
                </div>
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: isWarn ? C.amberLight : C.text, marginBottom: '0.2rem' }}>
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
            {state?.bottom_bar?.title || 'yolo-defects-v4 · OpenVINO INT8 · ready for shadow on line 2'}
          </div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
            {state?.bottom_bar?.sub || 'Next: shadow on one mini PC of line 2, then the whole line after review'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={() => navigate('/drift')}
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
            ← Back to drift
          </button>

          <button
            type="button"
            onClick={() => setShowShadowModal(true)}
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
            Start shadow on line 2
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: VERSION HISTORY */}
      {/* ========================================================================= */}
      {showVersionHistoryModal && (
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
              width: '680px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.35rem', color: '#f4f4f6', margin: 0 }}>
                Version history · {state?.dataset_name || 'product_defects'}
              </h3>
              <button
                type="button"
                onClick={() => setShowVersionHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace', marginBottom: '1.5rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem' }}>
                  <th style={{ padding: '0.5rem' }}>VERSION</th>
                  <th style={{ padding: '0.5rem' }}>DATE</th>
                  <th style={{ padding: '0.5rem' }}>IMAGES</th>
                  <th style={{ padding: '0.5rem' }}>TARGET</th>
                  <th style={{ padding: '0.5rem' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { ver: 'v4', date: 'Today 14:20', count: '12,218 images', target: 'OpenVINO INT8', status: 'SHADOW' },
                  { ver: 'v3', date: '04 Nov 10:15', count: '11,806 images', target: 'OpenVINO INT8', status: 'PRODUCTION' },
                  { ver: 'v2', date: '21 Oct 16:30', count: '10,920 images', target: 'OpenVINO INT8', status: 'ARCHIVED' },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.amber, fontWeight: 'bold' }}>{row.ver}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.textMuted }}>{row.date}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.text }}>{row.count}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.textMuted }}>{row.target}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: row.status === 'PRODUCTION' ? C.green : row.status === 'SHADOW' ? C.amber : C.textMuted, fontWeight: 'bold' }}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowVersionHistoryModal(false)}
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
      {/* MODAL 2: START SHADOW ROLLOUT */}
      {/* ========================================================================= */}
      {showShadowModal && (
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
              width: '540px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.35rem', color: '#f4f4f6', margin: 0 }}>
                Start shadow mode · Line 2
              </h3>
              <button
                type="button"
                onClick={() => setShowShadowModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Candidate model <strong>{state?.header?.model_name || 'yolo-defects-v4'}</strong> will be pushed to <strong>Line 2 · 1 device</strong> in parallel with active model v3. Its predictions will be silently logged and compared without impacting conveyor stoppage.
            </p>

            <div style={{ backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, borderRadius: '4px', padding: '0.85rem', marginBottom: '1.5rem', fontSize: '0.74rem', fontFamily: 'monospace' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: C.textMuted }}>DEPLOY TARGET:</span>
                <span style={{ color: C.text }}>Line 2 Edge mini PC (192.168.10.43)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: C.textMuted }}>ACCELERATOR:</span>
                <span style={{ color: C.amber }}>OpenVINO INT8 (NPU/CPU)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.textMuted }}>FAILOVER POLICY:</span>
                <span style={{ color: C.green }}>Instant offline rollback to v3</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowShadowModal(false)}
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
                onClick={handleStartShadow}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1.15rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Confirm shadow rollout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE API KEY */}
      {/* ========================================================================= */}
      {showCreateKeyModal && (
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
              width: '480px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.35rem', color: '#f4f4f6', margin: 0 }}>
                Generate vision API key
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateKeyModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                KEY NAME / CLIENT APPLICATION
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                ACCESS SCOPE
              </label>
              <select
                value={newKeyScope}
                onChange={(e) => setNewKeyScope(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box',
                }}
              >
                <option value="detect">Inference detect only</option>
                <option value="read_telemetry">Read device telemetry</option>
                <option value="admin">Full project admin</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowCreateKeyModal(false)}
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
                onClick={handleCreateApiKey}
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
                Create API key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD WEBHOOK */}
      {/* ========================================================================= */}
      {showAddWebhookModal && (
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
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.35rem', color: '#f4f4f6', margin: 0 }}>
                Subscribe vision webhook
              </h3>
              <button
                type="button"
                onClick={() => setShowAddWebhookModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                PAYLOAD DESTINATION URL (HTTPS)
              </label>
              <input
                type="url"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem',
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
                onClick={() => setShowAddWebhookModal(false)}
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
                onClick={handleAddWebhook}
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
                Save webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: SWAGGER / OPENAPI SPEC */}
      {/* ========================================================================= */}
      {showSwaggerModal && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.35rem', color: '#f4f4f6', margin: 0 }}>
                OpenAPI 3.1 Specification · Vision Inference
              </h3>
              <button
                type="button"
                onClick={() => setShowSwaggerModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.85rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                color: '#d1d5db',
                whiteSpace: 'pre-wrap',
                maxHeight: '340px',
                overflowY: 'auto',
                marginBottom: '1.5rem',
                lineHeight: 1.4,
              }}
            >
{`openapi: 3.1.0
info:
  title: Datalift Vision Inference API
  version: 0.1.0
paths:
  /v1/defects/detect:
    post:
      summary: Real-time defect detection on edge frame
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                image:
                  type: string
                  format: binary
                line:
                  type: integer
                camera:
                  type: integer
      responses:
        '200':
          description: Detection bounding boxes & confidence scores`}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => window.open('http://127.0.0.1:8000/docs', '_blank')}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem 0.85rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                }}
              >
                <span>Open interactive Swagger UI</span>
                <ExternalLink size={13} />
              </button>
              <button
                type="button"
                onClick={() => setShowSwaggerModal(false)}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1.15rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
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
    </div>
  );
};
