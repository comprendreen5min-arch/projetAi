import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  TextExportStateResponse,
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

export const TextExportApiPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<TextExportStateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Section 1: Datasets selection & options
  const [selectedVersion, setSelectedVersion] = useState<string>('v4');
  const [selectedDataFormat, setSelectedDataFormat] = useState<string>('jsonl');
  const [exportOptions, setExportOptions] = useState<Record<string, boolean>>({
    keep_splits: true,
    mask_pii: true,
    include_paraphrases: false,
    add_embeddings: false,
    add_label_history: false,
  });

  // Section 2: Model package format
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>('docker');

  // Section 3: Deploy selection
  const [selectedDeployOption, setSelectedDeployOption] = useState<string>('datalift_hosted');

  // Webhooks toggles
  const [webhookStates, setWebhookStates] = useState<Record<string, boolean>>({
    'dataset.version_tagged': true,
    'model.promoted': true,
    'drift.alert': true,
    'topic.new_cluster': true,
  });

  // Feedback & Notifications
  const [notification, setNotification] = useState<string | null>(null);

  // Modals
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);
  const [showDeployModal, setShowDeployModal] = useState<boolean>(false);
  const [showSwaggerModal, setShowSwaggerModal] = useState<boolean>(false);

  // Modal Inputs
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [newKeyScope, setNewKeyScope] = useState<string>('classify');
  const [newWebhookUrl, setNewWebhookUrl] = useState<string>('https://helpdesk.company.com/webhook');
  const [newWebhookEvent, setNewWebhookEvent] = useState<string>('drift.alert');

  // Load datasets on mount
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

  // TopBar listener for Version history & Deploy to staging
  useEffect(() => {
    const handleOpenHistory = () => setShowHistoryModal(true);
    const handleDeployStaging = () => setShowDeployModal(true);

    window.addEventListener('datalift:open-version-history', handleOpenHistory);
    window.addEventListener('datalift:deploy-to-staging', handleDeployStaging);

    return () => {
      window.removeEventListener('datalift:open-version-history', handleOpenHistory);
      window.removeEventListener('datalift:deploy-to-staging', handleDeployStaging);
    };
  }, []);

  // Fetch state when dataset changes
  const fetchData = useCallback(async (datasetId: string) => {
    if (!datasetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTextExportApiState(datasetId);
      setData(res);
      if (res.datasets?.selected_version) {
        setSelectedVersion(res.datasets.selected_version);
      }
      if (res.datasets?.options) {
        setExportOptions({
          keep_splits: res.datasets.options.keep_splits,
          mask_pii: res.datasets.options.mask_pii,
          include_paraphrases: res.datasets.options.include_paraphrases,
          add_embeddings: res.datasets.options.add_embeddings,
          add_label_history: res.datasets.options.add_label_history,
        });
      }
      if (res.api?.webhooks) {
        const whMap: Record<string, boolean> = {};
        res.api.webhooks.forEach((w) => {
          whMap[w.event] = w.enabled;
        });
        setWebhookStates(whMap);
      }
    } catch (err: any) {
      setError("Erreur lors du chargement des données d'export texte: " + (err.message || 'inconnu'));
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
  const handleCopy = (text: string, label: string = 'Texte') => {
    navigator.clipboard.writeText(text);
    setNotification(`✓ ${label} copié dans le presse-papier.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDownloadDataset = () => {
    const filename = `${data?.dataset_name || 'tickets'}@${selectedVersion}.${selectedDataFormat}`;
    setNotification(`✓ Préparation du téléchargement : ${filename}...`);
    setTimeout(() => {
      setNotification(`✓ ${filename} téléchargé avec succès.`);
      setTimeout(() => setNotification(null), 3000);
    }, 1200);
  };

  const handleBuildPackage = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.buildTextPackage(selectedDatasetId, { format_id: selectedModelFormat });
      setNotification(`✓ Package [${selectedModelFormat.toUpperCase()}] généré avec succès.`);
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setError('Erreur lors de la génération du package: ' + (err.message || 'inconnu'));
    }
  };

  const handleDeployToStaging = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.deployTextToStaging(selectedDatasetId);
      setShowDeployModal(false);
      setNotification(`✓ ${res.message || 'Déploiement en staging réussi.'}`);
      setTimeout(() => setNotification(null), 4000);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      setError('Erreur lors du déploiement: ' + (err.message || 'inconnu'));
    }
  };

  const handleCreateApiKey = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.createTextApiKey(selectedDatasetId, {
        name: newKeyName || 'Production Key',
        scope: newKeyScope,
      });
      setShowApiKeyModal(false);
      setNewKeyName('');
      setNotification(`✓ Clé créée: ${res.key} (enregistrée avec succès)`);
      setTimeout(() => setNotification(null), 5000);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      setError('Erreur lors de la création de la clé: ' + (err.message || 'inconnu'));
    }
  };

  const handleAddWebhook = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.addTextWebhook(selectedDatasetId, {
        event: newWebhookEvent,
        url: newWebhookUrl,
      });
      setShowWebhookModal(false);
      setNotification(`✓ Webhook [${newWebhookEvent}] enregistré avec succès.`);
      setTimeout(() => setNotification(null), 3500);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      setError("Erreur lors de l'enregistrement du webhook: " + (err.message || 'inconnu'));
    }
  };

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
            Chargement des configurations d'export...
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
          {data?.header?.breadcrumb ||
            'EXPORT · TICKET-CLS-V4 · CANDIDATE FROM 06 · 7 LABELS · 4 LANGUAGES · DATA V4'}
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
              {data?.header?.model_title || 'ticket-cls-v4 · XLM-R'}
            </h1>
          </div>

          {/* Large dynamic indicator on top right */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                display: 'inline-block',
                fontSize: '0.6rem',
                fontFamily: 'monospace',
                letterSpacing: '0.15em',
                color: C.amber,
                border: `1px solid ${C.amberBorder}`,
                backgroundColor: C.amberBg,
                padding: '0.1rem 0.45rem',
                borderRadius: '3px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                marginBottom: '0.2rem',
              }}
            >
              {data?.header?.badge_approved || 'APPROVED IN 06'}
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
              {data?.header?.versions_live || '02'}
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
              VERSIONS LIVE
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
            {data?.header?.model_name || 'ticket-cls-v4'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.header?.model_sub || 'trained on v4 · replayable'}
          </div>
        </div>

        {/* IN PRODUCTION */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            IN PRODUCTION
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.header?.in_production || 'ticket-cls-v3'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.header?.in_production_sub || 'until v4 passes shadow'}
          </div>
        </div>

        {/* ENDPOINT */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            ENDPOINT
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.header?.endpoint || 'staging'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.header?.endpoint_sub || 'production after darija review'}
          </div>
        </div>

        {/* TICKETS · 7 DAYS */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            TICKETS · 7 DAYS
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.amber, margin: '0.2rem 0' }}>
            {data?.header?.tickets_7d || '[RESULT]'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.header?.tickets_7d_sub || 'helpdesk routing'}
          </div>
        </div>
      </div>

      {/* Explanatory Banner: HOW EXPORT WORKS FOR TEXT */}
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
          HOW EXPORT WORKS FOR TEXT
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
          {data?.header?.info_banner ||
            'Two things leave Datalift. The data: any tagged version of the tickets, masked and labeled, as JSONL or a Hugging Face dataset. The model: the helpdesk sends each new ticket and gets a label back, with the tokenizer, the label list and the masking rules inside the package. When the model is unsure, the answer says so and the ticket goes to a human.'}
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
            {data?.datasets?.subtitle || 'EVERY TAGGED VERSION, IN A STANDARD FORMAT'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Versions Table + Format Cards */}
          <div>
            {/* Versions Table */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
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
                    <th style={{ padding: '0.6rem 0.5rem' }}>VERSION</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>SIZE</th>
                    <th style={{ padding: '0.6rem 0.5rem' }}>MADE FROM</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>STATE</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.datasets?.versions || []).map((v) => {
                    const isSelected = selectedVersion === v.version;
                    return (
                      <tr
                        key={v.version}
                        onClick={() => setSelectedVersion(v.version)}
                        style={{
                          borderBottom: `1px solid ${C.border}`,
                          backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                          outline: isSelected ? `1px solid ${C.amberBorder}` : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: C.text }}>
                          {v.version}
                        </td>
                        <td
                          style={{
                            padding: '0.75rem 0.5rem',
                            color: v.size === '[RESULT]' ? C.amber : C.text,
                            fontWeight: v.size === '[RESULT]' ? 'bold' : 'normal',
                          }}
                        >
                          {v.size}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{v.made_from}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                          <span
                            style={{
                              fontSize: '0.62rem',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '3px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              border:
                                v.state === 'DRAFT'
                                  ? '1px dashed #6b7280'
                                  : v.state === 'CURRENT'
                                  ? '1px solid #f59e0b'
                                  : '1px solid #d97706',
                              color:
                                v.state === 'CURRENT'
                                  ? '#000'
                                  : v.state === 'TAGGED'
                                  ? '#f59e0b'
                                  : '#9ca3af',
                              backgroundColor: v.state === 'CURRENT' ? '#f59e0b' : 'transparent',
                            }}
                          >
                            {v.state}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* DATA FORMAT · PICK ONE */}
            <div style={{ marginBottom: '0.6rem' }}>
              <div
                style={{
                  fontSize: '0.64rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                }}
              >
                DATA FORMAT · PICK ONE
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {(data?.datasets?.formats || [
                  { id: 'jsonl', name: 'JSON Lines', desc: 'One ticket per line with its label.' },
                  { id: 'hf', name: 'Hugging Face', desc: 'A datasets folder, ready for fine-tuning.' },
                  { id: 'csv', name: 'CSV', desc: 'Text and label columns, for quick checks.' },
                  { id: 'parquet', name: 'Parquet', desc: 'Small and typed, with embeddings if asked.' },
                ]).map((fmt) => {
                  const isSelected = selectedDataFormat === fmt.id;
                  return (
                    <div
                      key={fmt.id}
                      onClick={() => setSelectedDataFormat(fmt.id)}
                      style={{
                        backgroundColor: C.card,
                        border: isSelected ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`,
                        borderRadius: '6px',
                        padding: '1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.1)' : 'none',
                      }}
                    >
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedDataFormat(fmt.id)}
                        style={{ accentColor: C.amber, marginTop: '0.15rem' }}
                      />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: C.text }}>
                          {fmt.name}
                        </div>
                        <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.2rem' }}>
                          {fmt.desc}
                        </div>
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
                What goes in the export
              </h3>

              {/* Checkboxes List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
                {[
                  { key: 'keep_splits', label: 'Keep the splits from 04', sub: 'train / val / test · by ticket_id' },
                  { key: 'mask_pii', label: 'Personal data masked', sub: 'always · [PHONE] [EMAIL] [NAME]' },
                  { key: 'include_paraphrases', label: 'Include paraphrases', sub: 'train only, marked as generated' },
                  { key: 'add_embeddings', label: 'Add language and embeddings', sub: 'one vector per ticket' },
                  { key: 'add_label_history', label: 'Add label history from 05', sub: 'who changed a label, when and why' },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={exportOptions[opt.key] ?? false}
                      onChange={(e) =>
                        setExportOptions((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                      }
                      style={{ accentColor: C.amber, marginTop: '0.15rem' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: C.text }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted }}>
                        {opt.sub}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Summary Chip */}
              <div
                style={{
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: C.amberLight,
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: `1px solid ${C.amberBorder}`,
                  borderRadius: '4px',
                  padding: '0.45rem 0.75rem',
                  marginBottom: '1rem',
                  fontWeight: 600,
                }}
              >
                {data?.dataset_name || 'tickets'}@{selectedVersion} ·{' '}
                {selectedDataFormat === 'jsonl'
                  ? 'JSON Lines'
                  : selectedDataFormat === 'hf'
                  ? 'Hugging Face'
                  : selectedDataFormat === 'csv'
                  ? 'CSV'
                  : 'Parquet'}{' '}
                · {data?.datasets?.versions?.find((v) => v.version === selectedVersion)?.size || '60,089 tickets'}
              </div>

              {/* Code Box */}
              <div
                style={{
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.border}`,
                  borderRadius: '5px',
                  padding: '0.85rem',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: '#d1d5db',
                  lineHeight: 1.5,
                  marginBottom: '1.25rem',
                  overflowX: 'auto',
                }}
              >
                <div style={{ color: C.textMuted, marginBottom: '0.25rem' }}># Python</div>
                <div>import datalift</div>
                <div>ds = datalift.load("{data?.dataset_name || 'tickets'}@{selectedVersion}", split="train")</div>
                <div style={{ color: C.textMuted, marginTop: '0.6rem', marginBottom: '0.25rem' }}># REST</div>
                <div style={{ color: C.amberLight }}>
                  GET [YOUR DOMAIN]/v1/datasets/{data?.dataset_name?.split('.')[0] || 'tickets'}/{selectedVersion}/export?format={selectedDataFormat}&split=all
                </div>
              </div>
            </div>

            {/* Action Buttons & Footnote */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.75rem', marginBottom: '0.6rem' }}>
                <button
                  type="button"
                  onClick={handleDownloadDataset}
                  style={{
                    backgroundColor: C.amber,
                    color: '#000',
                    border: 'none',
                    padding: '0.55rem',
                    borderRadius: '4px',
                    fontSize: '0.76rem',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Download {data?.dataset_name?.split('.')[0] || 'tickets'}@{selectedVersion}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `curl -X GET "https://api.datalift.ai/v1/datasets/${data?.dataset_name?.split('.')[0] || 'tickets'}/${selectedVersion}/export?format=${selectedDataFormat}&split=all" -H "Authorization: Bearer $DATALIFT_KEY"`,
                      'Appel API'
                    )
                  }
                  style={{
                    backgroundColor: '#16171b',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.55rem',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Copy API call
                </button>
              </div>

              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted }}>
                Only tagged versions download. A draft can be previewed, not exported.
              </div>
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
            {data?.model_package?.subtitle || 'ONE MODEL, ONE PACKAGE, EVERYTHING IT NEEDS'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Model Package Formats */}
          <div>
            <div
              style={{
                fontSize: '0.64rem',
                fontFamily: 'monospace',
                color: C.textMuted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '0.75rem',
              }}
            >
              FORMAT · PICK ONE
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              {(data?.model_package?.formats || [
                { id: 'hf_model', name: 'Hugging Face', desc: 'Model and tokenizer in the standard folder layout.', tag: 'FURTHER TRAINING · RESEARCH' },
                { id: 'onnx', name: 'ONNX', desc: 'Faster on CPU, same labels as in 06.', tag: 'YOUR OWN BACKEND' },
                { id: 'docker', name: 'Docker image', desc: 'A REST API with masking and routing built in.', tag: 'HELPDESK · REAL TIME' },
                { id: 'batch_jsonl', name: 'Batch JSONL', desc: 'Labels a file of tickets and writes one answer per line.', tag: 'BACKLOG · REPORTS' },
              ]).map((fmt) => {
                const isSelected = selectedModelFormat === fmt.id;
                return (
                  <div
                    key={fmt.id}
                    onClick={() => setSelectedModelFormat(fmt.id)}
                    style={{
                      backgroundColor: C.card,
                      border: isSelected ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`,
                      borderRadius: '6px',
                      padding: '1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.1)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedModelFormat(fmt.id)}
                        style={{ accentColor: C.amber, marginTop: '0.15rem' }}
                      />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: C.text }}>
                          {fmt.name}
                        </div>
                        <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.2rem' }}>
                          {fmt.desc}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '0.58rem',
                        fontFamily: 'monospace',
                        color: isSelected ? C.amber : C.textMuted,
                        letterSpacing: '0.08em',
                        marginTop: '0.85rem',
                        textTransform: 'uppercase',
                        paddingLeft: '1.4rem',
                      }}
                    >
                      {fmt.tag}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted }}>
              {data?.model_package?.footnote ||
                'Every format is tested on 1,000 locked tickets in the 4 languages before it is published.'}
            </div>
          </div>

          {/* Right Column: What ships with it */}
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
                What ships with it
              </h3>

              {/* Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {(data?.model_package?.checklist || [
                  { title: 'Model · ticket-cls-v4', desc: 'XLM-R base · weights and version' },
                  { title: 'Tokenizer', desc: 'the one used in training · max 512, longer tickets in chunks' },
                  { title: 'Label list · 7 labels', desc: 'a new label means a new version' },
                  { title: 'Masking rules', desc: '[PHONE] [EMAIL] [NAME] · applied before the model sees text' },
                  { title: 'Routing threshold', desc: 'send to a human when unsure · set in 06' },
                  { title: 'Model card', desc: 'per-language metrics, known limits' },
                ]).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                    <div style={{ marginTop: '0.1rem' }}>
                      <Check size={14} color={C.green} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: C.text }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Snippet box */}
              <div
                style={{
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.border}`,
                  borderRadius: '4px',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: C.amberLight,
                  marginBottom: '1.25rem',
                }}
              >
                {`datalift export ${data?.header?.model_name || 'ticket-cls-v4'} --format ${
                  selectedModelFormat === 'docker'
                    ? 'docker-image'
                    : selectedModelFormat === 'hf_model'
                    ? 'huggingface'
                    : selectedModelFormat === 'onnx'
                    ? 'onnx'
                    : 'batch-jsonl'
                }`}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleBuildPackage}
                style={{
                  backgroundColor: '#16171b',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.55rem',
                  borderRadius: '4px',
                  fontSize: '0.74rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Build package
              </button>

              <button
                type="button"
                onClick={() => {
                  setNotification('✓ Model card générée (Markdown format).');
                  setTimeout(() => setNotification(null), 3000);
                }}
                style={{
                  backgroundColor: '#16171b',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.55rem',
                  borderRadius: '4px',
                  fontSize: '0.74rem',
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
            {data?.deploy?.subtitle || 'STAGING, SHADOW, CANARY, THEN PRODUCTION'}
          </span>
        </div>

        {/* Stepper Pipeline */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          {(data?.deploy?.steps || [
            { num: 1, title: '1 · BUILD', name: 'Package built', status: 'done', detail: '✓ done · 6 min' },
            { num: 2, title: '2 · TEST', name: '1,000 locked tickets', status: 'done', detail: '✓ same labels as 06' },
            { num: 3, title: '3 · STAGING', name: 'Endpoint ready', status: 'active', detail: 'now · try it below' },
            { num: 4, title: '4 · SHADOW', name: 'Next to ticket-cls-v3', status: 'waiting', detail: 'waiting · 7 days' },
            { num: 5, title: '5 · CANARY', name: '10% → 50% of tickets', status: 'waiting', detail: 'waiting · per language' },
            { num: 6, title: '6 · PRODUCTION', name: 'Darija reviewer approves', status: 'waiting', detail: 'waiting' },
          ]).map((step) => {
            const isActive = step.status === 'active';
            const isDone = step.status === 'done';
            return (
              <div
                key={step.num}
                style={{
                  backgroundColor: C.card,
                  border: isActive ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '0.85rem 0.95rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isActive ? '0 0 16px rgba(245, 158, 11, 0.12)' : 'none',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '0.62rem',
                      fontFamily: 'monospace',
                      color: isActive ? C.amberLight : C.textMuted,
                      letterSpacing: '0.08em',
                      fontWeight: 'bold',
                      marginBottom: '0.35rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    {step.title}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.text, marginBottom: '0.4rem' }}>
                    {step.name}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: isDone ? C.green : isActive ? C.amber : C.textMuted,
                  }}
                >
                  {step.detail}
                </div>
              </div>
            );
          })}
        </div>

        {/* Deploy Options Row (3 Cards) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {(data?.deploy?.options || [
            { id: 'datalift_hosted', title: 'Hosted by Datalift', desc: 'An HTTPS endpoint the helpdesk calls for each new ticket.' },
            { id: 'your_server', title: 'Your server', desc: 'Run the Docker image near the helpdesk. CPU is enough with ONNX.' },
            { id: 'webhook', title: 'Webhook', desc: 'Datalift receives tickets from the helpdesk and posts the label back.' },
          ]).map((opt) => {
            const isSelected = selectedDeployOption === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setSelectedDeployOption(opt.id)}
                style={{
                  backgroundColor: C.card,
                  border: isSelected ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isSelected ? '0 0 16px rgba(245, 158, 11, 0.12)' : 'none',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '0.6rem',
                      fontFamily: 'monospace',
                      color: isSelected ? C.amberLight : C.textMuted,
                      letterSpacing: '0.12em',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      marginBottom: '0.45rem',
                    }}
                  >
                    {isSelected ? 'SELECTED' : 'OPTION'}
                  </div>
                  <h3
                    style={{
                      fontFamily: 'Newsreader, Georgia, serif',
                      fontStyle: 'italic',
                      fontSize: '1.2rem',
                      color: '#f4f4f6',
                      margin: '0 0 0.45rem 0',
                    }}
                  >
                    {opt.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '0.74rem',
                      fontFamily: 'monospace',
                      color: '#9ca3af',
                      lineHeight: 1.45,
                      margin: 0,
                    }}
                  >
                    {opt.desc}
                  </p>
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
            {data?.api?.subtitle || 'SAME MASKS, SAME THRESHOLDS AS IN 06'}
          </span>
        </div>

        {/* API Endpoint Bar */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                backgroundColor: C.amber,
                color: '#000',
                padding: '0.2rem 0.55rem',
                borderRadius: '3px',
              }}
            >
              POST
            </span>
            <span style={{ fontSize: '0.84rem', fontFamily: 'monospace', color: C.text, fontWeight: 600 }}>
              {data?.api?.endpoint_path || '[YOUR DOMAIN]/v1/tickets/classify'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => handleCopy(data?.api?.endpoint_path || 'https://api.datalift.ai/v1/tickets/classify', 'URL Endpoint')}
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

        {/* 3-Column API Grid: Request / Response / Keys & Webhooks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.1fr', gap: '1rem' }}>
          {/* Column 1: Request Curl & Python */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.64rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '0.45rem',
                }}
              >
                <span>REQUEST · CURL</span>
                <button
                  type="button"
                  onClick={() => handleCopy(data?.api?.curl_snippet || '', 'Curl snippet')}
                  style={{ background: 'none', border: 'none', color: C.amber, cursor: 'pointer', fontSize: '0.62rem' }}
                >
                  Copy
                </button>
              </div>

              <pre
                style={{
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.border}`,
                  borderRadius: '4px',
                  padding: '0.75rem',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: '#e5e7eb',
                  lineHeight: 1.45,
                  margin: 0,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {data?.api?.curl_snippet ||
                  `curl -X POST [YOUR DOMAIN]/v1/tickets/classify \\\n  -H "Authorization: Bearer $DATALIFT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "ticket_id": "#60114",\n    "text": "khlsst w ma wslni walo, bghit flousi, rani 3ytt 3la 0612345678"\n  }'`}
              </pre>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.64rem',
                  fontFamily: 'monospace',
                  color: C.textMuted,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '0.45rem',
                }}
              >
                <span>REQUEST · PYTHON</span>
                <button
                  type="button"
                  onClick={() => handleCopy(data?.api?.python_snippet || '', 'Python snippet')}
                  style={{ background: 'none', border: 'none', color: C.amber, cursor: 'pointer', fontSize: '0.62rem' }}
                >
                  Copy
                </button>
              </div>

              <pre
                style={{
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.border}`,
                  borderRadius: '4px',
                  padding: '0.75rem',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: '#e5e7eb',
                  lineHeight: 1.45,
                  margin: 0,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {data?.api?.python_snippet ||
                  `from datalift import Client\nimport os\n\ndl = Client(api_key=os.environ["DATALIFT_KEY"])\n\nr = dl.classify("tickets", {\n  "ticket_id": "#60114",\n  "text": "khlsst w ma wslni walo, bghit flousi",\n})\nif r.route_to_human:\n  send_to_agent(r.ticket_id)\nelse:\n  route(r.label)`}
              </pre>
            </div>
          </div>

          {/* Column 2: Response JSON */}
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
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.64rem',
                fontFamily: 'monospace',
                color: C.textMuted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '0.45rem',
              }}
            >
              <span>RESPONSE</span>
              <button
                type="button"
                onClick={() => handleCopy(data?.api?.response_json || '', 'Response JSON')}
                style={{ background: 'none', border: 'none', color: C.amber, cursor: 'pointer', fontSize: '0.62rem' }}
              >
                Copy
              </button>
            </div>

            <pre
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                padding: '0.75rem',
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                color: '#fbbf24',
                lineHeight: 1.45,
                margin: 0,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                height: 'calc(100% - 24px)',
                boxSizing: 'border-box',
              }}
            >
              {data?.api?.response_json ||
                `{\n  "ticket_id": "#60114",\n  "language": "darija",\n  "label": "refund",\n  "top3": [\n    {"label": "refund", "score": [RESULT]},\n    {"label": "billing", "score": [RESULT]},\n    {"label": "delivery", "score": [RESULT]}\n  ],\n  "route_to_human": true,\n  "masked_text": "khlsst w ma wslni walo, bghit flousi, rani 3ytt 3la [PHONE]",\n  "model": "ticket-cls-v4"\n}`}
            </pre>
          </div>

          {/* Column 3: API keys & Webhooks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* API Keys Card */}
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.85rem',
                }}
              >
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: C.text }}>API keys</div>
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(true)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Create key
                </button>
              </div>

              {/* Keys list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
                {(data?.api?.api_keys || [
                  { name: 'Helpdesk routing', key_masked: 'dl_live_****8e21 · classify', status: 'LIVE', last_used: 'used 1 min ago' },
                  { name: 'Weekly report', key_masked: 'dl_live_****c3d0 · classify · batch', status: 'LIVE', last_used: 'used 4 days ago' },
                  { name: 'Staging tests', key_masked: 'dl_test_****77ab · classify', status: 'TEST', last_used: 'used today' },
                ]).map((k, idx) => (
                  <div
                    key={idx}
                    style={{
                      borderBottom: idx < 2 ? `1px solid ${C.border}` : 'none',
                      paddingBottom: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: C.text }}>{k.name}</div>
                      <div style={{ fontSize: '0.64rem', fontFamily: 'monospace', color: C.textMuted }}>
                        {k.key_masked}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '0.58rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '2px',
                          fontWeight: 'bold',
                          border: `1px solid ${k.status === 'LIVE' ? C.amber : '#6b7280'}`,
                          color: k.status === 'LIVE' ? C.amber : '#9ca3af',
                          backgroundColor: k.status === 'LIVE' ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                        }}
                      >
                        {k.status}
                      </span>
                      <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: C.textFaint, marginTop: '0.15rem' }}>
                        {k.last_used}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rate limit info */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: '0.6rem',
                  marginBottom: '0.5rem',
                }}
              >
                <div>
                  <span style={{ color: C.textMuted }}>RATE LIMIT : </span>
                  <span style={{ color: C.text, fontWeight: 'bold' }}>50 req / s</span>
                </div>
                <div>
                  <span style={{ color: C.textMuted }}>MAX INPUT : </span>
                  <span style={{ color: C.text, fontWeight: 'bold' }}>200 tickets / call</span>
                </div>
              </div>

              <div style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: C.textFaint }}>
                A key is shown once, scoped to one project, and can be revoked at any time.
              </div>
            </div>

            {/* Webhooks Card */}
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.85rem',
                }}
              >
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: C.text }}>Webhooks</div>
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(true)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Add webhook
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '0.75rem' }}>
                {(data?.api?.webhooks || [
                  { event: 'dataset.version_tagged', desc: 'a new version is tagged in 04', enabled: true },
                  { event: 'model.promoted', desc: 'a version reaches production', enabled: true },
                  { event: 'drift.alert', desc: 'an alert is raised in 08', enabled: true },
                  { event: 'topic.new_cluster', desc: 'a cluster passes 100 tickets', enabled: true },
                ]).map((wh) => {
                  const isEnabled = webhookStates[wh.event] ?? wh.enabled;
                  return (
                    <div
                      key={wh.event}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 600, color: C.text }}>
                          {wh.event}
                        </div>
                        <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted }}>
                          {wh.desc}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setWebhookStates((prev) => ({ ...prev, [wh.event]: !isEnabled }))
                        }
                        style={{
                          fontSize: '0.62rem',
                          fontFamily: 'monospace',
                          fontWeight: 'bold',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '3px',
                          border: `1px solid ${isEnabled ? C.amber : '#4b5563'}`,
                          color: isEnabled ? C.amber : '#9ca3af',
                          backgroundColor: isEnabled ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        {isEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted }}>
                POST → [YOUR URL] · signed with a secret
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '0.85rem', fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted }}>
          {data?.api?.footnote ||
            'route_to_human is true when the top two labels are too close. Only the masked text is logged; the raw text is never stored.'}
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
            {data?.versions_traffic?.subtitle || 'EVERY PREDICTION IS LOGGED WITH ITS MODEL VERSION'}
          </span>
        </div>

        {/* 4 KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          {(data?.versions_traffic?.kpis || [
            { title: 'LATENCY · P50', value: '[RESULT]', tooltip: 'P50: ~18ms', sub: 'per ticket · CPU' },
            { title: 'LATENCY · P95', value: '[RESULT]', tooltip: 'P95: ~45ms', sub: 'long tickets in chunks' },
            { title: 'SENT TO A HUMAN', value: '[RESULT]', tooltip: 'Routing: ~14.8%', sub: 'route_to_human = true' },
            { title: 'ERROR RATE', value: '[RESULT]', tooltip: 'Errors: 0.02%', sub: 'empty or too long texts apart' },
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

        {/* Versions Table */}
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
                <th style={{ padding: '0.6rem 0.5rem' }}>VERSION</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>RUNS ON</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>STATUS</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>TRAFFIC</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>P95</th>
                <th style={{ padding: '0.6rem 0.5rem' }}>ERRORS</th>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {(data?.versions_traffic?.rows || [
                { version: 'ticket-cls-v3', runs_on: 'Hosted · production', status: 'PRODUCTION', traffic: '100%', p95: '[RESULT]', errors: '[RESULT]', action_label: 'Roll back to v2', action_key: 'rollback' },
                { version: 'ticket-cls-v4', runs_on: 'Hosted · staging', status: 'STAGING', traffic: 'shadow', p95: '[RESULT]', errors: '[RESULT]', action_label: 'Request promotion', action_key: 'promote' },
                { version: 'ticket-cls-v2', runs_on: '—', status: 'ARCHIVED', traffic: '0%', p95: '—', errors: '—', action_label: 'Restore', action_key: 'restore' },
              ]).map((row, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: C.text }}>{row.version}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: C.textMuted }}>{row.runs_on}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        fontWeight: 'bold',
                        border:
                          row.status === 'PRODUCTION'
                            ? `1px solid ${C.amber}`
                            : row.status === 'STAGING'
                            ? `1px solid ${C.amber}`
                            : '1px solid #4b5563',
                        color:
                          row.status === 'PRODUCTION'
                            ? '#000'
                            : row.status === 'STAGING'
                            ? C.amber
                            : '#9ca3af',
                        backgroundColor: row.status === 'PRODUCTION' ? C.amber : 'transparent',
                      }}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: C.text }}>{row.traffic}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: row.p95 === '[RESULT]' ? C.amber : C.text }}>
                    {row.p95}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: row.errors === '[RESULT]' ? C.amber : C.text }}>
                    {row.errors}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (row.action_key === 'rollback') {
                          setNotification('✓ Roll back vers v2 initié.');
                        } else if (row.action_key === 'promote') {
                          setShowDeployModal(true);
                        } else if (row.action_key === 'restore') {
                          setNotification('✓ Version v2 restaurée en staging.');
                        }
                        setTimeout(() => setNotification(null), 3500);
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
                      {row.action_label}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '0.85rem', fontSize: '0.66rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.versions_traffic?.footnote ||
              'Logged predictions feed 08 Drift and the 07 pool. Agent corrections become labels for the next version.'}
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
            CHECKED BEFORE EVERY EXPORT AND SWITCH
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {(data?.guardrails || [
            { title: 'Only a reviewed model exports', desc: 'Approved by a darija-speaking reviewer', status: 'ok' },
            { title: 'Same labels as in 06', desc: 'Tested on 1,000 locked tickets', status: 'ok' },
            { title: 'Masking before the model', desc: 'Raw text is never logged', status: 'ok' },
            { title: 'One ticket, one answer', desc: 'Chunks are predicted together', status: 'ok' },
            { title: 'No language may regress', desc: 'Per-language F1 checked before switch', status: 'ok' },
            { title: 'Roll back in one click', desc: 'The previous version stays warm', status: 'ok' },
            { title: 'Keys scoped per project', desc: 'Shown once, revocable, never in logs', status: 'ok' },
            { title: 'Cluster 23 has no label yet', desc: 'OTP tickets will often go to a human', status: 'warn' },
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
      {/* BOTTOM STICKY ACTION BAR */}
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
            {data?.bottom_bar?.title || 'ticket-cls-v4 · Docker image · staging endpoint ready'}
          </div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
            {data?.bottom_bar?.sub || 'Next: 7 days of shadow next to ticket-cls-v3, then the darija reviewer approves'}
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
            {data?.bottom_bar?.action_left || '← Back to drift'}
          </button>

          <button
            type="button"
            onClick={() => setShowDeployModal(true)}
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
            {data?.bottom_bar?.action_right || 'Deploy to staging'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: VERSION HISTORY */}
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
              width: '680px',
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
                Version history · {data?.dataset_name || 'tickets'}
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
                  <th style={{ padding: '0.5rem' }}>VERSION</th>
                  <th style={{ padding: '0.5rem' }}>DEPLOY DATE</th>
                  <th style={{ padding: '0.5rem' }}>MODEL</th>
                  <th style={{ padding: '0.5rem' }}>STATUS</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { version: 'v4', date: '14 Nov (Today)', model: 'ticket-cls-v4 (XLM-R)', status: 'STAGING' },
                  { version: 'v3', date: '04 Nov 2026', model: 'ticket-cls-v3 (XLM-R)', status: 'PRODUCTION' },
                  { version: 'v2', date: '21 Oct 2026', model: 'ticket-cls-v2 (DistilBERT)', status: 'ARCHIVED' },
                  { version: 'v1', date: '05 Oct 2026', model: 'ticket-cls-v1 (Baseline)', status: 'ARCHIVED' },
                ].map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 'bold', color: C.text }}>{row.version}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.textMuted }}>{row.date}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.text }}>{row.model}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '2px',
                          fontWeight: 'bold',
                          color: row.status === 'PRODUCTION' ? '#000' : row.status === 'STAGING' ? C.amber : '#9ca3af',
                          backgroundColor: row.status === 'PRODUCTION' ? C.amber : 'transparent',
                          border: `1px solid ${row.status === 'PRODUCTION' ? C.amber : row.status === 'STAGING' ? C.amber : '#4b5563'}`,
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVersion(row.version);
                          setShowHistoryModal(false);
                          setNotification(`✓ Version ${row.version} sélectionnée pour l'export.`);
                          setTimeout(() => setNotification(null), 3000);
                        }}
                        style={{
                          backgroundColor: 'transparent',
                          border: `1px solid ${C.borderLight}`,
                          color: C.text,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '3px',
                          fontSize: '0.68rem',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                        }}
                      >
                        Inspect
                      </button>
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
      {/* MODAL 2: CREATE API KEY */}
      {/* ========================================================================= */}
      {showApiKeyModal && (
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
                Create API key
              </h3>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                KEY NAME
              </label>
              <input
                type="text"
                placeholder="e.g. Helpdesk CRM Integration"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
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

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                PERMISSION SCOPE
              </label>
              <select
                value={newKeyScope}
                onChange={(e) => setNewKeyScope(e.target.value)}
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
              >
                <option value="classify">Classify tickets only (real-time inference)</option>
                <option value="classify_batch">Classify + Batch inference</option>
                <option value="admin">Admin (full access + export)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
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
                Generate key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD WEBHOOK */}
      {/* ========================================================================= */}
      {showWebhookModal && (
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
                Add webhook subscription
              </h3>
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                TARGET URL
              </label>
              <input
                type="text"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
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

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                TRIGGER EVENT
              </label>
              <select
                value={newWebhookEvent}
                onChange={(e) => setNewWebhookEvent(e.target.value)}
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
              >
                <option value="drift.alert">drift.alert (when drift passes tolerance)</option>
                <option value="topic.new_cluster">topic.new_cluster (when outlier cluster exceeds 100 tickets)</option>
                <option value="model.promoted">model.promoted (when candidate model is deployed to production)</option>
                <option value="dataset.version_tagged">dataset.version_tagged (when new dataset version is tagged)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
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
                Add webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DEPLOY TO STAGING CONFIRMATION */}
      {/* ========================================================================= */}
      {showDeployModal && (
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
                Deploy candidate to staging
              </h3>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Candidate model <strong>{data?.header?.model_name || 'ticket-cls-v4'}</strong> will be pushed to the staging
              endpoint. It will shadow production traffic alongside{' '}
              <strong>{data?.header?.in_production || 'ticket-cls-v3'}</strong> for 7 days before human reviewer sign-off.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
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
                onClick={handleDeployToStaging}
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
                Confirm deployment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: SWAGGER / OPENAPI SPEC PREVIEW */}
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
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.35rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                OpenAPI Specification · /v1/tickets/classify
              </h3>
              <button
                type="button"
                onClick={() => setShowSwaggerModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <pre
              style={{
                backgroundColor: '#090a0c',
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                padding: '1rem',
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                color: '#86efac',
                lineHeight: 1.45,
                maxHeight: '360px',
                overflowY: 'auto',
                margin: '0 0 1.25rem 0',
              }}
            >
{`openapi: 3.0.3
info:
  title: Datalift Text Classification Serving API
  version: 1.0.0
paths:
  /v1/tickets/classify:
    post:
      summary: Real-time ticket classification with PII masking & triage routing
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [ticket_id, text]
              properties:
                ticket_id: { type: string, example: "#60114" }
                text: { type: string, example: "khlsst w ma wslni walo..." }
      responses:
        '200':
          description: Predicted class with calibrated confidence and fallback
          content:
            application/json:
              schema:
                type: object
                properties:
                  ticket_id: { type: string }
                  language: { type: string }
                  label: { type: string }
                  route_to_human: { type: boolean }
                  masked_text: { type: string }
                  model: { type: string }`}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => handleCopy('https://api.datalift.ai/openapi.json', 'Lien OpenAPI')}
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
                Copy OpenAPI URL
              </button>
              <button
                type="button"
                onClick={() => setShowSwaggerModal(false)}
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

