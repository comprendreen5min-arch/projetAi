import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Dataset, ImageVersioningDataResponse, ImageVersioningDiffItem } from '../types';
import { RefreshCw, AlertCircle, Check, Copy, Download, X } from 'lucide-react';

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

export const ImageVersioningPage: React.FC = () => {
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<ImageVersioningDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active version selected in Lineage
  const [activeVersionId, setActiveVersionId] = useState<string>('v3');

  // Compare dropdown states
  const [compareFrom, setCompareFrom] = useState<string>('v1 · raw');
  const [compareTo, setCompareTo] = useState<string>('v2 · clean');

  // Image diff filter: 'ALL', 'EDITED', 'REMOVED', 'BOXES_CHANGED'
  const [diffFilter, setDiffFilter] = useState<'ALL' | 'EDITED' | 'REMOVED' | 'BOXES_CHANGED'>('ALL');

  // Active view pill
  const [activeViewId, setActiveViewId] = useState<string>('all');

  // Notifications
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null);
  const [copiedCli, setCopiedCli] = useState<boolean>(false);

  // Modal inspection for image diff
  const [inspectedDiff, setInspectedDiff] = useState<ImageVersioningDiffItem | null>(null);
  const [sliderPos, setSliderPos] = useState<number>(50);

  const showNotif = (msg: string, ok: boolean = true) => {
    setNotif({ msg, ok });
    setTimeout(() => setNotif(null), 5000);
  };

  // ── Load Datasets ───────────────────────────────────────────────────────────
  const fetchDatasets = useCallback(async () => {
    try {
      const all = await api.getDatasets();
      const imgSets = all.filter(d => {
        const name = d.name.toLowerCase();
        return (
          name.includes('defect') ||
          name.includes('image') ||
          name.includes('photo') ||
          name.includes('chat') ||
          name.includes('chien') ||
          name.includes('img') ||
          name.endsWith('/')
        );
      });
      const candidates = imgSets.length > 0 ? imgSets : all;
      setDatasets(candidates);

      if (candidates.length > 0 && !selectedDatasetId) {
        const preferred =
          candidates.find(d => d.name.includes('defect') || d.name.includes('product')) ||
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
      const res = await api.getImageVersioningData(datasetId);
      setData(res);
      setActiveVersionId(res.current_version.id || res.current_version.name || 'v1');
      setCompareFrom(res.compare.selected_from || 'v1 · raw');
      setCompareTo(res.compare.selected_to || 'v2 · clean');
      setActiveViewId(res.views[0]?.id || 'all');
    } catch (err: any) {
      setError('Erreur lors du chargement du versioning image: ' + (err.message || 'inconnue'));
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
        modality: 'image',
        versions: data.kpis.versions,
        current_version: data.current_version,
        stored: data.kpis.stored,
        boxes: data.kpis.boxes,
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
      showNotif('Dataset card image exportée avec succès !');
    };

    window.addEventListener('datalift:export-image-dataset-card', handleExport);
    return () => window.removeEventListener('datalift:export-image-dataset-card', handleExport);
  }, [data]);

  // Active details object
  const activeDetails = useMemo(() => {
    if (!data) return null;
    return (
      data.version_details[activeVersionId] ||
      data.version_details['v3'] ||
      Object.values(data.version_details)[0]
    );
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
    const diffs: ImageVersioningDiffItem[] = activeCompare.diffs || [];
    if (diffFilter === 'ALL') return diffs;
    if (diffFilter === 'EDITED') return diffs.filter((d: ImageVersioningDiffItem) => d.type === 'EDITED');
    if (diffFilter === 'REMOVED') return diffs.filter((d: ImageVersioningDiffItem) => d.type === 'REMOVED');
    if (diffFilter === 'BOXES_CHANGED')
      return diffs.filter(
        (d: ImageVersioningDiffItem) =>
          d.badge === 'RESIZED' || d.type === 'BOXES_CHANGED' || (d.sub && d.sub.includes('box'))
      );
    return diffs;
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
      await api.tagImageVersionProduction(selectedDatasetId, activeVersionId);
      showNotif(`Version ${activeVersionId} marquée comme PRODUCTION.`, true);
    } catch (err: any) {
      showNotif('Erreur lors du marquage: ' + (err.message || 'inconnue'), false);
    }
  };

  // Restore version
  const handleRestore = async (versionId: string) => {
    if (!selectedDatasetId || !data) return;
    try {
      await api.restoreImageVersion(selectedDatasetId, versionId);
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
          <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>Chargement du versioning image...</span>
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
            onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-image-dataset-card'))}
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
        {data?.breadcrumb || 'DATASET · 3 VERSIONS · OBJECT DETECTION · TEST SET LOCKED'}
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
            {data?.display_title || 'product_defects/'}
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
                {data?.kpis.stored || '6.8 GB'}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>
                {data?.kpis.stored_sub || '19.2 GB logical · same image stored once'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                BOXES
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
                {data?.kpis.boxes || '21,430'}
              </div>
              <div style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>
                {data?.kpis.boxes_sub || 'versioned with the images'}
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

            {/* Explanation Under-Cards (REPLAY, IMAGES + BOXES TOGETHER, STORED ONCE) */}
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
                  <span style={{ width: '90px', color: C.muted }}>SEED</span>
                  <span style={{ color: C.text }}>{activeDetails.seed}</span>
                </div>
                <div style={{ display: 'flex' }}>
                  <span style={{ width: '90px', color: C.muted }}>IMAGE SIZE</span>
                  <span style={{ color: C.text }}>{activeDetails.image_size}</span>
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
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedCli ? C.green : C.muted,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title="Copier la commande"
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
              {activeCompare?.summary?.removed || '-642'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.removed_sub || '37 corrupted · 361 near-dup. · 244 blurry'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              EDITED
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: C.amber, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.edited || '418'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.edited_sub || 'brightened · all resized to 1280'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              BOXES
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
              {activeCompare?.summary?.boxes || '100% moved'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.boxes_sub || 'rescaled with every resize'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              CLASSES
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
              {activeCompare?.summary?.classes || '6 → 6'}
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'monospace' }}>
              {activeCompare?.summary?.classes_sub || 'no rename, no merge'}
            </div>
          </div>
        </div>

        {/* Dual Columns: Left (Images per class & Image shape) vs Right (Image diff) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr', gap: '2.5rem' }}>
          {/* Left Column */}
          <div>
            {/* Images per class */}
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
                  Images per class
                </h3>
                <span style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace' }}>
                  {compareFrom.split('·')[0].trim().toUpperCase()} / {compareTo.split('·')[0].trim().toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {(activeCompare?.images_per_class || []).map((item: any) => {
                  const maxVal = Math.max(...(activeCompare.images_per_class.map((i: any) => Math.max(i.v1_count, i.v2_count))), 1);
                  const w1 = Math.round((item.v1_count / maxVal) * 100);
                  const w2 = Math.round((item.v2_count / maxVal) * 100);
                  return (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '85px', fontSize: '0.78rem', fontFamily: 'monospace', color: '#e5e7eb' }}>
                        {item.name}
                      </div>
                      {/* Dual bars: grey (v1) and amber (v2) */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ height: '7px', width: `${w1}%`, backgroundColor: '#4b5563', borderRadius: '1px' }} />
                        <div style={{ height: '7px', width: `${w2}%`, backgroundColor: C.amber, borderRadius: '1px' }} />
                      </div>
                      <div style={{ width: '95px', textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace', color: C.muted }}>
                        {item.v1_count.toLocaleString()} · {item.v2_count.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Image shape */}
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
                  Image shape
                </h3>
                <span style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'monospace' }}>
                  {compareFrom.split('·')[0].trim().toUpperCase()} → {compareTo.split('·')[0].trim().toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                {(activeCompare?.image_shape || []).map((row: any) => (
                  <div
                    key={row.metric}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.35rem 0',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
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

          {/* Right Column: Image Diff */}
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
                Image diff
              </h3>

              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {(
                  [
                    { id: 'ALL', label: 'All' },
                    { id: 'EDITED', label: 'Edited' },
                    { id: 'REMOVED', label: 'Removed' },
                    { id: 'BOXES_CHANGED', label: 'Boxes changed' },
                  ] as const
                ).map(f => {
                  const isActive = diffFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setDiffFilter(f.id)}
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
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visual Grid of Comparison Cards (2x2) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '0.85rem' }}>
              {filteredDiffs.map(diff => (
                <div
                  key={diff.id}
                  onClick={() => setInspectedDiff(diff)}
                  style={{
                    backgroundColor: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: '4px',
                    padding: '0.85rem',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.amber)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  {/* Images row: Before -> After */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    {/* Before Image */}
                    <div style={{ flex: 1, height: '75px', backgroundColor: '#000', borderRadius: '3px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={diff.before_img} alt="before" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>

                    <span style={{ color: C.muted, fontSize: '0.85rem' }}>→</span>

                    {/* After Image or REMOVED box */}
                    <div style={{ flex: 1, height: '75px', backgroundColor: '#000', borderRadius: '3px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {diff.status === 'REMOVED' ? (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            border: `1px dashed ${C.coral}`,
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: C.coral,
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            letterSpacing: '0.08em',
                          }}
                        >
                          REMOVED
                        </div>
                      ) : (
                        <img src={diff.after_img || diff.before_img} alt="after" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      )}
                    </div>
                  </div>

                  {/* ID + Tag */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#ffffff' }}>
                      {diff.id} · <span style={{ color: diff.status === 'REMOVED' ? C.coral : C.amber }}>{diff.type}</span>
                    </span>
                    <span
                      style={{
                        fontSize: '0.58rem',
                        fontFamily: 'monospace',
                        color: diff.status === 'REMOVED' ? C.coral : C.amber,
                        border: `1px solid ${diff.status === 'REMOVED' ? C.coral : C.amber}`,
                        padding: '0.1rem 0.35rem',
                        borderRadius: '2px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {diff.badge}
                    </span>
                  </div>

                  {/* Subtext */}
                  <div style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'monospace' }}>
                    {diff.sub}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.7rem', color: C.textMuted, fontStyle: 'normal' }}>
              Click an image to open it full size with a before / after slider and both versions' boxes.
            </div>
          </div>
        </div>
      </div>

      {/* ── 3·Views & 4·Used by ─────────────────────────────────────────────────── */}
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
            Pull a view by API like a version: <span style={{ fontFamily: 'monospace', color: '#ffffff' }}>{data?.views_api_note || `${(data?.dataset_name || 'defects').split('/')[0]}@v3?origin=real&class=crack`}</span>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted, textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 1rem' }}>MODEL RUN</th>
                  <th style={{ padding: '0.65rem 1rem' }}>DATA</th>
                  <th style={{ padding: '0.65rem 1rem' }}>MAP@50 CRACK</th>
                  <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>TAG</th>
                </tr>
              </thead>
              <tbody>
                {(data?.used_by || []).map(row => (
                  <tr key={row.model_run} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: '0.65rem 1rem', color: '#ffffff' }}>{row.model_run}</td>
                    <td style={{ padding: '0.65rem 1rem', color: C.text }}>{row.data}</td>
                    <td style={{ padding: '0.65rem 1rem', color: C.muted }}>{row.metric_val}</td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '2px',
                          border: `1px solid ${row.tag_type === 'production' ? C.amber : C.borderLight}`,
                          color: row.tag_type === 'production' ? C.amber : C.muted,
                        }}
                      >
                        {row.tag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Guardrails ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '3rem' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
          {(data?.guardrails || []).map(g => (
            <div key={g.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
              <div style={{ color: C.amber, marginTop: '2px' }}>
                <Check size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace', marginBottom: '0.15rem' }}>
                  {g.title}
                </div>
                <div style={{ fontSize: '0.7rem', color: C.muted, lineHeight: 1.35 }}>
                  {g.subtitle}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Action Banner ──────────────────────────────────────────────── */}
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
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace', marginBottom: '0.2rem' }}>
            {data?.action_banner.version || 'v3'} · {data?.action_banner.recipes || '2 recipes'} · {data?.action_banner.splits || '3 splits'} · {data?.action_banner.baseline || 'baseline'}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.muted }}>
            {data?.action_banner.card_summary || 'Dataset card generated: classes, boxes, image sizes, share of copy-paste images'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleTagProduction}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: C.text,
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              padding: '0.5rem 1.15rem',
              borderRadius: '4px',
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
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              padding: '0.5rem 1.25rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Continue to labeling →
          </button>
        </div>
      </div>

      {/* ── Modal Comparison Slider ────────────────────────────────────────────── */}
      {inspectedDiff && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '2rem',
          }}
          onClick={() => setInspectedDiff(null)}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: '6px',
              padding: '1.75rem',
              maxWidth: '650px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'Playfair Display, serif', fontStyle: 'italic', color: '#fff', fontSize: '1.25rem' }}>
                Inspection {inspectedDiff.id} · {inspectedDiff.badge}
              </h3>
              <button
                type="button"
                onClick={() => setInspectedDiff(null)}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ position: 'relative', height: '300px', backgroundColor: '#000', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
              {/* After image background */}
              <img
                src={inspectedDiff.after_img || inspectedDiff.before_img}
                alt="after full"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />

              {/* Before image clipped with slider */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${sliderPos}%`,
                  overflow: 'hidden',
                  borderRight: `2px solid ${C.amber}`,
                }}
              >
                <img
                  src={inspectedDiff.before_img}
                  alt="before full"
                  style={{ width: '650px', height: '300px', objectFit: 'contain', maxWidth: 'none' }}
                />
              </div>
            </div>

            {/* Slider control */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: C.muted, fontFamily: 'monospace', marginBottom: '0.25rem' }}>
                <span>BEFORE (V1)</span>
                <span>SLIDER: {sliderPos}%</span>
                <span>AFTER (V2)</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={e => setSliderPos(Number(e.target.value))}
                style={{ width: '100%', accentColor: C.amber }}
              />
            </div>

            <div style={{ fontSize: '0.75rem', color: C.textMuted, fontFamily: 'monospace' }}>
              {inspectedDiff.sub}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ImageVersioningPage;

