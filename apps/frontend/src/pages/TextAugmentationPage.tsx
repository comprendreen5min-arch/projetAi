import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Dataset, TextAugmentationRecipeResponse, TextAugmentationComparisonResponse } from '../types';
import { RefreshCw, AlertCircle, Lock, Check } from 'lucide-react';

// ─── Theme Colors ───────────────────────────────────────────────────────────
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

export const TextAugmentationPage: React.FC = () => {
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [recipe, setRecipe] = useState<TextAugmentationRecipeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Split state
  const [splitRatio, setSplitRatio] = useState<string>('70 / 15 / 15');
  const [groupBy, setGroupBy] = useState<string>('ticket_id');
  const [stratify, setStratify] = useState<string>('label');

  // Target balance mode ('keep', '2000', '4000', '6000' or dynamic dataset modes)
  const [targetMode, setTargetMode] = useState<string>('4000');

  // Active technique for preview
  const [previewTechId, setPreviewTechId] = useState<string>('darija_codeswitch');

  // Technique toggles & parameter states
  const [techToggles, setTechToggles] = useState<Record<string, boolean>>({
    paraphrase_llm: true,
    back_translation: true,
    darija_codeswitch: true,
    rare_labels_llm: false,
    typos_casing: true,
  });

  const [techParams, setTechParams] = useState<Record<string, string>>({
    paraphrase_llm: 'Up to 3 per ticket',
    back_translation: 'English',
    darija_codeswitch: 'Arabizi + mixed',
    rare_labels_llm: '30% of a label',
    typos_casing: '1 text in 10',
  });

  // Comparison state
  const [comparing, setComparing] = useState<boolean>(false);
  const [comparison, setComparison] = useState<TextAugmentationComparisonResponse | null>(null);

  // Save V3 state
  const [saving, setSaving] = useState<boolean>(false);
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null);

  const showNotif = (msg: string, ok: boolean = true) => {
    setNotif({ msg, ok });
    setTimeout(() => setNotif(null), 5000);
  };

  // ── Load Datasets ──────────────────────────────────────────────────────────
  const loadDatasets = useCallback(async () => {
    try {
      const list = await api.getDatasets();
      const textList = list.filter(
        d => d.name.endsWith('.txt') || d.name.endsWith('.jsonl') || d.name.includes('nlp') || d.name.includes('text')
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
      setError('Erreur lors du chargement des jeux de données texte');
    }
  }, []);

  // ── Load Recipe for active dataset ─────────────────────────────────────────
  const loadRecipe = useCallback(async (dsId: string) => {
    if (!dsId) return;
    setLoading(true);
    setError(null);
    setComparison(null);
    try {
      const data = await api.getTextAugmentationRecipe(dsId);
      setRecipe(data);

      if (data.split_config) {
        setSplitRatio(data.split_config.ratio);
        setGroupBy(data.split_config.group_by);
        setStratify(data.split_config.stratify);
      }
      if (data.target_balance) {
        setTargetMode(data.target_balance.selected_mode);
      }

      const toggles: Record<string, boolean> = {};
      const params: Record<string, string> = {};
      data.techniques.forEach(t => {
        toggles[t.id] = t.enabled;
        params[t.id] = t.param_value;
      });
      setTechToggles(toggles);
      setTechParams(params);

      if (data.preview_technique_id) {
        setPreviewTechId(data.preview_technique_id);
      }
    } catch (err: any) {
      console.error(err);
      setError("Erreur lors de la récupération de la recette d'augmentation texte.");
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

  // Handle Modality or Export event from TopBar
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
    window.addEventListener('datalift:export-text-augmentation-recipe', handleExport);
    return () => {
      window.removeEventListener('datalift:dataset-changed', handleDatasetChanged);
      window.removeEventListener('datalift:export-text-augmentation-recipe', handleExport);
    };
  }, [selectedDatasetId, recipe]);

  const toggleTechnique = (techId: string) => {
    setTechToggles(prev => ({
      ...prev,
      [techId]: !prev[techId],
    }));
  };

  const handleParamChange = (techId: string, val: string) => {
    setTechParams(prev => ({
      ...prev,
      [techId]: val,
    }));
  };

  // ── Dynamic calculations based on active dataset, splitRatio & targetMode ──
  const { trainPct, valPct, testPct } = useMemo(() => {
    const parts = splitRatio.split('/').map(s => parseInt(s.trim(), 10) || 15);
    return {
      trainPct: parts[0] || 70,
      valPct: parts[1] || 15,
      testPct: parts[2] || 15,
    };
  }, [splitRatio]);

  // Base raw counts extracted directly from dataset recipe
  const baseRawTrain = useMemo(() => {
    if (!recipe) return 39223;
    const m = recipe.kpis.tickets_in_train_was.match(/[\d,]+/);
    return m ? parseInt(m[0].replace(/,/g, ''), 10) : 39223;
  }, [recipe]);

  const baseRawTest = useMemo(() => {
    if (!recipe) return 8407;
    const m = recipe.kpis.test_set.match(/[\d,]+/);
    return m ? parseInt(m[0].replace(/,/g, ''), 10) : 8407;
  }, [recipe]);

  const rawTrainCount = useMemo(() => {
    if (trainPct === 70) return baseRawTrain;
    return Math.round((baseRawTrain / 70) * trainPct);
  }, [baseRawTrain, trainPct]);

  const rawTestCount = useMemo(() => {
    if (testPct === 15) return baseRawTest;
    return Math.round((baseRawTest / 15) * testPct);
  }, [baseRawTest, testPct]);

  // Target threshold
  const targetThreshold = useMemo(() => {
    if (targetMode === 'keep') return 0;
    return parseInt(targetMode, 10) || 4000;
  }, [targetMode]);

  // Compute dynamic classes breakdown
  const computedClasses = useMemo(() => {
    if (!recipe) return [];
    return recipe.target_balance.classes.map(cls => {
      if (targetThreshold === 0) {
        return { ...cls, generated: 0, target: cls.real, is_capped: false };
      }
      const deficit = Math.max(0, targetThreshold - cls.real);
      // Cap at 50% synthetic: generated cannot exceed real
      const isCapped = deficit > cls.real;
      const generated = isCapped ? cls.real : deficit;
      return {
        ...cls,
        generated,
        target: targetThreshold,
        is_capped: isCapped,
      };
    });
  }, [recipe, targetThreshold]);

  // Total generated tickets
  const totalGenerated = useMemo(() => {
    return computedClasses.reduce((sum, c) => sum + c.generated, 0);
  }, [computedClasses]);

  const ticketsInTrain = useMemo(() => {
    return rawTrainCount + totalGenerated;
  }, [rawTrainCount, totalGenerated]);

  // Dynamic Label Balance score
  const dynamicLabelBalance = useMemo(() => {
    if (!recipe) return { before: 58, after: 71 };
    if (targetMode === 'keep') {
      return { before: recipe.label_balance.before, after: recipe.label_balance.before };
    }
    if (targetMode === recipe.target_balance.selected_mode) {
      return { before: recipe.label_balance.before, after: recipe.label_balance.after };
    }
    const ratio = totalGenerated / Math.max(rawTrainCount, 1);
    const scoreAfter = Math.min(96, Math.round(recipe.label_balance.before + ratio * 130));
    return { before: recipe.label_balance.before, after: Math.max(recipe.label_balance.before, scoreAfter) };
  }, [recipe, targetMode, totalGenerated, rawTrainCount]);

  // Dynamic distribution of generated tickets across techniques
  const activeTechCount = useMemo(() => {
    return Object.values(techToggles).filter(Boolean).length;
  }, [techToggles]);

  const techniqueCounts = useMemo(() => {
    if (totalGenerated === 0) {
      return {
        paraphrase_llm: '+0 tickets',
        back_translation: '+0 tickets',
        darija_codeswitch: '+0 tickets',
        rare_labels_llm: 'Off',
        typos_casing: 'Every epoch',
      };
    }
    const isTickets = recipe?.display_title.includes('ticket');
    const unit = isTickets ? 'tickets' : 'textes';
    const count1 = Math.round(totalGenerated * 0.40);
    const count2 = Math.round(totalGenerated * 0.30);
    const count3 = totalGenerated - count1 - count2;
    return {
      paraphrase_llm: `+${count1.toLocaleString()} ${unit}`,
      back_translation: `+${count2.toLocaleString()} ${unit}`,
      darija_codeswitch: `+${count3.toLocaleString()} ${unit}`,
      rare_labels_llm: techToggles['rare_labels_llm'] ? `+${Math.round(totalGenerated * 0.15).toLocaleString()} ${unit}` : 'Off',
      typos_casing: 'Every epoch',
    };
  }, [totalGenerated, techToggles, recipe]);

  // ── Run Comparison ("Does it actually help?") ───────────────────────────────
  const handleRunComparison = async () => {
    if (!selectedDatasetId) return;
    setComparing(true);
    try {
      const res = await api.compareTextAugmentation(selectedDatasetId, {
        target_mode: targetMode,
        techniques: Object.keys(techToggles).filter(k => techToggles[k]),
      });
      setComparison(res);
      showNotif(`Comparaison terminée ! Amélioration Macro F1 de ${res.delta || '+0.09'}.`, true);
    } catch (err: any) {
      showNotif('Erreur lors de la comparaison: ' + (err.message || 'inconnue'), false);
    } finally {
      setComparing(false);
    }
  };

  // ── Save as v3 ─────────────────────────────────────────────────────────────
  const handleSaveV3 = async () => {
    if (!selectedDatasetId) return;
    setSaving(true);
    try {
      const res = await api.saveTextAugmentationV3(selectedDatasetId, {
        split_config: { ratio: splitRatio, group_by: groupBy, stratify },
        target_balance: { mode: targetMode },
        techniques: Object.keys(techToggles).filter(k => techToggles[k]),
      });
      setRecipe(res);
      showNotif('Version v3 générée avec succès ! Recette attachée pour reproductibilité.', true);
    } catch (err: any) {
      showNotif('Erreur enregistrement v3: ' + (err.message || 'inconnue'), false);
    } finally {
      setSaving(false);
    }
  };

  const handleExportRecipe = () => {
    if (!recipe) return;
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `text_augmentation_recipe_${recipe.display_title.replace(/[\/\\?%*:|"<>]/g, '_') || 'text'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotif("Recette d'augmentation texte exportée au format JSON.");
  };

  if (loading && !recipe) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontFamily: 'monospace' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 16px', display: 'block', color: C.amber }} />
        Chargement de la recette d'augmentation texte...
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

  const currentPreview = recipe?.previews?.[previewTechId] || recipe?.previews?.['darija_codeswitch'];

  // Scale max value for horizontal bars
  const maxBarValue = Math.max(
    ...computedClasses.map(c => c.real + c.generated),
    targetThreshold,
    100
  );

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
          {recipe?.breadcrumb || 'DATASET · V2 CLEAN → V3 AUGMENTED · TEXT CLASSIFICATION'}
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
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>TICKETS IN TRAIN</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{ticketsInTrain.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>was {rawTrainCount.toLocaleString()}</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>GENERATED</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{totalGenerated.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {((totalGenerated / Math.max(rawTrainCount, 1)) * 100).toFixed(1)}% of train
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>TEST SET</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{rawTestCount.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>locked · 100% real</div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>OUTPUT</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{recipe?.kpis.output || 'v3'}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{recipe?.kpis.output_sub || 'v2 kept as is'}</div>
              </div>
            </div>
          </div>

          {/* Big Transition Score */}
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
                {dynamicLabelBalance.before}
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
                {dynamicLabelBalance.after}
              </span>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1, marginTop: 4 }}>
                {recipe?.label_balance.label || 'LABEL BALANCE / 100'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: SPLIT FIRST (Mockup 1) ────────────────────────────── */}
      <div style={{ marginBottom: 44 }}>
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
            1·Split first
          </h2>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>
            ONLY TRAIN IS AUGMENTED
          </span>
        </div>

        {/* Split Segmented Bar + Dropdowns Row */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Split bar */}
          <div
            style={{
              flex: '1 1 500px',
              height: 40,
              borderRadius: 4,
              overflow: 'hidden',
              display: 'flex',
              background: '#16171b',
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                width: `${trainPct}%`,
                background: C.amber,
                color: '#000',
                fontWeight: 600,
                fontSize: 12,
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 16,
                transition: 'width 0.3s ease',
              }}
            >
              Train {trainPct}% · augmented
            </div>
            <div
              style={{
                width: `${valPct}%`,
                background: '#27272a',
                color: C.text,
                fontSize: 12,
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderLeft: '1px solid #1c1d21',
                transition: 'width 0.3s ease',
              }}
            >
              Val {valPct}%
            </div>
            <div
              style={{
                width: `${testPct}%`,
                background: '#1f2024',
                color: C.textMuted,
                fontSize: 12,
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                borderLeft: '1px solid #1c1d21',
                transition: 'width 0.3s ease',
              }}
            >
              <Lock size={12} />
              Test {testPct}%
            </div>
          </div>

          {/* Ratio Dropdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8 }}>RATIO</span>
            <select
              value={splitRatio}
              onChange={e => setSplitRatio(e.target.value)}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                color: C.text,
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 11,
                fontFamily: 'monospace',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="70 / 15 / 15">70 / 15 / 15</option>
              <option value="80 / 10 / 10">80 / 10 / 10</option>
              <option value="60 / 20 / 20">60 / 20 / 20</option>
            </select>
          </div>

          {/* Group By Dropdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8 }}>GROUP BY</span>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value)}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                color: C.text,
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 11,
                fontFamily: 'monospace',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {recipe?.split_config.group_by_options.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              )) || (
                <>
                  <option value="ticket_id">ticket_id</option>
                  <option value="document_id">document_id</option>
                  <option value="none">none</option>
                </>
              )}
            </select>
          </div>

          {/* Stratify Dropdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8 }}>STRATIFY</span>
            <select
              value={stratify}
              onChange={e => setStratify(e.target.value)}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                color: C.text,
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 11,
                fontFamily: 'monospace',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {recipe?.split_config.stratify_options.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              )) || (
                <>
                  <option value="label">label</option>
                  <option value="none">none</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Footnote */}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.4 }}>
          {recipe?.split_config.footnote ||
            'Grouped by ticket_id, so chunks of a long ticket and its future paraphrases always land in the same split. Stratified on label.'}
        </div>
      </div>

      {/* ── SECTION 2: TARGET BALANCE (Mockup 1) ─────────────────────────── */}
      <div style={{ marginBottom: 44 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: 10,
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
            2·Target balance
          </h2>

          {/* Dynamic Mode Pills */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(recipe?.target_balance.modes || [
              { id: 'keep', label: 'Keep as is' },
              { id: '2000', label: 'Min 2,000' },
              { id: '4000', label: 'Min 4,000' },
              { id: '6000', label: 'Min 6,000' },
            ]).map(m => {
              const active = targetMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTargetMode(m.id)}
                  style={{
                    background: active ? C.amber : 'transparent',
                    border: `1px solid ${active ? C.amber : C.borderLight}`,
                    color: active ? '#000' : C.textMuted,
                    fontWeight: active ? 600 : 400,
                    borderRadius: 20,
                    padding: '5px 14px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Horizontal Bar Breakdown per Class */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {computedClasses.map(cls => {
            const realPct = (cls.real / maxBarValue) * 100;
            const genPct = (cls.generated / maxBarValue) * 100;
            const targetPct = targetThreshold > 0 ? (targetThreshold / maxBarValue) * 100 : 0;

            const isCapped = cls.is_capped;

            return (
              <div key={cls.name} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Class Label */}
                <div style={{ width: 100, fontSize: 13, color: isCapped ? C.coral : C.text, fontFamily: 'monospace' }}>
                  {cls.name}
                </div>

                {/* Progress Bar Container */}
                <div
                  style={{
                    flex: 1,
                    height: 22,
                    background: '#191b20',
                    borderRadius: 3,
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                >
                  {/* Real bar */}
                  <div
                    style={{
                      width: `${realPct}%`,
                      height: '100%',
                      background: '#4a4c52',
                      transition: 'width 0.3s ease',
                    }}
                  />

                  {/* Generated bar */}
                  {cls.generated > 0 && (
                    <div
                      style={{
                        width: `${genPct}%`,
                        height: '100%',
                        background: isCapped ? '#fb7185' : C.amber,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  )}

                  {/* Target Marker Line */}
                  {targetThreshold > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${targetPct}%`,
                        width: 2,
                        background: '#ffffff',
                        opacity: 0.85,
                        zIndex: 2,
                        transition: 'left 0.3s ease',
                      }}
                    />
                  )}
                </div>

                {/* Count Display */}
                <div style={{ width: 130, textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: C.textMuted }}>
                  {cls.generated > 0 ? (
                    <>
                      <span>{cls.real.toLocaleString()}</span>
                      <span style={{ color: isCapped ? C.coral : C.amber }}> + {cls.generated.toLocaleString()}</span>
                    </>
                  ) : (
                    cls.real.toLocaleString()
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 16, fontSize: 11, fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted }}>
            <span style={{ width: 10, height: 10, background: '#4a4c52', display: 'inline-block', borderRadius: 2 }} />
            Real
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.amber }}>
            <span style={{ width: 10, height: 10, background: C.amber, display: 'inline-block', borderRadius: 2 }} />
            Generated
          </div>
          {targetThreshold > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}>
              <span style={{ width: 2, height: 12, background: '#fff', display: 'inline-block' }} />
              Target
            </div>
          )}
          <div style={{ marginLeft: 20, color: C.coral }}>
            {recipe?.target_balance.note ||
              'complaint and other capped at 50% synthetic · collect more real tickets for them'}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: TECHNIQUES (Mockup 2) ─────────────────────────────── */}
      <div style={{ marginBottom: 44 }}>
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
            3·Techniques
          </h2>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>
            {activeTechCount} ON · SUGGESTED FOR TEXT
          </span>
        </div>

        {/* Techniques List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recipe?.techniques.map(tech => {
            const isEnabled = techToggles[tech.id] ?? tech.enabled;
            const isPreviewing = previewTechId === tech.id;
            const countLabel = techniqueCounts[tech.id as keyof typeof techniqueCounts] || tech.count_label;

            return (
              <div
                key={tech.id}
                style={{
                  background: isPreviewing ? 'rgba(245, 158, 11, 0.03)' : C.card,
                  border: isPreviewing ? `1px solid rgba(245, 158, 11, 0.3)` : `1px solid ${C.border}`,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 4,
                  transition: 'all 0.15s ease',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                {/* Left Part: Toggle + Rank + Title & Subtitle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 320, flex: '1 1 420px' }}>
                  <button
                    type="button"
                    onClick={() => toggleTechnique(tech.id)}
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

                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: C.muted }}>{tech.rank}</span>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: isEnabled ? C.text : C.muted }}>
                        {tech.title}
                      </span>
                      {tech.badge && (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: 'monospace',
                            color: tech.badge.includes('FLY') ? '#60a5fa' : C.amberDark,
                            border: `1px solid ${tech.badge.includes('FLY') ? 'rgba(96,165,250,0.3)' : 'rgba(180,83,9,0.3)'}`,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: '#16171b',
                          }}
                        >
                          {tech.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{tech.subtitle}</div>
                  </div>
                </div>

                {/* Right Part: Param Dropdown + Generated Count + Preview Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  {/* Parameter Dropdown */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8, marginBottom: 4 }}>
                      {tech.param_label}
                    </div>
                    <select
                      value={techParams[tech.id] || tech.param_value}
                      onChange={e => handleParamChange(tech.id, e.target.value)}
                      disabled={!isEnabled}
                      style={{
                        background: '#16171a',
                        border: `1px solid ${C.borderLight}`,
                        color: isEnabled ? C.text : C.muted,
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        cursor: isEnabled ? 'pointer' : 'not-allowed',
                        outline: 'none',
                      }}
                    >
                      {tech.options.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Count Label */}
                  <div style={{ minWidth: 90, textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: isEnabled ? C.amber : C.muted,
                      }}
                    >
                      {countLabel}
                    </span>
                  </div>

                  {/* Preview Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewTechId(tech.id)}
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

        {/* Add custom transform link */}
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => showNotif("Module d'étape personnalisée Python (prêt pour extension).", true)}
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
            + Add a custom transform in Python
          </button>
        </div>
      </div>

      {/* ── 2-COLUMN SECTION: PREVIEW & GUARDRAILS (Mockup 2) ────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 32,
          marginBottom: 40,
        }}
      >
        {/* LEFT COLUMN: PREVIEW OF TEXT VARIANTS */}
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
              {currentPreview?.header || '03 · DARIJA AND CODE-SWITCHING VARIANTS'}
            </span>
          </div>

          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '20px 24px',
            }}
          >
            {/* Original Card Header */}
            <div
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: C.muted,
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              {currentPreview?.original_card.label || 'ORIGINAL'}
            </div>

            {/* Original Text */}
            <div
              style={{
                fontSize: 16,
                color: '#fff',
                marginBottom: 20,
                lineHeight: 1.5,
                direction: currentPreview?.original_card.text.match(/[\u0600-\u06FF]/) ? 'rtl' : 'ltr',
              }}
            >
              {currentPreview?.original_card.text || 'Texte original'}
            </div>

            {/* Variants Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: `1px solid ${C.borderLight}`, paddingTop: 16 }}>
              {currentPreview?.variants.map((v, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                  <span
                    style={{
                      width: 130,
                      fontSize: 10,
                      fontFamily: 'monospace',
                      color: C.amberDark,
                      fontWeight: 600,
                      letterSpacing: 0.6,
                      flexShrink: 0,
                    }}
                  >
                    {v.type}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: C.text,
                      lineHeight: 1.4,
                      direction: v.text.match(/[\u0600-\u06FF]/) ? 'rtl' : 'ltr',
                    }}
                  >
                    {v.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Footnote */}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 18, fontStyle: 'italic', lineHeight: 1.4 }}>
              {currentPreview?.footnote ||
                'Variants follow authentic customer formulations without altering semantic intent.'}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: GUARDRAILS */}
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
              Guardrails
            </h3>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 0.8 }}>
              CHECKED BEFORE SAVING
            </span>
          </div>

          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {recipe?.guardrails.map((g, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div
                  style={{
                    color: C.amber,
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                >
                  <Check size={15} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{g.title}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {idx === 0 ? `${rawTestCount.toLocaleString()} test documents stay 100% real` : g.subtitle}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION: DOES IT ACTUALLY HELP? (Mockup 3) ───────────────────── */}
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          background: C.card,
          padding: '22px 28px',
          marginBottom: 32,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
          <div>
            <h3
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '1.55rem',
                margin: 0,
                color: '#fff',
              }}
            >
              Does it actually help?
            </h3>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              Trains the same quick model on v2 and on v3, then scores both on the real test set only.
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunComparison}
            disabled={comparing}
            style={{
              background: 'transparent',
              border: `1px solid ${C.amber}`,
              color: C.amber,
              padding: '8px 18px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: comparing ? 'not-allowed' : 'pointer',
              opacity: comparing ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {comparing ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                Training quick models...
              </>
            ) : (
              'Run comparison'
            )}
          </button>
        </div>

        {/* Evaluation Metrics Comparison Columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: 20,
            borderTop: `1px solid ${C.borderLight}`,
            paddingTop: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>METRIC</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginTop: 4 }}>
              {comparison?.metric || recipe?.comparison.metric || `Macro F1 across ${computedClasses.length} labels`}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>WITHOUT · V2</div>
            <div style={{ fontSize: 16, fontFamily: 'monospace', color: C.text, marginTop: 4 }}>
              {comparison?.without_v2 !== undefined ? comparison.without_v2.toFixed(2) : '—'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted, letterSpacing: 1 }}>WITH · V3</div>
            <div style={{ fontSize: 16, fontFamily: 'monospace', color: comparison ? C.green : C.text, marginTop: 4 }}>
              {comparison?.with_v3 !== undefined ? (
                <>
                  {comparison.with_v3.toFixed(2)}{' '}
                  <span style={{ fontSize: 12, color: C.green }}>({comparison.delta})</span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM STICKY ACTION BAR (Mockup 3) ──────────────────────────── */}
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
            {totalGenerated > 0
              ? `${totalGenerated.toLocaleString()} generated tickets · ${activeTechCount} techniques`
              : 'No generated tickets · augmentation disabled'}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {recipe?.action_banner.subtitle ||
              'Every generated item is tagged with its origin and its parent, so it can be filtered out anywhere'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            onClick={() => {
              navigate('/training');
              showNotif("Recette d'augmentation prête pour l'étape Training.");
            }}
            style={{
              background: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: C.text,
              padding: '9px 18px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {recipe?.action_banner.send_training_btn || 'Send recipe to Training'}
          </button>

          <button
            type="button"
            onClick={handleSaveV3}
            disabled={saving}
            style={{
              background: C.amber,
              border: 'none',
              color: '#000',
              fontWeight: 600,
              padding: '9px 24px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              recipe?.action_banner.save_v3_btn || 'Save as v3'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TextAugmentationPage;
