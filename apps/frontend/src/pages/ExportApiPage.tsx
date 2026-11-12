import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import {
  Dataset,
  ExportApiStateResponse,
  ExportDatasetOptions,
} from '../types';

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardSub: '#16171b',
  border: '#23252a',
  borderActive: '#f59e0b',
  amber: '#f59e0b',
  amberDark: '#78350f',
  green: '#22c55e',
  red: '#ef4444',
  muted: '#71717a',
  text: '#e5e7eb',
  textMuted: '#9ca3af',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: C.bg,
    minHeight: '100vh',
    color: C.text,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    paddingBottom: 120,
  },
  section: {
    maxWidth: 1180,
    margin: '0 auto',
    padding: '0 32px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 48,
    marginBottom: 20,
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Georgia, serif',
    fontStyle: 'italic',
    fontSize: 28,
    fontWeight: 400,
    color: C.text,
    margin: 0,
  },
  sectionSub: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    color: C.muted,
    textTransform: 'uppercase' as const,
  },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
  },
  tag: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: 700,
  },
  btnDark: {
    background: '#1a1b1f',
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  btnAmber: {
    background: C.amber,
    color: '#000',
    border: 'none',
    borderRadius: 6,
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  codeBox: {
    background: '#090a0c',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '14px 16px',
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#d4d4d8',
    lineHeight: 1.6,
    overflowX: 'auto' as const,
    whiteSpace: 'pre' as const,
  },
};

// ─── Format Card Component ──────────────────────────────────────────────────
function FormatCard({
  name,
  description,
  tag,
  selected,
  onSelect,
}: {
  name: string;
  description: string;
  tag?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        ...styles.card,
        padding: '16px',
        cursor: 'pointer',
        border: `1px solid ${selected ? C.amber : C.border}`,
        borderRadius: 6,
        background: selected ? '#15161a' : C.card,
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: selected ? C.text : '#d1d5db' }}>{name}</div>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: `2px solid ${selected ? C.amber : C.muted}`,
            background: selected ? C.amber : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#000' }} />}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{description}</div>
      {tag && (
        <div style={{ marginTop: 12, fontFamily: 'monospace', fontSize: 9, color: C.muted, letterSpacing: 1.2 }}>
          {tag}
        </div>
      )}
    </div>
  );
}

// ─── Main Export / API Page ─────────────────────────────────────────────────
export function ExportApiPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string>(() => localStorage.getItem('datalift_selected_dataset_id') || '');
  const [state, setState] = useState<ExportApiStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [apiCodeTab, setApiCodeTab] = useState<'curl' | 'Python' | 'JavaScript'>('curl');
  const [dataCodeTab, setDataCodeTab] = useState<'Python' | 'REST'>('Python');
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const showNotif = useCallback((msg: string, ok = true) => setNotif({ msg, ok }), []);

  // Fetch datasets and sync with localStorage / global events
  useEffect(() => {
    api.getDatasets()
      .then((list) => {
        setDatasets(list);
        if (list.length > 0) {
          const stored = localStorage.getItem('datalift_selected_dataset_id');
          const match = list.find((d) => d.id === stored);
          const current = match ? match.id : list[0].id;
          setSelectedId(current);
          localStorage.setItem('datalift_selected_dataset_id', current);
        }
      })
      .catch(() => {});

    const onGlobalChange = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setSelectedId(e.detail);
      }
    };
    window.addEventListener('datalift:dataset-changed', onGlobalChange);
    return () => window.removeEventListener('datalift:dataset-changed', onGlobalChange);
  }, []);

  const handleDatasetChange = (newId: string) => {
    setSelectedId(newId);
    localStorage.setItem('datalift_selected_dataset_id', newId);
    window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: newId }));
  };

  // Load state when dataset changes
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api.getExportApiState(selectedId)
      .then((s) => {
        setState(s);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load Export/API state', err);
        setLoading(false);
        showNotif('Erreur de chargement de la page Export / API', false);
      });
  }, [selectedId, showNotif]);

  // Listen to TopBar events
  useEffect(() => {
    const onHistory = () => setShowVersionHistory(true);
    const onDeploy = () => handleDeploy();
    window.addEventListener('datalift:open-version-history', onHistory);
    window.addEventListener('datalift:deploy-to-staging', onDeploy);
    return () => {
      window.removeEventListener('datalift:open-version-history', onHistory);
      window.removeEventListener('datalift:deploy-to-staging', onDeploy);
    };
  });

  const updateSetting = useCallback(
    async (patch: {
      data_format?: string;
      model_format?: string;
      deploy_target?: string;
      export_options?: ExportDatasetOptions;
    }) => {
      if (!selectedId) return;
      try {
        const updated = await api.updateExportSettings(selectedId, patch);
        setState(updated);
      } catch (err) {
        showNotif('Erreur de mise à jour des paramètres', false);
      }
    },
    [selectedId, showNotif]
  );

  const handleDeploy = useCallback(async () => {
    if (!selectedId || isDeploying) return;
    setIsDeploying(true);
    try {
      const res = await api.deployToStaging(selectedId);
      showNotif(res.message, true);
    } catch {
      showNotif('Déploiement vers staging échoué', false);
    } finally {
      setIsDeploying(false);
    }
  }, [selectedId, isDeploying, showNotif]);

  const handleCopy = useCallback(
    (text: string, label = 'Copié') => {
      navigator.clipboard.writeText(text).then(() => showNotif(`${label} dans le presse-papiers`));
    },
    [showNotif]
  );

  const curVer = useMemo(() => {
    if (!state) return null;
    return state.dataset_versions.find((v) => v.is_current) || state.dataset_versions[0];
  }, [state]);

  if (loading && !state) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.amber, fontFamily: 'monospace', fontSize: 13, letterSpacing: 1 }}>
          CHARGEMENT DE LA PAGE EXPORT / API…
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.muted }}>Sélectionnez un dataset pour afficher les options d'export et d'API.</div>
      </div>
    );
  }

  const h = state.header;
  const primaryFeature = h.feature_columns[0] || 'feature';
  const idCol = h.feature_columns.find(c => c.includes('id')) || 'customer_id';

  return (
    <div style={styles.page}>
      {/* Toast Notification */}
      {notif && (
        <div
          style={{
            position: 'fixed',
            bottom: 84,
            right: 28,
            background: notif.ok ? '#14532d' : '#7f1d1d',
            border: `1px solid ${notif.ok ? C.green : C.red}`,
            borderRadius: 6,
            padding: '10px 18px',
            color: '#fff',
            zIndex: 1000,
            fontSize: 12,
            fontFamily: 'monospace',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {notif.ok ? '✓ ' : '✗ '} {notif.msg}
        </div>
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <div
          onClick={() => setShowVersionHistory(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...styles.card, padding: 28, maxWidth: 480, width: '90%', background: '#121316' }}
          >
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 20, marginBottom: 16 }}>
              Historique des versions
            </div>
            {state.version_traffic.map((row) => (
              <div
                key={row.model_name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.model_name}</span>
                <span
                  style={{
                    ...styles.tag,
                    background: row.status === 'PRODUCTION' ? C.amberDark : '#1f2025',
                    color: row.status === 'PRODUCTION' ? C.amber : C.muted,
                  }}
                >
                  {row.status}
                </span>
              </div>
            ))}
            <button onClick={() => setShowVersionHistory(false)} style={{ ...styles.btnDark, marginTop: 18 }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ── TOP HEADER (Image 1) ────────────────────────────────────────── */}
      <div style={{ ...styles.section, paddingTop: 28 }}>
        {/* Dataset Switcher Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted, letterSpacing: 1.5 }}>
            DATASET SELECTION :
          </span>
          <select
            value={selectedId}
            onChange={(e) => handleDatasetChange(e.target.value)}
            style={{
              background: '#16171b',
              border: `1px solid ${C.border}`,
              color: C.text,
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
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
        </div>

        {/* Monospace uppercase breadcrumb */}
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted, marginBottom: 12 }}>
          {h.breadcrumb}
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1
              style={{
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: 44,
                fontWeight: 400,
                color: C.text,
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {h.candidate_model} · <span style={{ color: C.muted }}>{h.model_type}</span>
            </h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                ...styles.tag,
                border: `1px solid ${C.amberDark}`,
                color: C.amber,
                background: 'rgba(245, 158, 11, 0.08)',
                marginBottom: 6,
              }}
            >
              {h.approved_step}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 56, fontWeight: 900, color: C.amber, lineHeight: 1 }}>
              {String(h.versions_live).padStart(2, '0')}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted, letterSpacing: 1.5 }}>
              VERSIONS LIVE
            </div>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'MODEL', value: h.candidate_model, sub: 'trained on v4 · replayable', isAmber: false },
            {
              label: 'IN PRODUCTION',
              value: h.production_model,
              sub: `until ${h.candidate_model.split('-').slice(-1)[0] || '08'} passes shadow`,
              isAmber: false,
            },
            { label: 'ENDPOINT', value: h.endpoint, sub: 'production after review', isAmber: false },
            { label: 'CALLS · 7 DAYS', value: h.calls_7d, sub: 'CRM scoring and analysts', isAmber: true },
          ].map((k) => (
            <div key={k.label} style={{ ...styles.card, padding: '16px 20px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                {k.label}
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 16,
                  fontWeight: 700,
                  color: k.isAmber ? C.amber : C.text,
                }}
              >
                {k.value}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* HOW EXPORT WORKS FOR TABLES Blue Callout */}
        <div
          style={{
            background: '#0a101d',
            border: `1px solid #1e3a5f`,
            borderRadius: 6,
            padding: '16px 20px',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              color: '#60a5fa',
              marginBottom: 8,
              fontWeight: 700,
            }}
          >
            HOW EXPORT WORKS FOR TABLES
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
            Two things leave Datalift. The data: any tagged version, cleaned, labeled and split, in a standard format
            for a notebook or another tool. The model: packed with everything it learned around it (columns, encodings,
            the {h.threshold} threshold chosen for cost in 06) so the CRM gets the same answer as in evaluation. A new
            model goes to staging, runs next to {h.production_model} in shadow, then takes a growing share of calls before
            it replaces it.
          </div>
        </div>
      </div>

      {/* ── SECTION 1 · DATASETS (Image 1 & 2) ─────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>1 · Datasets</h2>
          <span style={styles.sectionSub}>EVERY TAGGED VERSION, IN A STANDARD FORMAT</span>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Left Column: Version Table + Format Cards */}
          <div style={{ flex: 1 }}>
            {/* Version table */}
            <div style={{ ...styles.card, marginBottom: 20, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 140px 1fr 100px',
                  padding: '10px 16px',
                  borderBottom: `1px solid ${C.border}`,
                  background: '#0f1012',
                }}
              >
                {['VERSION', 'SIZE', 'MADE FROM', 'STATE'].map((th) => (
                  <div key={th} style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted }}>
                    {th}
                  </div>
                ))}
              </div>
              {state.dataset_versions.map((v) => (
                <div
                  key={v.version_label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 140px 1fr 100px',
                    padding: '12px 16px',
                    borderBottom: `1px solid ${C.border}`,
                    borderLeft: v.is_current ? `3px solid ${C.amber}` : '3px solid transparent',
                    background: v.is_current ? '#141518' : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: v.is_current ? C.amber : C.text }}>
                    {v.version_label}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: v.row_count === '[RESULT]' ? C.amber : C.text }}>
                    {v.row_count}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{v.made_from}</div>
                  <div>
                    <span
                      style={{
                        ...styles.tag,
                        background: v.state === 'CURRENT' ? C.amber : v.state === 'TAGGED' ? '#1c1d22' : 'transparent',
                        color: v.state === 'CURRENT' ? '#000' : C.muted,
                        border: v.state === 'DRAFT' ? `1px dashed ${C.border}` : v.state === 'TAGGED' ? `1px solid ${C.border}` : 'none',
                      }}
                    >
                      {v.state}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Data Format Cards */}
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted, marginBottom: 10 }}>
              DATA FORMAT · PICK ONE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {state.dataset_formats.map((fmt) => (
                <FormatCard
                  key={fmt.format_id}
                  name={fmt.name}
                  description={fmt.description}
                  selected={state.selected_data_format === fmt.format_id}
                  onSelect={() => updateSetting({ data_format: fmt.format_id })}
                />
              ))}
            </div>
          </div>

          {/* Right Column: What goes in the export + Snippet Box */}
          <div style={{ width: 340, flexShrink: 0 }}>
            <div style={{ ...styles.card, padding: 18, marginBottom: 16 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17, marginBottom: 14 }}>
                What goes in the export
              </div>
              {[
                { key: 'keep_splits', label: 'Keep the splits from 04', sub: 'train / val / test as separate files' },
                { key: 'mask_pii', label: 'Personal data masked', sub: 'always · same masks as 02' },
                { key: 'include_smote', label: 'Include SMOTE rows', sub: 'train only, marked in a column' },
                { key: 'add_label_history', label: 'Add label history from 05', sub: 'who changed a label, when and why' },
                { key: 'include_not_yet', label: `Include the 62 "not yet" rows`, sub: 'outcome still unknown' },
              ].map((opt) => {
                const checked = state.export_options[opt.key as keyof ExportDatasetOptions];
                return (
                  <label key={opt.key} style={{ display: 'flex', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!checked}
                      onChange={(e) =>
                        updateSetting({
                          export_options: { ...state.export_options, [opt.key]: e.target.checked },
                        })
                      }
                      style={{ accentColor: C.amber, marginTop: 2, flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{opt.sub}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Code Snippet Box */}
            <div style={styles.card}>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, background: '#0f1012' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.amber }}>
                  {h.dataset_name}@{curVer?.version_label || 'v4'} · {state.selected_data_format.toUpperCase()} · {curVer?.row_count}
                </span>
              </div>
              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
                {(['Python', 'REST'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDataCodeTab(tab)}
                    style={{
                      padding: '6px 14px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: dataCodeTab === tab ? C.amber : C.muted,
                      borderBottom: dataCodeTab === tab ? `2px solid ${C.amber}` : '2px solid transparent',
                    }}
                  >
                    #{tab}
                  </button>
                ))}
              </div>
              <div style={{ ...styles.codeBox, borderRadius: 0, margin: 0, fontSize: 11, maxHeight: 130 }}>
                {dataCodeTab === 'Python' ? state.python_snippet : state.rest_snippet}
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
                <button
                  style={styles.btnAmber}
                  onClick={() => showNotif(`Téléchargement de ${h.dataset_name}@${curVer?.version_label}`)}
                >
                  Download {h.dataset_name}@{curVer?.version_label}
                </button>
                <button style={styles.btnDark} onClick={() => handleCopy(state.rest_snippet, 'Appel REST')}>
                  Copy API call
                </button>
              </div>
              <div style={{ padding: '0 14px 10px', fontSize: 10, color: C.muted }}>
                Only tagged versions download. A draft can be previewed, not exported.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2 · MODEL PACKAGE (Image 2 & 3) ─────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>2 · Model package</h2>
          <span style={styles.sectionSub}>ONE MODEL, ONE PACKAGE, EVERYTHING IT NEEDS</span>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Left Column: 4 Formats + Footnote */}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted, marginBottom: 10 }}>
              FORMAT · PICK ONE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
              {state.model_package_formats.map((fmt) => (
                <FormatCard
                  key={fmt.format_id}
                  name={fmt.name}
                  description={fmt.description}
                  tag={fmt.tag}
                  selected={state.selected_model_format === fmt.format_id}
                  onSelect={() => updateSetting({ model_format: fmt.format_id })}
                />
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Every format gives the same score for the same row: the package is tested on 1,000 locked rows before it is
              published.
            </div>
          </div>

          {/* Right Column: What ships with it + CLI Snippet Inside */}
          <div style={{ width: 340, flexShrink: 0 }}>
            <div style={{ ...styles.card, padding: 18 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17, marginBottom: 14 }}>
                What ships with it
              </div>
              {[
                { label: `Model · ${h.candidate_model}`, sub: 'weights, version, data hash a91f...c02' },
                { label: `Threshold ${h.threshold}`, sub: 'set for cost in 06 · returned with every answer' },
                {
                  label: 'Feature pipeline',
                  sub: `drops ${idCol} and cancel_date · ${primaryFeature} encoding fit on train`,
                },
                {
                  label: 'Input schema',
                  sub: `${h.feature_columns.length + 1} columns · types and allowed values · checked at the door`,
                },
                { label: 'Masks from 02', sub: 'personal data never stored in logs' },
                { label: 'Model card', sub: 'metrics on locked test, slices, known limits' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', gap: 8, marginBottom: 11 }}>
                  <span style={{ color: C.amber, fontSize: 13, flexShrink: 0 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{item.sub}</div>
                  </div>
                </div>
              ))}

              {/* CLI command at the bottom of the right panel (Image 3) */}
              <div style={{ ...styles.codeBox, marginTop: 14, padding: '10px 12px', fontSize: 10 }}>
                {state.cli_snippet}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 3 · DEPLOY (Image 4) ────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>3 · Deploy</h2>
          <span style={styles.sectionSub}>STAGING, SHADOW, CANARY, THEN PRODUCTION</span>
        </div>

        {/* 6-step pipeline */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, overflowX: 'auto' }}>
          {state.deploy_steps.map((step, idx) => (
            <React.Fragment key={step.step_number}>
              <div
                style={{
                  flex: 1,
                  minWidth: 140,
                  padding: '12px 14px',
                  background: step.status === 'active' ? '#161713' : C.card,
                  border: `1px solid ${step.status === 'active' ? C.amber : C.border}`,
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: step.status === 'done' ? C.green : step.status === 'active' ? C.amber : C.muted,
                    marginBottom: 4,
                  }}
                >
                  {step.step_number} · {step.title}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: step.status === 'active' ? C.text : '#9ca3af' }}>
                  {step.status === 'done'
                    ? step.detail
                    : step.status === 'active'
                    ? 'Endpoint ready'
                    : step.step_number === 4
                    ? `Next to ${h.production_model}`
                    : step.step_number === 5
                    ? '10% → 50% of calls'
                    : '100% · after review'}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: step.status === 'active' ? C.amber : C.muted,
                    marginTop: 3,
                    fontFamily: 'monospace',
                  }}
                >
                  {step.status === 'done'
                    ? step.step_number === 1
                      ? '✓ done · 3 min'
                      : '✓ same scores as 06'
                    : step.status === 'active'
                    ? 'now · try it below'
                    : step.step_number === 4
                    ? 'waiting · 14 days'
                    : step.step_number === 5
                    ? 'waiting · stops on any regression'
                    : 'waiting'}
                </div>
              </div>
              {idx < state.deploy_steps.length - 1 && <span style={{ color: C.muted, fontSize: 14 }}>→</span>}
            </React.Fragment>
          ))}
        </div>

        {/* 3 Deploy Options */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            {
              id: 'hosted',
              label: 'SELECTED',
              title: 'Hosted by Datalift',
              desc: 'An HTTPS endpoint with keys and logs. Nothing to install.',
              selected: state.selected_deploy_option === 'hosted',
            },
            {
              id: 'own_server',
              label: 'OPTION',
              title: 'Your server',
              desc: 'Pull the Docker image and run it next to the CRM. Logs can be sent back for drift.',
              selected: state.selected_deploy_option === 'own_server',
            },
            {
              id: 'batch_folder',
              label: 'OPTION',
              title: 'Batch to a folder',
              desc: 'A CSV of scores dropped every month in S3 or a shared folder.',
              selected: state.selected_deploy_option === 'batch_folder',
            },
          ].map((opt) => (
            <div
              key={opt.id}
              onClick={() => updateSetting({ deploy_target: opt.id })}
              style={{
                ...styles.card,
                padding: 18,
                cursor: 'pointer',
                border: `1px solid ${opt.selected ? C.amber : C.border}`,
                background: opt.selected ? '#15161a' : C.card,
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 1.5,
                  color: opt.selected ? C.amber : C.muted,
                  marginBottom: 6,
                }}
              >
                {opt.label}
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, color: C.text, marginBottom: 6 }}>
                {opt.title}
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{opt.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 4 · API (Image 4 & 5) ───────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>4 · API</h2>
          <span style={styles.sectionSub}>SAME MASKS, SAME THRESHOLD AS IN 06</span>
        </div>

        {/* Endpoint Bar */}
        <div
          style={{
            ...styles.card,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ ...styles.tag, background: C.amber, color: '#000' }}>POST</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: C.text, flex: 1 }}>{state.endpoint_url}</span>
          <button style={styles.btnDark} onClick={() => handleCopy(state.endpoint_url, 'URL')}>
            Copy
          </button>
          <button style={styles.btnDark} onClick={() => showNotif('Spécification OpenAPI exportée')}>
            OpenAPI spec
          </button>
          <button style={styles.btnDark} onClick={() => showNotif('Ouverture Swagger UI')}>
            Try it in Swagger
          </button>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Left Column: Request tabs & Code + Response JSON */}
          <div style={{ flex: 1 }}>
            {/* Request tab bar */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}`, marginBottom: 0 }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: C.muted,
                  marginRight: 16,
                  padding: '8px 0',
                }}
              >
                REQUEST
              </span>
              {(['curl', 'Python', 'JavaScript'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setApiCodeTab(tab)}
                  style={{
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: apiCodeTab === tab ? C.amber : C.muted,
                    borderBottom: apiCodeTab === tab ? `2px solid ${C.amber}` : '2px solid transparent',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Request code panel */}
            <div style={{ ...styles.codeBox, borderRadius: '0 0 6px 6px', maxHeight: 220, fontSize: 11 }}>
              {apiCodeTab === 'curl'
                ? state.curl_snippet
                : apiCodeTab === 'Python'
                ? state.python_req_snippet || state.python_snippet
                : state.js_snippet}
            </div>

            {/* Response JSON header & panel */}
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted, margin: '18px 0 8px' }}>
              RESPONSE
            </div>
            <div style={{ ...styles.codeBox, maxHeight: 200, fontSize: 11 }}>{state.json_response_snippet}</div>

            {/* Dynamic Footnote */}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
              {idCol} is returned, never used by the model. Unknown columns are refused with a 422 that names them; a new{' '}
              {primaryFeature} gets the training average, as in 06.
            </div>
          </div>

          {/* Right Column: API Keys + Webhooks */}
          <div style={{ width: 340, flexShrink: 0 }}>
            {/* API Keys Card */}
            <div style={{ ...styles.card, padding: 18, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17 }}>API keys</div>
                <button style={{ ...styles.btnDark, padding: '4px 10px', fontSize: 11 }} onClick={() => showNotif('Nouvelle clé créée')}>
                  Create key
                </button>
              </div>
              {state.api_keys.map((k) => (
                <div
                  key={k.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{k.name}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted }}>
                      {k.key_masked} · {k.scope}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        ...styles.tag,
                        border: `1px solid ${k.status === 'LIVE' ? C.amberDark : C.border}`,
                        color: k.status === 'LIVE' ? C.amber : C.muted,
                        background: 'transparent',
                        fontSize: 9,
                      }}
                    >
                      {k.status}
                    </span>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>used {k.last_used}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: C.muted }}>RATE LIMIT</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>100 req / s</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: C.muted }}>MAX INPUT</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>1,000 rows / call</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                A key is shown once, scoped to one project, and can be revoked at any time.
              </div>
            </div>

            {/* Webhooks Card */}
            <div style={{ ...styles.card, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17 }}>Webhooks</div>
                <button style={{ ...styles.btnDark, padding: '4px 10px', fontSize: 11 }} onClick={() => showNotif('Ajout webhook')}>
                  Add webhook
                </button>
              </div>
              {state.webhook_events.map((wh) => (
                <div
                  key={wh.event_name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>{wh.event_name}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{wh.description}</div>
                  </div>
                  <span
                    style={{
                      ...styles.tag,
                      background: wh.enabled ? '#14532d' : '#1e2024',
                      color: wh.enabled ? C.green : C.muted,
                      cursor: 'pointer',
                      fontSize: 9,
                    }}
                    onClick={() => showNotif(`Webhook ${wh.event_name} basculé`)}
                  >
                    {wh.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: C.muted, marginTop: 10, fontFamily: 'monospace' }}>
                POST → [YOUR URL] · signed with a secret
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 5 · VERSIONS AND TRAFFIC (Image 5 & 6) ──────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>5 · Versions and traffic</h2>
          <span style={styles.sectionSub}>EVERY PREDICTION IS LOGGED WITH ITS MODEL VERSION</span>
        </div>

        {/* 4 KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'LATENCY · P50', value: '[RESULT]', sub: 'per call · staging' },
            { label: 'LATENCY · P95', value: '[RESULT]', sub: 'target under 100 ms' },
            { label: 'ERROR RATE', value: '[RESULT]', sub: 'refused inputs counted apart' },
            { label: 'SCORED YES', value: '[RESULT]', sub: `share above ${h.threshold} · feeds 08` },
          ].map((k) => (
            <div key={k.label} style={{ ...styles.card, padding: '16px 20px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                {k.label}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: C.amber }}>{k.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Traffic Table */}
        <div style={{ ...styles.card, overflow: 'hidden', marginBottom: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1.2fr 110px 100px 90px 90px 140px',
              padding: '10px 16px',
              borderBottom: `1px solid ${C.border}`,
              background: '#0f1012',
            }}
          >
            {['VERSION', 'RUNS ON', 'STATUS', 'TRAFFIC', 'P95', 'ERRORS', 'ACTION'].map((th) => (
              <div key={th} style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted }}>
                {th}
              </div>
            ))}
          </div>
          {state.version_traffic.map((row) => (
            <div
              key={row.model_name}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1.2fr 110px 100px 90px 90px 140px',
                padding: '14px 16px',
                borderBottom: `1px solid ${C.border}`,
                alignItems: 'center',
              }}
            >
              <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{row.model_name}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{row.runs_on}</div>
              <div>
                <span
                  style={{
                    ...styles.tag,
                    background: row.status === 'PRODUCTION' ? C.amber : 'transparent',
                    color: row.status === 'PRODUCTION' ? '#000' : C.muted,
                    border: row.status === 'STAGING' ? `1px solid ${C.amberDark}` : row.status === 'ARCHIVED' ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  {row.status}
                </span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {row.status === 'STAGING' ? 'shadow' : `${row.traffic_pct}%`}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: row.p95_ms > 0 ? C.amber : C.muted }}>
                {row.p95_ms > 0 ? '[RESULT]' : '—'}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: row.p95_ms > 0 ? C.amber : C.muted }}>
                {row.p95_ms > 0 ? '[RESULT]' : '—'}
              </div>
              <div>
                <button
                  onClick={() => showNotif(`${row.action} · ${row.model_name}`)}
                  style={{ ...styles.btnDark, padding: '5px 12px', fontSize: 11 }}
                >
                  {row.action}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          Logged predictions feed 08 Drift and the 07 pool. When outcomes arrive 60 days later, measured recall is added
          to each version.
        </div>
      </div>

      {/* ── GUARDRAILS (Image 6) ────────────────────────────────────────── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Guardrails</h2>
          <span style={styles.sectionSub}>CHECKED BEFORE EVERY EXPORT AND SWITCH</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {state.guardrails.map((g) => (
            <div
              key={g.id}
              style={{
                ...styles.card,
                padding: '14px 16px',
                display: 'flex',
                gap: 10,
                border: g.status === 'warn' ? `1px solid rgba(245, 158, 11, 0.4)` : `1px solid ${C.border}`,
                background: g.status === 'warn' ? '#181510' : C.card,
              }}
            >
              <span style={{ color: g.status === 'ok' ? C.amber : C.red, fontSize: 13, flexShrink: 0 }}>
                {g.status === 'ok' ? '✓' : '⚠'}
              </span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: g.status === 'warn' ? C.amber : C.text }}>
                  {g.title}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{g.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM STICKY BAR (Image 6) ─────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 170,
          right: 0,
          background: '#0d0e11',
          borderTop: `1px solid ${C.border}`,
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 100,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
        }}
      >
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: C.text, fontWeight: 600 }}>
            {h.candidate_model} · Docker image · staging endpoint ready
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted, marginTop: 2 }}>
            Next: 14 days of shadow next to {h.production_model}, then a reviewer approves the switch
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={styles.btnDark} onClick={() => (window.location.href = '/drift')}>
            ← Back to drift
          </button>
          <button
            style={{ ...styles.btnAmber, opacity: isDeploying ? 0.7 : 1 }}
            onClick={handleDeploy}
            disabled={isDeploying}
          >
            {isDeploying ? 'Deploying…' : 'Deploy to staging'}
          </button>
        </div>
      </div>
    </div>
  );
}
