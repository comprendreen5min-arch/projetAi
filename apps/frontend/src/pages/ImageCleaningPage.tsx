import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { Dataset, ImageCleaningRecipeResponse } from '../types';
import { RefreshCw, AlertCircle } from 'lucide-react';

// ─── Theme Colors ───────────────────────────────────────────────────────────
const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardSub: '#16171b',
  border: '#23252a',
  borderLight: '#2e3036',
  amber: '#f59e0b',
  amberDark: '#78350f',
  amberSubtle: 'rgba(245, 158, 11, 0.12)',
  red: '#f87171',
  green: '#22c55e',
  muted: '#71717a',
  text: '#e5e7eb',
  textMuted: '#9ca3af',
};

export const ImageCleaningPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [recipe, setRecipe] = useState<ImageCleaningRecipeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active step for preview (default is brighten_dark)
  const [previewStepId, setPreviewStepId] = useState<string>('brighten_dark');

  // Step toggle states
  const [stepToggles, setStepToggles] = useState<Record<string, boolean>>({
    remove_corrupted: true,
    remove_duplicates: true,
    brighten_dark: true,
    exclude_blurry: true,
    standardize_sizes: true,
    label_unlabeled: false,
    balance_classes: false,
  });

  // Step parameters
  const [stepParams, setStepParams] = useState<Record<string, string>>({
    remove_corrupted: 'Move to quarantine',
    remove_duplicates: 'The sharpest',
    brighten_dark: 'Auto · CLAHE',
    exclude_blurry: 'Score < 80',
    standardize_sizes: '1280 px · letterbox',
    label_unlabeled: '05 Labeling',
    balance_classes: '03 Augmentation',
  });

  const [dryRunning, setDryRunning] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null);

  const showNotif = (msg: string, ok: boolean = true) => {
    setNotif({ msg, ok });
    setTimeout(() => setNotif(null), 5000);
  };

  // ── Load datasets ──────────────────────────────────────────────────────────
  const loadDatasets = useCallback(async () => {
    try {
      const list = await api.getDatasets();
      const imgList = list.filter(
        d => d.name.includes('defect') || d.name.includes('image') || d.name.endsWith('/')
      );
      setDatasets(imgList.length > 0 ? imgList : list);

      const savedId = localStorage.getItem('datalift_selected_dataset_id');
      const match = (imgList.length > 0 ? imgList : list).find(d => d.id === savedId);
      const target = match || imgList.find(d => d.name === 'product_defects/') || imgList[0] || list[0];

      if (target) {
        setSelectedDatasetId(target.id);
      }
    } catch (err: any) {
      console.error(err);
      setError('Erreur lors du chargement des jeux de données image');
    }
  }, []);

  // ── Load Recipe ────────────────────────────────────────────────────────────
  const loadRecipe = useCallback(async (dsId: string) => {
    if (!dsId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getImageCleaningRecipe(dsId);
      setRecipe(data);

      const toggles: Record<string, boolean> = {};
      const params: Record<string, string> = {};
      data.steps.forEach(s => {
        toggles[s.id] = s.enabled;
        params[s.id] = s.param_value;
      });
      setStepToggles(toggles);
      setStepParams(params);
      if (data.preview_step_id) {
        setPreviewStepId(data.preview_step_id);
      }
    } catch (err: any) {
      console.error(err);
      setError('Erreur lors de la récupération de la recette de nettoyage image.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (selectedDatasetId) {
      loadRecipe(selectedDatasetId);
    }
  }, [selectedDatasetId, loadRecipe]);

  // Handle Modality or Dataset change from other views
  useEffect(() => {
    const handleDatasetChanged = (e: any) => {
      if (e.detail && e.detail !== selectedDatasetId) {
        setSelectedDatasetId(e.detail);
      }
    };
    const handleExport = () => {
      handleExportRecipe();
    };
    window.addEventListener('datalift:dataset-changed', handleDatasetChanged);
    window.addEventListener('datalift:export-image-recipe', handleExport);
    return () => {
      window.removeEventListener('datalift:dataset-changed', handleDatasetChanged);
      window.removeEventListener('datalift:export-image-recipe', handleExport);
    };
  }, [selectedDatasetId, recipe]);

  const toggleStep = (stepId: string) => {
    setStepToggles(prev => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const handleParamChange = (stepId: string, val: string) => {
    setStepParams(prev => ({
      ...prev,
      [stepId]: val,
    }));
  };

  // ── Dry Run ────────────────────────────────────────────────────────────────
  const handleDryRun = async () => {
    if (!selectedDatasetId) return;
    setDryRunning(true);
    try {
      const enabledList = Object.keys(stepToggles).filter(k => stepToggles[k]);
      const res = await api.dryRunImageCleaningRecipe(selectedDatasetId, {
        enabled_steps: enabledList,
        parameters: stepParams,
      });
      showNotif(res.message || 'Dry run terminé avec succès sur 500 images.', true);
    } catch (err: any) {
      showNotif('Erreur lors du dry run: ' + (err.message || 'inconnue'), false);
    } finally {
      setDryRunning(false);
    }
  };

  // ── Apply & Create V2 ──────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!selectedDatasetId) return;
    setApplying(true);
    try {
      const enabledList = Object.keys(stepToggles).filter(k => stepToggles[k]);
      const res = await api.applyImageCleaningRecipe(selectedDatasetId, {
        enabled_steps: enabledList,
        parameters: stepParams,
      });
      setRecipe(res);
      showNotif(`Recette appliquée ! Version ${res.kpis.output || 'v2'} générée avec succès.`, true);
    } catch (err: any) {
      showNotif('Erreur application: ' + (err.message || 'inconnue'), false);
    } finally {
      setApplying(false);
    }
  };

  const handleExportRecipe = () => {
    if (!recipe) return;
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipe_${recipe.display_title.replace(/[\/\\?%*:|"<>]/g, '_') || 'image'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotif('Recette de nettoyage image exportée au format JSON.');
  };

  if (loading && !recipe) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontFamily: 'monospace' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 16px', display: 'block', color: C.amber }} />
        Chargement de la recette de nettoyage d'images...
      </div>
    );
  }

  if (error && !recipe) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.red, fontFamily: 'monospace' }}>
        <AlertCircle size={24} style={{ margin: '0 auto 16px', display: 'block' }} />
        {error}
      </div>
    );
  }

  const activeStepsCount = Object.values(stepToggles).filter(Boolean).length;
  const currentPreview = recipe?.previews?.[previewStepId] || recipe?.previews?.['brighten_dark'];

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100%',
        color: C.text,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '24px 48px 80px 48px',
        maxWidth: 1360,
        margin: '0 auto',
      }}
    >
      {/* Toast Notification */}
      {notif && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
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

      {/* ── TOP DATASET SELECTOR ROW ────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
          paddingBottom: 14,
          borderBottom: `1px solid ${C.border}`,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Jeu de données :
          </span>
          <select
            value={selectedDatasetId}
            onChange={e => {
              setSelectedDatasetId(e.target.value);
              localStorage.setItem('datalift_selected_dataset_id', e.target.value);
              window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: e.target.value }));
            }}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              color: C.text,
              borderRadius: 4,
              padding: '6px 14px',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {datasets.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── HEADER TITLE & KPIS (Mockup 1) ───────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <div
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: C.muted,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          {recipe?.breadcrumb || 'DATASET · V1 RAW → V2 DRAFT · OBJECT DETECTION'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          {/* Main Serif Italic Title */}
          <div>
            <h1
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '2.6rem',
                margin: 0,
                letterSpacing: 0.5,
                color: '#fff',
              }}
            >
              {recipe?.display_title || 'product_defects/'}
            </h1>

            {/* 4 Metadata Sub-Columns */}
            <div style={{ display: 'flex', gap: 40, marginTop: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>IMAGES</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.images || '11,838'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.images_was || 'was 12,480'}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>CLASSES</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.classes ?? 6}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.classes_sub || 'no change'}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>IMAGES FIXED</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.images_fixed || '418'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.images_fixed_sub || '3.3% of the set · plus resize'}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>OUTPUT</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.output || 'v2'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.output_sub || 'v1 kept as is'}</div>
              </div>
            </div>
          </div>

          {/* Big Health Transition Score: 68 -> 83 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: 'Playfair Display, Georgia, serif',
                  fontSize: '3.6rem',
                  lineHeight: 1,
                  color: '#4b5563',
                  fontWeight: 400,
                }}
              >
                {recipe?.health.before ?? 68}
              </span>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1, marginTop: 4 }}>
                BEFORE
              </div>
            </div>

            <span style={{ fontSize: '1.8rem', color: '#4b5563', fontWeight: 300, marginBottom: 14 }}>→</span>

            <div>
              <span
                style={{
                  fontFamily: 'Playfair Display, Georgia, serif',
                  fontSize: '5rem',
                  lineHeight: 1,
                  color: C.amber,
                  fontWeight: 400,
                }}
              >
                {recipe?.health.after ?? 83}
              </span>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1, marginTop: 4 }}>
                HEALTH AFTER / 100
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION: CLEANING RECIPE (Mockup 1 & 2) ──────────────────────── */}
      <div style={{ marginBottom: 44 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16,
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: 12,
          }}
        >
          <h2
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.75rem',
              margin: 0,
              color: '#fff',
            }}
          >
            Cleaning recipe
          </h2>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>
            {activeStepsCount} OF 5 STEPS ON · RUNS TOP TO BOTTOM
          </span>
        </div>

        {/* Steps List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {recipe?.steps.map((step) => {
            const isEnabled = stepToggles[step.id] ?? step.enabled;
            const isPreviewing = previewStepId === step.id;

            return (
              <div
                key={step.id}
                style={{
                  background: isPreviewing ? 'rgba(245, 158, 11, 0.03)' : C.card,
                  border: isPreviewing ? `1px solid rgba(245, 158, 11, 0.3)` : `1px solid ${C.border}`,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 4,
                  marginBottom: 6,
                  transition: 'all 0.15s ease',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                {/* Left Part: Toggle + Rank + Title & Subtitle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 320, flex: '1 1 400px' }}>
                  {step.is_later ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: C.muted,
                        border: `1px solid ${C.borderLight}`,
                        padding: '3px 8px',
                        borderRadius: 3,
                        background: '#16171b',
                      }}
                    >
                      {step.badge || 'LATER'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleStep(step.id)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        background: isEnabled ? C.amber : '#27272a',
                        position: 'relative',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: isEnabled ? '#000' : '#71717a',
                          position: 'absolute',
                          top: 3,
                          left: isEnabled ? 19 : 3,
                          transition: 'left 0.2s',
                        }}
                      />
                    </button>
                  )}

                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: C.muted }}>{step.rank}</span>

                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: isEnabled ? C.text : C.muted }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{step.subtitle}</div>
                  </div>
                </div>

                {/* Right Part: Param Dropdown + Affected Count + Preview Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  {/* Parameter Dropdown */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8, marginBottom: 4 }}>
                      {step.param_label}
                    </div>
                    <select
                      value={stepParams[step.id] || step.param_value}
                      onChange={e => handleParamChange(step.id, e.target.value)}
                      disabled={step.is_later}
                      style={{
                        background: '#16171a',
                        border: `1px solid ${C.borderLight}`,
                        color: C.text,
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        cursor: step.is_later ? 'default' : 'pointer',
                        outline: 'none',
                      }}
                    >
                      {step.options.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Affected Count */}
                  <div style={{ minWidth: 90, textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: step.count_label.startsWith('-') ? C.amberDark : isEnabled ? C.amber : C.muted,
                      }}
                    >
                      {step.count_label}
                    </span>
                  </div>

                  {/* Preview Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewStepId(step.id)}
                    style={{
                      background: isPreviewing ? C.amberSubtle : 'transparent',
                      border: `1px solid ${isPreviewing ? C.amber : C.borderLight}`,
                      color: isPreviewing ? C.amber : C.textMuted,
                      padding: '5px 14px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isPreviewing ? 'Previewing' : 'Preview →'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add manual step footer link */}
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => showNotif("Module d'étape manuelle image : crop, grayscale, drop a class, filter by camera (prêt pour extension).", true)}
            style={{
              background: 'none',
              border: 'none',
              color: C.muted,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
              padding: 0,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.amber)}
            onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
          >
            + Add a manual step — crop, grayscale, drop a class, filter by camera
          </button>
        </div>
      </div>

      {/* ── 2-COLUMN SECTION: PREVIEW & QUALITY IMPACT (Mockup 2) ────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 32,
          marginBottom: 40,
        }}
      >
        {/* LEFT COLUMN: VISUAL PREVIEW OF IMAGE PAIRS */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 16,
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: 10,
            }}
          >
            <h3
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '1.45rem',
                margin: 0,
                color: '#fff',
              }}
            >
              Preview
            </h3>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8 }}>
              {currentPreview?.step_header || '03 · BRIGHTEN 418 TOO-DARK IMAGES'}
            </span>
          </div>

          {/* Cards Grid Showing Image Pairs with Arrows */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              overflowX: 'auto',
              paddingBottom: 8,
              alignItems: 'center',
            }}
          >
            {currentPreview?.pairs.map((pair, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexShrink: 0,
                }}
              >
                {/* Before Card */}
                <div
                  style={{
                    width: 140,
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: `1px solid ${C.border}`,
                    background: '#101114',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ width: '100%', height: 95, overflow: 'hidden', background: '#090a0c' }}>
                    <img
                      src={pair.before_img}
                      alt={pair.before_label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                  <div
                    style={{
                      padding: '5px 8px',
                      background: '#0d0e11',
                      borderTop: `1px solid ${C.border}`,
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: C.amberDark,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                    }}
                  >
                    {pair.before_label}
                  </div>
                </div>

                {/* Arrow */}
                <span style={{ color: C.muted, fontSize: 14 }}>→</span>

                {/* After Card */}
                <div
                  style={{
                    width: 140,
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: `1px solid rgba(245, 158, 11, 0.4)`,
                    background: '#101114',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ width: '100%', height: 95, overflow: 'hidden', background: '#090a0c' }}>
                    <img
                      src={pair.after_img}
                      alt={pair.after_label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                  <div
                    style={{
                      padding: '5px 8px',
                      background: '#0d0e11',
                      borderTop: `1px solid ${C.border}`,
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: C.text,
                      letterSpacing: 0.5,
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pair.after_label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footnote */}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 12, fontStyle: 'italic', lineHeight: 1.4 }}>
            {currentPreview?.footnote || '52 images stay too dark after correction; they are excluded and listed in the report.'}
          </div>
        </div>

        {/* RIGHT COLUMN: QUALITY IMPACT (Mockup 2) */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 16,
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: 10,
            }}
          >
            <h3
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '1.45rem',
                margin: 0,
                color: '#fff',
              }}
            >
              Quality impact
            </h3>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8 }}>
              BEFORE → AFTER
            </span>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: '20px 24px', background: C.card, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Readability */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Readability</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>
                  {recipe?.quality_impact.readability.before ?? 99} → {recipe?.quality_impact.readability.after ?? 100}%
                </span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '100%', height: '100%', background: C.amber, borderRadius: 3 }} />
              </div>
            </div>

            {/* Uniqueness */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Uniqueness</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>
                  {recipe?.quality_impact.uniqueness.before ?? 93} → {recipe?.quality_impact.uniqueness.after ?? 98}%
                </span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '98%', height: '100%', background: C.amber, borderRadius: 3 }} />
              </div>
            </div>

            {/* Image quality */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Image quality</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>
                  {recipe?.quality_impact.image_quality.before ?? 82} → {recipe?.quality_impact.image_quality.after ?? 95}%
                </span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '95%', height: '100%', background: C.amber, borderRadius: 3 }} />
              </div>
            </div>

            {/* Label coverage */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Label coverage</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>
                  {recipe?.quality_impact.label_coverage.value ?? 91}%
                </span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '91%', height: '100%', background: '#71717a', borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {recipe?.quality_impact.label_coverage.subtitle || 'Rises to 100% after 05 Labeling'}
              </div>
            </div>

            {/* Class balance */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Class balance</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>
                  {recipe?.quality_impact.class_balance.value ?? 38}%
                </span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '38%', height: '100%', background: '#f87171', borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {recipe?.quality_impact.class_balance.subtitle || 'Improves in 03 Augmentation, on the training split only'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM STICKY ACTION BAR (Mockup 2) ──────────────────────────── */}
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          background: '#111215',
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            {activeStepsCount} steps will run on v1 raw
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            v1 stays untouched · the result is saved as v2 with this recipe attached, and annotations are moved with every resize
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            onClick={handleDryRun}
            disabled={dryRunning}
            style={{
              background: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: C.text,
              padding: '9px 18px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: dryRunning ? 'not-allowed' : 'pointer',
              opacity: dryRunning ? 0.6 : 1,
            }}
          >
            {dryRunning ? 'Running dry run...' : 'Dry run on 500 images'}
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            style={{
              background: C.amber,
              border: 'none',
              color: '#000',
              fontWeight: 600,
              padding: '9px 22px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: applying ? 'not-allowed' : 'pointer',
              opacity: applying ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {applying ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Applying...
              </>
            ) : (
              'Apply and create v2'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCleaningPage;

