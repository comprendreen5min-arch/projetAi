import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Dataset, TextVersioningDataResponse } from '../types';
import { RefreshCw, AlertCircle, Check, Copy, Download } from 'lucide-react';

// ─── Theme Colors ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardSub: '#16171b',
  border: '#23252a',
  borderLight: '#2e3036',
  amber: '#f59e0b',
  amberDark: '#b45309',
  amberSubtle: 'rgba(245, 158, 11, 0.12)',
  red: '#f87171',
  coral: '#f87171',
  green: '#22c55e',
  muted: '#71717a',
  text: '#e5e7eb',
  textMuted: '#9ca3af',
};

export const TextVersioningPage: React.FC = () => {
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<TextVersioningDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active version selected in Lineage
  const [activeVersionId, setActiveVersionId] = useState<string>('v3');

  // Compare dropdown states
  const [compareFrom, setCompareFrom] = useState<string>('v1 · raw');
  const [compareTo, setCompareTo] = useState<string>('v2 · clean');

  // Text diff filter: 'ALL', 'EDITED', 'REMOVED', 'SPLIT'
  const [diffFilter, setDiffFilter] = useState<'ALL' | 'EDITED' | 'REMOVED' | 'SPLIT'>('ALL');

  // Active view pill
  const [activeViewId, setActiveViewId] = useState<string>('all');

  // Notifications
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);

  const showNotif = (msg: string, ok: boolean = true) => {
    setNotif({ msg, ok });
    setTimeout(() => setNotif(null), 5000);
  };

  // ── Load Datasets ───────────────────────────────────────────────────────────
  const fetchDatasets = useCallback(async () => {
    try {
      const all = await api.getDatasets();
      const textSets = all.filter(d => {
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
      const candidates = textSets.length > 0 ? textSets : all;
      setDatasets(candidates);

      if (candidates.length > 0 && !selectedDatasetId) {
        const preferred =
          candidates.find(d => d.name.includes('ticket') || d.name.includes('support')) ||
          candidates[0];
        setSelectedDatasetId(preferred.id);
      }
    } catch (err: any) {
      setError('Erreur lors du chargement des datasets: ' + (err.message || 'inconnue'));
    }
  }, [selectedDatasetId]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  // ── Load Versioning Data when dataset changes ──────────────────────────────
  const fetchData = useCallback(async (datasetId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTextVersioningData(datasetId);
      setData(res);
      setActiveVersionId(res.current_version.id || res.current_version.name || 'v1');
      setCompareFrom(res.compare.selected_from || 'v1 · raw');
      setCompareTo(res.compare.selected_to || 'v2 · clean');
      setActiveViewId(res.views[0]?.id || 'all');
    } catch (err: any) {
      setError('Erreur lors du chargement du versioning texte: ' + (err.message || 'inconnue'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      fetchData(selectedDatasetId);
    }
  }, [selectedDatasetId, fetchData]);

  // ── Export dataset card event listener ─────────────────────────────────────
  useEffect(() => {
    const handleExport = () => {
      if (!data) return;
      const cardContent = {
        dataset: data.dataset_name,
        versions: data.kpis.versions,
        current_version: data.current_version,
        stored: data.kpis.stored,
        languages: data.kpis.languages,
        summary: data.action_banner.card_summary,
        lineage: data.lineage,
        guardrails: data.guardrails,
        exported_at: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(cardContent, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dataset_card_${data.dataset_name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotif('Dataset card exportée avec succès !');
    };

    window.addEventListener('datalift:export-text-dataset-card', handleExport);
    return () => window.removeEventListener('datalift:export-text-dataset-card', handleExport);
  }, [data]);

  // Active details object
  const activeDetails = useMemo(() => {
    if (!data) return null;
    return data.version_details[activeVersionId] || data.version_details['v3'] || Object.values(data.version_details)[0];
  }, [data, activeVersionId]);

  // Active compare slice (v1_v2 or v2_v3 based on selectors)
  const activeCompare = useMemo(() => {
    if (!data?.compare) return null;
    const isV2toV3 = compareFrom.includes('v2') || compareTo.includes('v3');
    if (isV2toV3 && (data.compare as any).v2_v3) {
      return (data.compare as any).v2_v3;
    }
    if ((data.compare as any).v1_v2) {
      return (data.compare as any).v1_v2;
    }
    return data.compare;
  }, [data, compareFrom, compareTo]);

  // Filtered diffs
  const filteredDiffs = useMemo(() => {
    if (!activeCompare) return [];
    const diffs: any[] = activeCompare.diffs || [];
    if (diffFilter === 'ALL') return diffs;
    return diffs.filter((d: any) => d.type === diffFilter);
  }, [activeCompare, diffFilter]);

  // Copy CLI command
  const handleCopyCli = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  // Tag as production
  const handleTagProduction = async () => {
    if (!selectedDatasetId || !data) return;
    try {
      await api.tagTextVersionProduction(selectedDatasetId, activeVersionId);
      showNotif(`Version ${activeVersionId} marquée comme PRODUCTION.`, true);
    } catch (err: any) {
      showNotif('Erreur lors du marquage: ' + (err.message || 'inconnue'), false);
    }
  };

  // Restore version
  const handleRestore = async (versionId: string) => {
    if (!selectedDatasetId || !data) return;
    try {
      await api.restoreTextVersion(selectedDatasetId, versionId);
      showNotif(`Version ${versionId} restaurée comme baseline active.`, true);
      fetchData(selectedDatasetId);
    } catch (err: any) {
      showNotif('Erreur lors de la restauration: ' + (err.message || 'inconnue'), false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '3rem', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: C.amber }}>
          <RefreshCw className="animate-spin" size={20} />
          <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>Chargement du versioning texte...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '3rem', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: C.red, marginBottom: '1rem' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
        <button
          onClick={() => selectedDatasetId && fetchData(selectedDatasetId)}
          className="btn btn-secondary font-mono"
          style={{ fontSize: '0.8rem' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: C.bg,
        minHeight: '100vh',
        color: C.text,
        padding: '2.5rem 3.5rem',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {notif && (
        <div
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            backgroundColor: notif.ok ? '#14532d' : '#7f1d1d',
            color: '#fff',
            border: `1px solid ${notif.ok ? C.green : C.red}`,
            padding: '0.75rem 1.25rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            zIndex: 9999,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}
        >
          {notif.msg}
        </div>
      )}

      {/* Dataset Selector Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.75rem',
          paddingBottom: '1rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.7rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            JEU DE DONNÉES :
          </span>
          <select
            value={selectedDatasetId}
            onChange={e => setSelectedDatasetId(e.target.value)}
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
            onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-text-dataset-card'))}
            style={{
              backgroundColor: 'transparent',
              color: C.text,
              border: `1px solid ${C.borderLight}`,
              padding: '0.4rem 0.9rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Export dataset card
          </button>
          <button
            type="button"
            onClick={() => navigate('/labeling')}
            style={{
              backgroundColor: C.amber,
              color: '#000',
              border: 'none',
              padding: '0.4rem 1rem',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Continue to labeling →
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div
        style={{
          fontSize: '0.68rem',
          color: C.textMuted,
          fontFamily: 'monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: '0.5rem',
        }}
      >
        {data?.breadcrumb || 'DATASET · 3 VERSIONS · TEXT CLASSIFICATION · TEST SET LOCKED'}
      </div>

      {/* Title & Version Badge Block */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '2.5rem',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '2.75rem',
              color: '#ffffff',
              margin: '0 0 1.5rem 0',
              lineHeight: 1.1,
            }}
          >
            {data?.display_title || 'support_tickets.jsonl'}
          </h1>

          {/* 4 KPIs */}
          <div style={{ display: 'flex', gap: '3rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                VERSIONS
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                {data?.kpis.versions || '3'}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>
                {data?.kpis.versions_sub || 'v1 · v2 · v3'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                STORED
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                {data?.kpis.stored || '310 MB'}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>
                {data?.kpis.stored_sub || '780 MB logical · deltas only'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                LANGUAGES
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                {data?.kpis.languages || '4'}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>
                {data?.kpis.languages_sub || 'fr · ar · darija · en'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                USED BY
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                {data?.kpis.used_by || '2 models'}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>
                {data?.kpis.used_by_sub || 'v2 and v3 protected'}
              </div>
            </div>
          </div>
        </div>

        {/* Large Version Badge on Right */}
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-block',
              fontSize: '0.62rem',
              fontFamily: 'monospace',
              letterSpacing: '0.08em',
              color: C.amber,
              border: `1px solid ${C.amber}`,
              padding: '0.15rem 0.5rem',
              borderRadius: '2px',
              marginBottom: '0.35rem',
            }}
          >
            {activeDetails?.badge || (activeVersionId === (data?.current_version.id || data?.current_version.name) ? data?.current_version.tag : 'ACTIVE') || 'BASELINE'}
          </div>
          <div
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '4.5rem',
              lineHeight: 1,
              color: C.amber,
              margin: '0.2rem 0',
            }}
          >
            {activeVersionId || data?.current_version.name || 'v1'}
          </div>
          <div style={{ fontSize: '0.65rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            {activeVersionId === (data?.current_version.id || data?.current_version.name) ? 'CURRENT VERSION' : 'SELECTED VERSION'}
          </div>
        </div>
      </div>

      {/* ── 1·Lineage ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '3rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.5rem',
          }}
        >
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.5rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            1·Lineage
          </h2>
          <span style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            CLICK A VERSION TO OPEN IT
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '2rem' }}>
          {/* Left Flow of Version Cards */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {(data?.lineage || []).map((node, idx) => {
                const isActive = activeVersionId === node.id;
                return (
                  <React.Fragment key={node.id}>
                    {/* Node Card */}
                    <div
                      onClick={() => setActiveVersionId(node.id)}
                      style={{
                        flex: 1,
                        backgroundColor: C.card,
                        border: `1px solid ${isActive ? C.amber : C.border}`,
                        borderRadius: '4px',
                        padding: '1rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                          {node.rank}
                        </span>
                        {node.badge && (
                          <span
                            style={{
                              fontSize: '0.58rem',
                              fontFamily: 'monospace',
                              color: C.amber,
                              border: `1px solid ${C.amberDark}`,
                              backgroundColor: C.amberSubtle,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '2px',
                            }}
                          >
                            {node.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace', marginBottom: '0.2rem' }}>
                        {node.count_label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace' }}>
                        {node.date_label}
                      </div>
                    </div>

                    {/* Step transition indicator */}
                    {idx < (data?.lineage.length || 0) - 1 && (
                      <div style={{ textAlign: 'center', minWidth: '75px' }}>
                        <div style={{ fontSize: '0.58rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                          {node.step_after}
                        </div>
                        <div style={{ color: C.muted, fontSize: '0.85rem' }}>→</div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Explanation Under-Cards (REPLAY, FROZEN GENERATION, RESTORE) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {(data?.lineage || []).map(node => (
                <div
                  key={node.id}
                  style={{
                    backgroundColor: '#16171a',
                    border: `1px solid ${C.border}`,
                    borderRadius: '4px',
                    padding: '0.85rem 1rem',
                  }}
                >
                  <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
                    {node.action_title}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: C.textMuted, lineHeight: 1.4 }}>
                    {node.action_desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Details Panel for Active Version */}
          {activeDetails && (
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                padding: '1.25rem 1.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3
                  style={{
                    fontFamily: 'Playfair Display, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.35rem',
                    margin: 0,
                    color: '#ffffff',
                  }}
                >
                  {activeDetails.title}
                </h3>
                {activeDetails.badge && (
                  <span
                    style={{
                      fontSize: '0.6rem',
                      fontFamily: 'monospace',
                      color: C.amber,
                      border: `1px solid ${C.amber}`,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '2px',
                    }}
                  >
                    {activeDetails.badge}
                  </span>
                )}
              </div>

              {/* Key Values */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.75rem', fontFamily: 'monospace', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', color: C.muted }}>PARENT</span>
                  <span style={{ color: C.text }}>{activeDetails.parent}</span>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', color: C.muted }}>RECIPE</span>
                  <span style={{ color: C.text }}>{activeDetails.recipe}</span>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', color: C.muted }}>LLM USED</span>
                  <span style={{ color: C.text }}>{activeDetails.llm_used}</span>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', color: C.muted }}>SEED</span>
                  <span style={{ color: C.text }}>{activeDetails.seed}</span>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', color: C.muted }}>SPLITS</span>
                  <span style={{ color: C.text }}>{activeDetails.splits}</span>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', color: C.muted }}>CREATED BY</span>
                  <span style={{ color: C.text }}>{activeDetails.created_by}</span>
                </div>
              </div>

              {/* CLI Command Box */}
              <div
                style={{
                  backgroundColor: '#0c0d0e',
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '3px',
                  padding: '0.55rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: '#e5e7eb',
                  marginBottom: '1rem',
                }}
              >
                <span>{activeDetails.pull_command}</span>
                <button
                  type="button"
                  onClick={() => handleCopyCli(activeDetails.pull_command)}
                  style={{ background: 'none', border: 'none', color: copiedCli ? C.green : C.muted, cursor: 'pointer', padding: 0 }}
                >
                  {copiedCli ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <button
                  type="button"
                  onClick={() => handleRestore(activeVersionId)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => showNotif(`Nouvelle branche créée à partir de ${activeVersionId}.`)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  Branch from here
                </button>
                <button
                  type="button"
                  onClick={handleTagProduction}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  Tag...
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => showNotif('Téléchargement du dataset initié.')}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Download size={12} />
                  <span>Download</span>
                </button>
                <span style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace' }}>
                  {activeDetails.formats}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2·Compare ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '3rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.5rem',
          }}
        >
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.5rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            2·Compare
          </h2>

          {/* Selectors FROM / TO */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.72rem', fontFamily: 'monospace' }}>
            <span style={{ color: C.muted }}>FROM</span>
            <select
              value={compareFrom}
              onChange={e => setCompareFrom(e.target.value)}
              style={{
                backgroundColor: C.card,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '3px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              {(data?.compare.from_options || ['v1 · raw', 'v2 · clean']).map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <span style={{ color: C.muted }}>TO</span>
            <select
              value={compareTo}
              onChange={e => setCompareTo(e.target.value)}
              style={{
                backgroundColor: C.card,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '3px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              {(data?.compare.to_options || ['v2 · clean', 'v3 · augmented']).map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 4 Summary Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              REMOVED
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: C.coral, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.removed || '-2,252'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.removed_sub || '1,840 duplicates · 412 empty'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              EDITED
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: C.amber, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.edited || '2,636'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.edited_sub || 'masking · encoding · splitting'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              LABELS CHANGED
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
              {activeCompare?.summary?.labels_changed || '0'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.labels_changed_sub || 'cleaning never touches labels'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              PERSONAL DATA
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
              {activeCompare?.summary?.personal_data || '52% → 98%'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.personal_data_sub || 'texts free of PII'}
            </div>
          </div>
        </div>

        {/* Dual Columns: Left (Label Distribution & Text Shape) vs Right (Text Diff) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr', gap: '2.5rem' }}>
          {/* Left Column: Label Distribution & Text Shape */}
          <div>
            {/* Label Distribution */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3
                  style={{
                    fontFamily: 'Playfair Display, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.15rem',
                    margin: 0,
                    color: '#ffffff',
                  }}
                >
                  Label distribution
                </h3>
                <span style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace' }}>
                  {compareFrom.split('·')[0].trim().toUpperCase()} / {compareTo.split('·')[0].trim().toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {(activeCompare?.label_distribution || []).map((item: any) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '85px', fontSize: '0.78rem', fontFamily: 'monospace', color: '#e5e7eb' }}>
                      {item.name}
                    </div>
                    {/* Dual bar */}
                    <div style={{ flex: 1, height: '14px', backgroundColor: '#1b1d22', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ height: '100%', width: `${item.v1_pct * 1.5}%`, backgroundColor: '#4b5563' }} />
                      <div style={{ height: '100%', width: `${item.v2_pct * 1.5}%`, backgroundColor: C.amber }} />
                    </div>
                    <div style={{ width: '85px', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.muted }}>
                      {item.v1_pct}% · {item.v2_pct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Text Shape */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3
                  style={{
                    fontFamily: 'Playfair Display, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.15rem',
                    margin: 0,
                    color: '#ffffff',
                  }}
                >
                  Text shape
                </h3>
                <span style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace' }}>
                  {compareFrom.split('·')[0].trim().toUpperCase()} → {compareTo.split('·')[0].trim().toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                {(activeCompare?.text_shape || []).map((row: any) => (
                  <div key={row.metric} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: '#d1d5db' }}>{row.metric}</span>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                      <span style={{ color: C.muted }}>{row.v1}</span>
                      <span style={{ color: '#ffffff', minWidth: '70px', textAlign: 'right' }}>{row.v2}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Text Diff */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <h3
                style={{
                  fontFamily: 'Playfair Display, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.15rem',
                  margin: 0,
                  color: '#ffffff',
                }}
              >
                Text diff
              </h3>

              {/* Diff Filter Pills */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {(['ALL', 'EDITED', 'REMOVED', 'SPLIT'] as const).map(f => {
                  const isActive = diffFilter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDiffFilter(f)}
                      style={{
                        backgroundColor: isActive ? C.amber : C.card,
                        color: isActive ? '#000000' : C.textMuted,
                        border: `1px solid ${isActive ? C.amber : C.borderLight}`,
                        borderRadius: '3px',
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {f.charAt(0) + f.slice(1).toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Diff Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredDiffs.map(diff => (
                <div
                  key={diff.id}
                  style={{
                    backgroundColor: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: '4px',
                    padding: '0.85rem 1.15rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.muted }}>
                      <span style={{ color: '#ffffff' }}>{diff.id}</span> · {diff.lang} · <span style={{ color: diff.type === 'REMOVED' ? C.coral : C.amber }}>{diff.type}</span>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.muted }}>
                      {diff.reason}
                    </span>
                  </div>

                  {/* Render Diff markup */}
                  <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#e5e7eb', lineHeight: 1.45 }}>
                    {diff.type === 'REMOVED' ? (
                      <span style={{ color: C.coral, textDecoration: 'line-through' }}>
                        {diff.full_text}
                      </span>
                    ) : diff.type === 'SPLIT' ? (
                      <span style={{ color: '#d1d5db' }}>
                        {diff.full_text}
                      </span>
                    ) : (
                      <>
                        <span>{diff.prefix}</span>
                        {diff.before_highlight && (
                          <span style={{ color: C.coral, textDecoration: 'line-through', marginRight: '0.35rem' }}>
                            {diff.before_highlight}
                          </span>
                        )}
                        {diff.after_highlight && (
                          <span
                            style={{
                              backgroundColor: C.amberSubtle,
                              color: C.amber,
                              border: `1px solid ${C.amberDark}`,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '2px',
                            }}
                          >
                            {diff.after_highlight}
                          </span>
                        )}
                        <span>{diff.suffix}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 3·Views & 4·Used by ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2.5rem', marginBottom: '3rem' }}>
        {/* 3·Views */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: '0.5rem',
            }}
          >
            <h2
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '1.5rem',
                color: '#ffffff',
                margin: 0,
              }}
            >
              3·Views
            </h2>
            <span style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
              NO COPY, NO NEW VERSION
            </span>
          </div>

          {/* View Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {(data?.views || []).map(view => {
              const isActive = activeViewId === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveViewId(view.id)}
                  style={{
                    backgroundColor: isActive ? 'transparent' : C.card,
                    color: isActive ? C.amber : C.text,
                    border: `1px solid ${isActive ? C.amber : C.borderLight}`,
                    borderRadius: '4px',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{view.label}</span>
                  {view.count && <span style={{ marginLeft: '0.35rem', color: isActive ? C.amber : C.muted }}>· {view.count}</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => showNotif('Ajout de filtre de vue personnalisé.')}
              style={{
                backgroundColor: 'transparent',
                color: C.muted,
                border: `1px dashed ${C.borderLight}`,
                borderRadius: '4px',
                padding: '0.4rem 0.75rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              + Filter
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: C.textMuted, fontStyle: 'normal' }}>
            Pull a view by API like a version: <span style={{ fontFamily: 'monospace', color: '#ffffff' }}>{(data?.dataset_name || 'tickets').split('.')[0]}@v3?origin=real&lang=fr</span>
          </div>
        </div>

        {/* 4·Used by */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: '0.5rem',
            }}
          >
            <h2
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '1.5rem',
                color: '#ffffff',
                margin: 0,
              }}
            >
              4·Used by
            </h2>
            <span style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
              LINKED FROM 06 TRAINING
            </span>
          </div>

          {/* Model Runs Table */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '0.65rem 1rem', borderBottom: `1px solid ${C.borderLight}`, fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace' }}>
              <span>MODEL RUN</span>
              <span>DATA</span>
              <span>MACRO F1</span>
              <span style={{ textAlign: 'right' }}>TAG</span>
            </div>

            {(data?.used_by || []).map((row, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
                  padding: '0.75rem 1rem',
                  borderBottom: idx < (data?.used_by.length || 0) - 1 ? `1px solid ${C.border}` : 'none',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#ffffff' }}>{row.model_run}</span>
                <span style={{ color: C.muted }}>{row.data}</span>
                <span style={{ color: C.muted }}>{row.macro_f1}</span>
                <span style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontFamily: 'monospace',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '2px',
                      border: `1px solid ${row.tag_type === 'production' ? C.amberDark : C.borderLight}`,
                      color: row.tag_type === 'production' ? C.amber : C.muted,
                      backgroundColor: row.tag_type === 'production' ? C.amberSubtle : 'transparent',
                    }}
                  >
                    {row.tag}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Guardrails ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: '0.5rem',
          }}
        >
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.5rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            Guardrails
          </h2>
          <span style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            CHECKED BEFORE EVERY TAG OR DELETE
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {(data?.guardrails || []).map((g, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '4px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
              }}
            >
              <div style={{ marginTop: '0.15rem' }}>
                <Check size={14} color={C.green} />
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: '#ffffff' }}>
                  {g.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.15rem' }}>
                  {g.subtitle}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Action Banner ───────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '4px',
          padding: '1.25rem 1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
            {data?.action_banner.version || 'v3'} · {data?.action_banner.recipes || '2 recipes'} · {data?.action_banner.splits || '3 splits'} · {data?.action_banner.baseline || 'baseline'}
          </div>
          <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {data?.action_banner.card_summary || 'Dataset card generated: languages, labels, share of generated text, masking applied'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={handleTagProduction}
            style={{
              backgroundColor: 'transparent',
              color: '#ffffff',
              border: `1px solid ${C.borderLight}`,
              borderRadius: '4px',
              padding: '0.55rem 1.2rem',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Tag as production
          </button>
          <button
            type="button"
            onClick={() => navigate('/labeling')}
            style={{
              backgroundColor: C.amber,
              color: '#000000',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              padding: '0.55rem 1.35rem',
              fontSize: '0.82rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Continue to labeling →
          </button>
        </div>
      </div>
    </div>
  );
};
