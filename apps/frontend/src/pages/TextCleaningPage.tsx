import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { Dataset, TextCleaningRecipeResponse } from '../types';
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

export const TextCleaningPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [recipe, setRecipe] = useState<TextCleaningRecipeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active step for preview (default is mask_pii)
  const [previewStepId, setPreviewStepId] = useState<string>('mask_pii');

  // Step toggle states
  const [stepToggles, setStepToggles] = useState<Record<string, boolean>>({
    mask_pii: true,
    repair_encoding: true,
    remove_duplicates: true,
    remove_empty: true,
    split_long: true,
    balance_labels: false,
  });

  // Step parameters
  const [stepParams, setStepParams] = useState<Record<string, string>>({
    mask_pii: '[PHONE] [EMAIL] [NAME]',
    repair_encoding: 'Re-decode · auto',
    remove_duplicates: 'Earliest ticket',
    remove_empty: 'Strip, then check',
    split_long: '512 tokens · 64 overlap',
    balance_labels: '03 Augmentation',
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
      // Filter for text datasets
      const textList = list.filter(
        d => d.name.endsWith('.jsonl') || d.name.endsWith('.txt') || d.name.includes('text') || d.name.includes('ticket') || d.name.includes('review')
      );
      setDatasets(textList.length > 0 ? textList : list);

      const savedId = localStorage.getItem('datalift_selected_dataset_id');
      const match = (textList.length > 0 ? textList : list).find(d => d.id === savedId);
      const target = match || textList.find(d => d.name === 'support_tickets.jsonl') || textList[0] || list[0];

      if (target) {
        setSelectedDatasetId(target.id);
      }
    } catch (err: any) {
      console.error(err);
      setError('Erreur lors du chargement des jeux de données');
    }
  }, []);

  // ── Load Recipe ────────────────────────────────────────────────────────────
  const loadRecipe = useCallback(async (dsId: string) => {
    if (!dsId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTextCleaningRecipe(dsId);
      setRecipe(data);

      // Initialize toggles from response
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
      setError('Erreur lors de la récupération de la recette de nettoyage.');
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
    window.addEventListener('datalift:export-text-recipe', handleExport);
    return () => {
      window.removeEventListener('datalift:dataset-changed', handleDatasetChanged);
      window.removeEventListener('datalift:export-text-recipe', handleExport);
    };
  }, [selectedDatasetId, recipe]);

  // Handle toggle switch
  const toggleStep = (stepId: string) => {
    setStepToggles(prev => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  // Handle param change
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
      const res = await api.dryRunTextCleaningRecipe(selectedDatasetId, {
        enabled_steps: enabledList,
        parameters: stepParams,
      });
      showNotif(res.message || 'Dry run terminé avec succès sur 2 000 textes.', true);
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
      const res = await api.applyTextCleaningRecipe(selectedDatasetId, {
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

  // Export Recipe JSON
  const handleExportRecipe = () => {
    if (!recipe) return;
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipe_${recipe.display_title || 'text'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotif('Recette de nettoyage exportée au format JSON.');
  };

  if (loading && !recipe) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontFamily: 'monospace' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 16px', display: 'block', color: C.amber }} />
        Chargement de la recette de nettoyage de texte...
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
  const currentPreview = recipe?.previews?.[previewStepId] || recipe?.previews?.['mask_pii'];

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

      {/* ── TOP ACTION BAR (Dataset Switcher) ─────────────────────────── */}
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
        {/* Dataset selector */}
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
          {recipe?.breadcrumb || 'DATASET · V1 RAW · V2 DRAFT · TEXT CLASSIFICATION'}
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
              {recipe?.display_title || 'support_tickets.jsonl'}
            </h1>

            {/* 4 Metadata Sub-Columns */}
            <div style={{ display: 'flex', gap: 40, marginTop: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>DOCUMENTS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.documents || '56,048'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.documents_was || 'was 58,300'}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>LANGUAGES</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.languages ?? 4}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.languages_detail || 'fr · ar · darija · en'}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>TEXTS EDITED</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.texts_edited || '2,636'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.texts_edited_pct || '4.5% of the corpus'}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>OUTPUT</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.output || 'v2'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.output_sub || 'v1 kept as is'}</div>
              </div>
            </div>
          </div>

          {/* Big Health Transition Score: 74 -> 92 */}
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
                {recipe?.health.before ?? 74}
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
                {recipe?.health.after ?? 92}
              </span>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1, marginTop: 4 }}>
                HEALTH AFTER / 100
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION: CLEANING RECIPE (Mockup 1) ───────────────────────────── */}
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
                        color: step.count_label.startsWith('-') ? C.red : isEnabled ? C.amber : C.muted,
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
            onClick={() => showNotif("Module d'étape manuelle : lowercase, strip URLs, regex replace (prêt pour extension).", true)}
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
            + Add a manual step — lowercase, strip URLs, keep one language, regex replace
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
        {/* LEFT COLUMN: PREVIEW TABLE */}
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
              {currentPreview?.step_header || '01 · MASK PERSONAL DATA IN 2,310 TEXTS'}
            </span>
          </div>

          {/* Table */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden', background: C.card }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0e0f12', borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontFamily: 'monospace', fontSize: 10, width: 70 }}>
                    DOC
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontFamily: 'monospace', fontSize: 10 }}>
                    BEFORE
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: C.muted, fontFamily: 'monospace', fontSize: 10, width: 24 }}>
                    →
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontFamily: 'monospace', fontSize: 10 }}>
                    AFTER
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: C.muted, fontFamily: 'monospace', fontSize: 10, width: 50 }}>
                    LANG
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentPreview?.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: idx < currentPreview.rows.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <td style={{ padding: '12px 12px', fontFamily: 'monospace', fontSize: 11, color: C.muted }}>
                      {row.doc}
                    </td>
                    <td style={{ padding: '12px 12px', color: '#d1d5db', lineHeight: 1.4 }}>
                      {row.before}
                    </td>
                    <td style={{ padding: '12px 6px', textAlign: 'center', color: C.muted }}>
                      →
                    </td>
                    <td style={{ padding: '12px 12px', color: '#f3f4f6', lineHeight: 1.4 }}>
                      {row.after.includes('[PHONE]') || row.after.includes('[EMAIL]') || row.after.includes('[NAME]') ? (
                        <span>
                          {row.after.split(/(\[PHONE\]|\[EMAIL\]|\[NAME\])/g).map((part, pIdx) =>
                            ['[PHONE]', '[EMAIL]', '[NAME]'].includes(part) ? (
                              <span
                                key={pIdx}
                                style={{
                                  background: 'rgba(245, 158, 11, 0.15)',
                                  border: '1px solid rgba(245, 158, 11, 0.4)',
                                  color: C.amber,
                                  borderRadius: 3,
                                  padding: '1px 5px',
                                  fontSize: 10,
                                  fontFamily: 'monospace',
                                  fontWeight: 600,
                                  margin: '0 2px',
                                }}
                              >
                                {part}
                              </span>
                            ) : (
                              part
                            )
                          )}
                        </span>
                      ) : row.badge ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              background: row.badge === 'KEPT' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                              border: `1px solid ${row.badge === 'KEPT' ? C.green : C.red}`,
                              color: row.badge === 'KEPT' ? C.green : C.red,
                              borderRadius: 3,
                              padding: '1px 5px',
                              fontSize: 9,
                              fontFamily: 'monospace',
                              fontWeight: 600,
                            }}
                          >
                            {row.badge}
                          </span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>{row.after.replace(/\[(KEPT|REMOVED)\]\s*/, '')}</span>
                        </div>
                      ) : (
                        row.after
                      )}
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: C.muted }}>
                      {row.lang || 'fr'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footnote */}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 10, fontStyle: 'italic', lineHeight: 1.4 }}>
            {currentPreview?.footnote || 'Detection covers French, Arabic, Darija and English. 38 low-confidence matches are listed for review before masking.'}
          </div>
        </div>

        {/* RIGHT COLUMN: QUALITY IMPACT */}
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
            {/* Completeness */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Completeness</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>99 → 100%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '100%', height: '100%', background: C.amber, borderRadius: 3 }} />
              </div>
            </div>

            {/* Uniqueness */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Uniqueness</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>97 → 100%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '100%', height: '100%', background: C.amber, borderRadius: 3 }} />
              </div>
            </div>

            {/* Encoding */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Encoding</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>95 → 100%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '100%', height: '100%', background: C.amber, borderRadius: 3 }} />
              </div>
            </div>

            {/* Privacy */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Privacy</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>52 → 98%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '98%', height: '100%', background: C.amber, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                2% left for review: low-confidence names
              </div>
            </div>

            {/* Label balance */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: 500 }}>Label balance</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>58%</span>
              </div>
              <div style={{ width: '100%', height: 6, background: '#22242a', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: '58%', height: '100%', background: '#71717a', borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Improves in 03 Augmentation, on the training split only
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
            v1 stays untouched · the result is saved as v2 with this recipe attached, so new tickets get the same treatment
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
            {dryRunning ? 'Running dry run...' : 'Dry run on 2k texts'}
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

export default TextCleaningPage;
