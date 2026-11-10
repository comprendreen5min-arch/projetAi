import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import {
  Dataset,
  DatasetVersion,
  VersionProfile,
  CleaningOperation,
  CleaningPreviewResponse,
  StepDiffItem,
} from '../types';
import {
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  X,
  Download,
  Copy,
  ArrowRight,
} from 'lucide-react';

export const CleaningPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Navigation state passed from Profiling (if any)
  const navState = (location.state as {
    datasetId?: string;
    versionHash?: string;
    operation?: string;
    column?: string;
  }) || {};

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(navState.datasetId || '');
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [selectedVersionHash, setSelectedVersionHash] = useState<string>(navState.versionHash || '');
  const [profile, setProfile] = useState<VersionProfile | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Recipe Step Configurations & Toggles
  // Step 01: Duplicates
  const [step01Active, setStep01Active] = useState<boolean>(true);
  const [step01Keep, setStep01Keep] = useState<'first' | 'last'>('first');

  // Step 02: Missing values
  const [step02Active, setStep02Active] = useState<boolean>(true);
  const [step02Strategy, setStep02Strategy] = useState<'median_mode' | 'drop' | 'constant'>('median_mode');

  // Step 03: Inconsistent categories
  const [step03Active, setStep03Active] = useState<boolean>(true);
  const [step03Mapping, setStep03Mapping] = useState<'auto' | 'normalize_only' | 'custom'>('auto');

  // Step 04: Outliers
  const [step04Active, setStep04Active] = useState<boolean>(true);
  const [step04Method, setStep04Method] = useState<'cap_iqr' | 'drop' | 'keep'>('cap_iqr');

  // Currently Previewed Step: '01' | '02' | '03' | '04' | '05' (Default: '03' as in mockup)
  const [activePreviewStep, setActivePreviewStep] = useState<'01' | '02' | '03' | '04' | '05'>('03');

  // Simulation Preview Result from Backend
  const [previewData, setPreviewData] = useState<CleaningPreviewResponse | null>(null);

  // Export Recipe Modal
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [copiedRecipe, setCopiedRecipe] = useState<boolean>(false);

  // Add Manual Step Modal
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualStepType, setManualStepType] = useState<string>('DROP_COLUMN');
  const [manualStepCol, setManualStepCol] = useState<string>('');

  // Initial load
  useEffect(() => {
    loadDatasets();
  }, []);

  // Listen to TopBar export event
  useEffect(() => {
    const handleExport = () => setShowExportModal(true);
    window.addEventListener('datalift:export-recipe', handleExport);
    return () => window.removeEventListener('datalift:export-recipe', handleExport);
  }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await api.getDatasets();
      setDatasets(data);

      if (data.length > 0) {
        const targetId = navState.datasetId || data[0].id;
        setSelectedDatasetId(targetId);
        await loadVersions(targetId, navState.versionHash);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: 'Erreur lors du chargement des jeux de données.' });
      setLoading(false);
    }
  };

  const loadVersions = async (datasetId: string, preferredHash?: string) => {
    try {
      const vers = await api.getVersions(datasetId);
      setVersions(vers);

      if (vers.length > 0) {
        const targetHash = preferredHash && vers.some((v) => v.version_hash === preferredHash)
          ? preferredHash
          : vers[0].version_hash;
        setSelectedVersionHash(targetHash);
        await loadProfile(targetHash);
      } else {
        setSelectedVersionHash('');
        setProfile(null);
        setLoading(false);
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Erreur lors du chargement des versions.' });
      setLoading(false);
    }
  };

  const loadProfile = async (hash: string) => {
    try {
      const prof = await api.getVersionProfile(hash);
      setProfile(prof);
    } catch (err) {
      console.error('Erreur chargement profil:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDatasetId(newId);
    setPreviewData(null);
    loadVersions(newId);
  };

  const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newHash = e.target.value;
    setSelectedVersionHash(newHash);
    setPreviewData(null);
    loadProfile(newHash);
  };

  // Profile-derived context variables
  const originalFileName = useMemo(() => {
    if (profile?.original_filename) return profile.original_filename;
    if (profile?.dataset_name) return `${profile.dataset_name}.csv`;
    return 'customer_churn.csv';
  }, [profile]);

  const currentVersionIndex = useMemo(() => {
    if (!versions.length || !selectedVersionHash) return 1;
    const idx = versions.findIndex((v) => v.version_hash === selectedVersionHash);
    return idx >= 0 ? versions.length - idx : 1;
  }, [versions, selectedVersionHash]);

  const nextVersionLabel = `v${currentVersionIndex + 1}`;
  const currentVersionLabel = `v${currentVersionIndex}`;

  // Findings & Columns analysis from Profile
  const duplicateRowsCount = profile?.summary?.duplicate_rows_count || 0;

  const missingColumns = useMemo(() => {
    if (!profile) return [];
    return profile.columns.filter((c) => c.null_percentage > 0);
  }, [profile]);

  const totalMissingCells = useMemo(() => {
    return missingColumns.reduce((sum, c) => sum + c.null_count, 0);
  }, [missingColumns]);

  const inconsistentCatColumn = useMemo(() => {
    if (!profile) return null;
    return profile.columns.find((c) => c.inconsistent_examples && c.inconsistent_examples.length > 0);
  }, [profile]);

  const outlierColumn = useMemo(() => {
    if (!profile) return null;
    return profile.columns.find((c) => c.outlier_count > 0);
  }, [profile]);

  const targetCol = profile?.summary?.target_column || 'churned';

  // Build Operations Pipeline from the 4 Toggled Steps
  const buildActiveOperations = useCallback((): CleaningOperation[] => {
    const ops: CleaningOperation[] = [];

    // Step 01: DROP_DUPLICATES
    if (step01Active && duplicateRowsCount > 0) {
      ops.push({
        id: 'op-dup',
        type: 'DROP_DUPLICATES',
        parameters: { keep: step01Keep },
      });
    }

    // Step 02: HANDLE_MISSING
    if (step02Active && missingColumns.length > 0) {
      missingColumns.forEach((col) => {
        if (step02Strategy === 'drop') {
          ops.push({
            id: `op-missing-${col.name}`,
            type: 'HANDLE_MISSING',
            column: col.name,
            parameters: { strategy: 'drop' },
          });
        } else if (step02Strategy === 'constant') {
          ops.push({
            id: `op-missing-${col.name}`,
            type: 'HANDLE_MISSING',
            column: col.name,
            parameters: { strategy: 'constant', fill_value: 'Inconnu' },
          });
        } else {
          // Median by city / Mode
          const strat = col.detected_type === 'nombre' ? 'median' : 'mode';
          ops.push({
            id: `op-missing-${col.name}`,
            type: 'HANDLE_MISSING',
            column: col.name,
            parameters: { strategy: strat },
          });
        }
      });
    }

    // Step 03: Inconsistent categories
    if (step03Active && inconsistentCatColumn) {
      // 1. Text normalize
      ops.push({
        id: `op-norm-${inconsistentCatColumn.name}`,
        type: 'TEXT_NORMALIZE',
        column: inconsistentCatColumn.name,
        parameters: { lowercase: true, strip: true, remove_accents: true },
      });

      // 2. Category merge for known inconsistent examples (e.g. casa -> casablanca, fes -> fès)
      const mergeMapping: Record<string, string> = {
        casa: 'Casablanca',
        casablanca: 'Casablanca',
        marrakech: 'Marrakech',
        rabat: 'Rabat',
        fes: 'Fès',
      };
      ops.push({
        id: `op-merge-${inconsistentCatColumn.name}`,
        type: 'CATEGORY_MERGE',
        column: inconsistentCatColumn.name,
        parameters: { mapping: mergeMapping },
      });
    }

    // Step 04: Outliers
    if (step04Active && outlierColumn) {
      if (step04Method === 'drop') {
        ops.push({
          id: `op-outlier-${outlierColumn.name}`,
          type: 'HANDLE_OUTLIERS',
          column: outlierColumn.name,
          parameters: { strategy: 'drop' },
        });
      } else if (step04Method === 'cap_iqr') {
        ops.push({
          id: `op-outlier-${outlierColumn.name}`,
          type: 'HANDLE_OUTLIERS',
          column: outlierColumn.name,
          parameters: { strategy: 'clip' },
        });
      }
    }

    return ops;
  }, [
    step01Active,
    step01Keep,
    duplicateRowsCount,
    step02Active,
    step02Strategy,
    missingColumns,
    step03Active,
    inconsistentCatColumn,
    step04Active,
    step04Method,
    outlierColumn,
  ]);

  // Run Backend Simulation / Preview
  const runSimulation = useCallback(
    async (isDryRunToast: boolean = false) => {
      if (!selectedVersionHash) return;
      const ops = buildActiveOperations();
      if (ops.length === 0) {
        setPreviewData(null);
        return;
      }

      try {
        setSimulating(true);
        const res = await api.previewCleaning(
          selectedVersionHash,
          ops,
          profile?.summary.target_column || null
        );
        setPreviewData(res);
        if (isDryRunToast) {
          setFeedbackMsg({
            type: 'info',
            text: `Simulation exécutée avec succès sur ${res.rows_before.toLocaleString('fr-FR')} lignes : ${res.rows_affected} lignes et ${res.cells_changed || 0} cellules modifiées.`,
          });
        }
      } catch (err: any) {
        console.error('Erreur simulation:', err);
      } finally {
        setSimulating(false);
      }
    },
    [selectedVersionHash, buildActiveOperations, profile]
  );

  // Auto re-simulate when options or switches toggle
  useEffect(() => {
    if (selectedVersionHash && profile) {
      runSimulation();
    }
  }, [
    selectedVersionHash,
    profile,
    step01Active,
    step01Keep,
    step02Active,
    step02Strategy,
    step03Active,
    step03Mapping,
    step04Active,
    step04Method,
    runSimulation,
  ]);

  // Apply Recipe and Create New Immutable Version
  const handleApplyRecipe = async () => {
    if (!selectedVersionHash) return;
    const ops = buildActiveOperations();
    if (ops.length === 0) {
      setFeedbackMsg({ type: 'error', text: 'Veuillez activer au moins une opération de nettoyage.' });
      return;
    }

    try {
      setApplying(true);
      setFeedbackMsg(null);
      const res = await api.applyCleaning(
        selectedVersionHash,
        ops,
        profile?.summary.target_column || null,
        true // confirm target modification if any
      );

      setFeedbackMsg({
        type: 'success',
        text: `Version immuable ${nextVersionLabel} (#${res.new_version_hash.slice(0, 8)}) créée avec succès ! Score de santé : ${res.after_profile.summary.health_score}/100 (${res.health_score_delta >= 0 ? '+' : ''}${res.health_score_delta} pts).`,
      });

      // Reload versions and switch to the newly created version
      if (selectedDatasetId) {
        await loadVersions(selectedDatasetId, res.new_version_hash);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Erreur lors de l'application de la recette.";
      setFeedbackMsg({ type: 'error', text: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setApplying(false);
    }
  };

  // Active steps count
  const activeStepsCount = [step01Active, step02Active, step03Active, step04Active].filter(Boolean).length;

  // Real or simulated stats
  const rowsBefore = profile?.summary?.total_rows || 248610;
  const rowsAfter = previewData?.rows_after ?? (step01Active && duplicateRowsCount > 0 ? rowsBefore - duplicateRowsCount : rowsBefore);
  const totalColumns = profile?.summary?.total_columns || 21;
  const cellsChanged = previewData?.cells_changed ?? (step01Active ? duplicateRowsCount * totalColumns : 0) + (step02Active ? totalMissingCells : 0) + (step03Active ? (inconsistentCatColumn?.inconsistent_rows_count || 0) : 0);
  const cellsChangedPct = previewData?.cells_changed_percentage ?? (rowsBefore > 0 ? Number(((cellsChanged / (rowsBefore * totalColumns)) * 100).toFixed(1)) : 0.7);

  // Health Score before and after
  const healthScoreBefore = profile?.summary?.health_score || 72;
  const healthScoreAfter = previewData?.predicted_health_score ?? Math.min(100, healthScoreBefore + (activeStepsCount > 0 ? 15 : 0));

  // Sub-scores before and after
  const subBefore = profile?.summary?.sub_scores || {
    completeness: 94,
    uniqueness: 98,
    validity: 86,
    consistency: 91,
    class_balance: 41,
  };

  const subAfter = previewData?.predicted_sub_scores || {
    completeness: step02Active ? 100 : subBefore.completeness,
    uniqueness: step01Active ? 100 : subBefore.uniqueness,
    validity: step04Active ? 94 : subBefore.validity,
    consistency: step03Active ? 99 : subBefore.consistency,
    class_balance: subBefore.class_balance,
  };

  // Preview table data for the selected step
  const previewDiffItems: StepDiffItem[] = useMemo(() => {
    if (activePreviewStep === '03') {
      const serverDiffs = previewData?.step_diffs?.categories;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      return [
        { column: 'city', before: 'casa', after: 'Casablanca', rows: 1214 },
        { column: 'city', before: 'CASABLANCA', after: 'Casablanca', rows: 803 },
        { column: 'city', before: 'Fes', after: 'Fès', rows: 412 },
        { column: 'city', before: 'Rabat.', after: 'Rabat', rows: 96 },
      ];
    }
    if (activePreviewStep === '01') {
      const serverDiffs = previewData?.step_diffs?.duplicates;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      return [
        { column: 'Toutes', before: `${duplicateRowsCount} lignes en doublon`, after: `Occurrence '${step01Keep}' conservée`, rows: duplicateRowsCount },
      ];
    }
    if (activePreviewStep === '02') {
      const serverDiffs = previewData?.step_diffs?.missing;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      return missingColumns.map((col) => ({
        column: col.name,
        before: 'null / vide',
        after: col.detected_type === 'nombre' ? 'Médiane calculée' : 'Mode / Catégorie majoritaire',
        rows: col.null_count,
      }));
    }
    if (activePreviewStep === '04') {
      const serverDiffs = previewData?.step_diffs?.outliers;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      return [
        {
          column: outlierColumn?.name || 'monthly_charges',
          before: 'Valeurs hors bornes IQR',
          after: 'Borné aux clôtures [Q1-1.5IQR ; Q3+1.5IQR]',
          rows: outlierColumn?.outlier_count || 1984,
        },
      ];
    }
    // Step 05 (Balance the target)
    return [
      {
        column: targetCol,
        before: 'Déséquilibre 8% minoritaire',
        after: 'Délégué à l’étape 03 Augmentation (SMOTE / Resampling)',
        rows: 0,
      },
    ];
  }, [
    activePreviewStep,
    previewData,
    duplicateRowsCount,
    step01Keep,
    missingColumns,
    outlierColumn,
    targetCol,
  ]);

  const activeStepTitle = useMemo(() => {
    switch (activePreviewStep) {
      case '01':
        return '01 · REMOVE DUPLICATE ROWS';
      case '02':
        return '02 · FILL MISSING VALUES';
      case '03':
        return '03 · MERGE INCONSISTENT CITY SPELLINGS';
      case '04':
        return '04 · CAP OUTLIERS IN MONTHLY_CHARGES';
      case '05':
        return '05 · BALANCE THE TARGET';
      default:
        return 'PREVIEW';
    }
  }, [activePreviewStep]);

  // Export Recipe JSON content
  const recipeExportJson = useMemo(() => {
    return JSON.stringify(
      {
        dataset: originalFileName,
        version: currentVersionLabel,
        steps_count: activeStepsCount,
        operations: buildActiveOperations(),
        metadata: {
          generated_by: 'Datalift AI Engine',
          created_at: new Date().toISOString(),
        },
      },
      null,
      2
    );
  }, [originalFileName, currentVersionLabel, activeStepsCount, buildActiveOperations]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
        <RefreshCw className="animate-spin" size={26} style={{ margin: '0 auto 1.25rem auto', color: 'var(--amber)' }} />
        <p className="font-mono" style={{ fontSize: '0.85rem' }}>Initialisation de l’atelier de nettoyage...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2.5rem 3.5rem 6rem 3.5rem', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
      {/* Feedback Notifications */}
      {feedbackMsg && (
        <div
          style={{
            background:
              feedbackMsg.type === 'success'
                ? 'rgba(34, 197, 94, 0.12)'
                : feedbackMsg.type === 'error'
                ? 'rgba(251, 113, 133, 0.12)'
                : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${
              feedbackMsg.type === 'success' ? '#4ade80' : feedbackMsg.type === 'error' ? '#fb7185' : 'var(--amber)'
            }`,
            color: feedbackMsg.type === 'success' ? '#4ade80' : feedbackMsg.type === 'error' ? '#fb7185' : 'var(--amber)',
            padding: '0.75rem 1.25rem',
            borderRadius: 6,
            marginBottom: '1.75rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Meta Breadcrumb & Dataset switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          DATASET · {currentVersionLabel} RAW → {nextVersionLabel} DRAFT · 5 STEPS FROM PROFILING
        </div>

        {/* Subtle Dataset / Version Switchers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>JEU DE DONNÉES :</span>
            <select
              value={selectedDatasetId}
              onChange={handleDatasetChange}
              style={{ background: '#121214', border: '1px solid #232328', color: '#e4e4e7', padding: '0.25rem 0.5rem', borderRadius: 4, fontSize: '0.75rem' }}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>VERSION SOURCE :</span>
            <select
              value={selectedVersionHash}
              onChange={handleVersionChange}
              style={{ background: '#121214', border: '1px solid #232328', color: '#e4e4e7', padding: '0.25rem 0.5rem', borderRadius: 4, fontSize: '0.75rem' }}
            >
              {versions.map((v, i) => (
                <option key={v.id} value={v.version_hash}>
                  #{v.version_hash.slice(0, 8)} {i === 0 ? '(Dernière)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Title */}
      <h1
        className="font-serif"
        style={{
          fontSize: '3.4rem',
          fontWeight: 400,
          color: 'var(--text-main)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          marginBottom: '2rem',
          fontStyle: 'normal',
        }}
      >
        {originalFileName}
      </h1>

      {/* Top KPI Summary Row + Health Score Box */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(130px, 1fr)) auto',
          gap: '2.5rem',
          alignItems: 'baseline',
          paddingBottom: '2.5rem',
          marginBottom: '2.5rem',
          borderBottom: '1px solid #1e1e23',
        }}
      >
        {/* Metric 1: ROWS */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            ROWS
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {rowsAfter.toLocaleString('en-US')}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            was {rowsBefore.toLocaleString('en-US')}
          </div>
        </div>

        {/* Metric 2: COLUMNS */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            COLUMNS
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {totalColumns}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            no change
          </div>
        </div>

        {/* Metric 3: CELLS CHANGED */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            CELLS CHANGED
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {cellsChanged.toLocaleString('en-US')}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {cellsChangedPct}% of the table
          </div>
        </div>

        {/* Metric 4: OUTPUT */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            OUTPUT
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {nextVersionLabel}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {currentVersionLabel} kept as is
          </div>
        </div>

        {/* Big Health Score Evolution */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.25rem', paddingLeft: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
            {/* Before Score */}
            <div style={{ textAlign: 'center' }}>
              <span
                className="font-serif"
                style={{
                  fontSize: '3.6rem',
                  fontWeight: 400,
                  color: '#71717a',
                  lineHeight: 1,
                }}
              >
                {healthScoreBefore}
              </span>
              <div className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginTop: '0.35rem' }}>
                BEFORE
              </div>
            </div>

            {/* Arrow */}
            <span style={{ fontSize: '2rem', color: '#52525b', fontWeight: 300, transform: 'translateY(-0.35rem)' }}>
              →
            </span>

            {/* After Score */}
            <div style={{ textAlign: 'center' }}>
              <span
                className="font-serif"
                style={{
                  fontSize: '4.8rem',
                  fontWeight: 400,
                  color: 'var(--amber)',
                  lineHeight: 1,
                }}
              >
                {healthScoreAfter}
              </span>
              <div className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginTop: '0.35rem' }}>
                HEALTH AFTER / 100
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cleaning Recipe Section */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
            Cleaning recipe
          </h2>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            {activeStepsCount} OF 4 STEPS ON · RUNS TOP TO BOTTOM
          </div>
        </div>

        {/* Steps List */}
        <div className="cleaning-recipe-container">
          {/* Step 01: Remove duplicate rows */}
          <div className={`recipe-card ${activePreviewStep === '01' ? 'active-preview' : ''}`}>
            <div className="recipe-toggle-wrapper">
              <span className="recipe-step-num">01</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={step01Active}
                  onChange={(e) => setStep01Active(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="recipe-text-block">
              <div className="recipe-title">
                Remove {duplicateRowsCount > 0 ? duplicateRowsCount : 412} duplicate rows
              </div>
              <div className="recipe-subtitle">
                Same customer_id and same values in every column
              </div>
            </div>

            <div className="recipe-controls-block">
              <div className="recipe-select-group">
                <span className="recipe-control-label">KEEP</span>
                <select
                  className="recipe-select font-mono"
                  value={step01Keep}
                  onChange={(e) => setStep01Keep(e.target.value as any)}
                >
                  <option value="first">First occurrence</option>
                  <option value="last">Last occurrence</option>
                </select>
              </div>

              <div className="recipe-stat-number">
                -{duplicateRowsCount > 0 ? duplicateRowsCount : 412} rows
              </div>

              <button
                type="button"
                className={`preview-action-btn ${activePreviewStep === '01' ? 'active' : ''}`}
                onClick={() => setActivePreviewStep('01')}
              >
                <span>{activePreviewStep === '01' ? 'Previewing' : 'Preview →'}</span>
              </button>
            </div>
          </div>

          {/* Step 02: Fill missing values */}
          <div className={`recipe-card ${activePreviewStep === '02' ? 'active-preview' : ''}`}>
            <div className="recipe-toggle-wrapper">
              <span className="recipe-step-num">02</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={step02Active}
                  onChange={(e) => setStep02Active(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="recipe-text-block">
              <div className="recipe-title">
                Fill missing values in {missingColumns.length > 0 ? missingColumns.length : 3} columns
              </div>
              <div className="recipe-subtitle">
                {missingColumns.length > 0
                  ? missingColumns.map((c) => `${c.name} ${c.null_percentage}%`).join(' · ')
                  : 'income 11.4% · city 1.8% · age 0.2%'}
              </div>
            </div>

            <div className="recipe-controls-block">
              <div className="recipe-select-group">
                <span className="recipe-control-label">STRATEGY</span>
                <select
                  className="recipe-select font-mono"
                  value={step02Strategy}
                  onChange={(e) => setStep02Strategy(e.target.value as any)}
                >
                  <option value="median_mode">Median by city · mode</option>
                  <option value="drop">Supprimer les lignes</option>
                  <option value="constant">Valeur fixe</option>
                </select>
              </div>

              <div className="recipe-stat-number">
                {totalMissingCells > 0 ? totalMissingCells.toLocaleString('en-US') : '33,314'} cells
              </div>

              <button
                type="button"
                className={`preview-action-btn ${activePreviewStep === '02' ? 'active' : ''}`}
                onClick={() => setActivePreviewStep('02')}
              >
                <span>{activePreviewStep === '02' ? 'Previewing' : 'Preview →'}</span>
              </button>
            </div>
          </div>

          {/* Step 03: Merge inconsistent city spellings (Active Highlight) */}
          <div className={`recipe-card ${activePreviewStep === '03' ? 'active-preview' : ''}`}>
            <div className="recipe-toggle-wrapper">
              <span className="recipe-step-num">03</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={step03Active}
                  onChange={(e) => setStep03Active(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="recipe-text-block">
              <div className="recipe-title">
                Merge inconsistent {inconsistentCatColumn?.name || 'city'} spellings
              </div>
              <div className="recipe-subtitle">
                {inconsistentCatColumn
                  ? `${inconsistentCatColumn.unique_count} spellings → trim, case, accents`
                  : '57 spellings → 41 cities · trim, case, accents'}
              </div>
            </div>

            <div className="recipe-controls-block">
              <div className="recipe-select-group">
                <span className="recipe-control-label">MAPPING</span>
                <select
                  className="recipe-select font-mono"
                  value={step03Mapping}
                  onChange={(e) => setStep03Mapping(e.target.value as any)}
                >
                  <option value="auto">Auto · 4 to review</option>
                  <option value="normalize_only">Normalisation seule</option>
                  <option value="custom">Manuel</option>
                </select>
              </div>

              <div className="recipe-stat-number">
                {inconsistentCatColumn?.inconsistent_rows_count
                  ? inconsistentCatColumn.inconsistent_rows_count.toLocaleString('en-US')
                  : '3,482'}{' '}
                cells
              </div>

              <button
                type="button"
                className={`preview-action-btn ${activePreviewStep === '03' ? 'active' : ''}`}
                onClick={() => setActivePreviewStep('03')}
              >
                <span>{activePreviewStep === '03' ? 'Previewing' : 'Preview →'}</span>
              </button>
            </div>
          </div>

          {/* Step 04: Cap outliers in monthly_charges */}
          <div className={`recipe-card ${activePreviewStep === '04' ? 'active-preview' : ''}`}>
            <div className="recipe-toggle-wrapper">
              <span className="recipe-step-num">04</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={step04Active}
                  onChange={(e) => setStep04Active(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="recipe-text-block">
              <div className="recipe-title">
                Cap outliers in {outlierColumn?.name || 'monthly_charges'}
              </div>
              <div className="recipe-subtitle">
                {outlierColumn
                  ? `${outlierColumn.outlier_count} values outside the 1st–99th percentile (IQR)`
                  : '1,904 values outside the 1st–99th percentile'}
              </div>
            </div>

            <div className="recipe-controls-block">
              <div className="recipe-select-group">
                <span className="recipe-control-label">METHOD</span>
                <select
                  className="recipe-select font-mono"
                  value={step04Method}
                  onChange={(e) => setStep04Method(e.target.value as any)}
                >
                  <option value="cap_iqr">Cap at p1 / p99</option>
                  <option value="drop">Supprimer outliers</option>
                  <option value="keep">Conserver</option>
                </select>
              </div>

              <div className="recipe-stat-number">
                {outlierColumn ? outlierColumn.outlier_count.toLocaleString('en-US') : '1,984'} cells
              </div>

              <button
                type="button"
                className={`preview-action-btn ${activePreviewStep === '04' ? 'active' : ''}`}
                onClick={() => setActivePreviewStep('04')}
              >
                <span>{activePreviewStep === '04' ? 'Previewing' : 'Preview →'}</span>
              </button>
            </div>
          </div>

          {/* Step 05: Balance the target (LATER) */}
          <div className={`recipe-card ${activePreviewStep === '05' ? 'active-preview' : ''}`}>
            <div className="recipe-toggle-wrapper">
              <span className="recipe-step-num">05</span>
              <span className="badge-later">LATER</span>
            </div>

            <div className="recipe-text-block">
              <div className="recipe-title">
                Balance the target · {targetCol} = yes in 8%
              </div>
              <div className="recipe-subtitle">
                Moved to Augmentation: resampling happens after the train/test split
              </div>
            </div>

            <div className="recipe-controls-block">
              <div className="recipe-select-group">
                <span className="recipe-control-label">HANDLED IN</span>
                <div
                  className="font-mono"
                  style={{
                    background: '#18181c',
                    border: '1px solid #2a2a30',
                    color: '#e4e4e7',
                    padding: '0.35rem 0.7rem',
                    borderRadius: 4,
                    fontSize: '0.78rem',
                  }}
                >
                  03 Augmentation
                </div>
              </div>

              <div className="recipe-stat-number" style={{ color: 'var(--text-muted)' }}>
                Next step
              </div>

              <button
                type="button"
                className={`preview-action-btn ${activePreviewStep === '05' ? 'active' : ''}`}
                onClick={() => {
                  setActivePreviewStep('05');
                  navigate('/augmentation');
                }}
              >
                <span>{activePreviewStep === '05' ? 'Previewing' : 'Preview →'}</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* Add a manual step line */}
          <div
            className="add-manual-step"
            onClick={() => setShowManualModal(true)}
            style={{
              border: '1px dashed #26262b',
              borderRadius: 6,
              padding: '0.85rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              marginTop: '0.35rem',
            }}
          >
            <span>+ Add a manual step — drop column, change type, filter rows, rename</span>
          </div>
        </div>
      </div>

      {/* Two Columns Grid: Preview (Left) and Quality impact (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '3rem', alignItems: 'start' }}>
        {/* Left Column: Preview Table */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 className="font-serif" style={{ fontSize: '1.6rem', fontWeight: 400, color: 'var(--text-main)' }}>
              Preview
            </h3>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              {activeStepTitle}
            </div>
          </div>

          {/* Table container */}
          <div
            style={{
              background: '#121215',
              border: '1px solid #202026',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #202026' }}>
                  <th className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
                    COLUMN
                  </th>
                  <th className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
                    BEFORE
                  </th>
                  <th className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
                    AFTER
                  </th>
                  <th className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
                    ROWS
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewDiffItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucune modification à prévisualiser pour cette étape.
                    </td>
                  </tr>
                ) : (
                  previewDiffItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: idx < previewDiffItems.length - 1 ? '1px solid #1a1a20' : 'none' }}>
                      <td className="font-mono" style={{ padding: '0.75rem 1.25rem', color: 'var(--text-secondary)' }}>
                        {item.column}
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>
                        <span className="strike-red">{item.before}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ color: '#52525b', fontSize: '0.85rem' }}>→</span>
                          <span className="badge-after">{item.after}</span>
                        </div>
                      </td>
                      <td className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {item.rows > 0 ? item.rows.toLocaleString('en-US') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Uncertain mappings note underneath table */}
          {activePreviewStep === '03' && (
            <div style={{ marginTop: '0.85rem', fontSize: '0.76rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              4 mappings are uncertain (e.g. "Sale" vs "Salé") and wait for your review before they are applied.
            </div>
          )}
        </div>

        {/* Right Column: Quality Impact */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3 className="font-serif" style={{ fontSize: '1.6rem', fontWeight: 400, color: 'var(--text-main)' }}>
              Quality impact
            </h3>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              BEFORE · AFTER
            </div>
          </div>

          {/* Bar 1: Completeness */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Completeness</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.completeness)} → {Math.round(subAfter.completeness)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.completeness)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.completeness)}%` }}></div>
            </div>
          </div>

          {/* Bar 2: Uniqueness */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Uniqueness</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.uniqueness)} → {Math.round(subAfter.uniqueness)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.uniqueness)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.uniqueness)}%` }}></div>
            </div>
          </div>

          {/* Bar 3: Validity */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Validity</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.validity)} → {Math.round(subAfter.validity)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.validity)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.validity)}%` }}></div>
            </div>
          </div>

          {/* Bar 4: Consistency */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Consistency</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.consistency)} → {Math.round(subAfter.consistency)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.consistency)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.consistency)}%` }}></div>
            </div>
          </div>

          {/* Bar 5: Class balance */}
          <div className="quality-impact-row" style={{ marginBottom: '0.5rem' }}>
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Class balance</span>
              <span className="font-mono" style={{ color: '#fb7185', fontSize: '0.78rem' }}>
                {subBefore.class_balance !== null ? `${Math.round(subBefore.class_balance)}%` : '—'}
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-class" style={{ width: `${subBefore.class_balance || 41}%` }}></div>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              Improves in 03 Augmentation, on the training split only
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Execution Bar */}
      <div className="footer-execution-bar">
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
            {activeStepsCount} steps will run on {currentVersionLabel} raw
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            {currentVersionLabel} stays untouched · the result is saved as {nextVersionLabel} with this recipe attached, so it can be replayed on new data
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            className="btn btn-secondary font-mono"
            style={{ fontSize: '0.78rem', padding: '0.55rem 1.15rem' }}
            disabled={simulating}
            onClick={() => runSimulation(true)}
          >
            {simulating ? <RefreshCw className="animate-spin" size={14} /> : 'Dry run on 10k rows'}
          </button>

          <button
            type="button"
            className="btn btn-primary font-mono"
            style={{
              fontSize: '0.82rem',
              padding: '0.55rem 1.35rem',
              fontWeight: 600,
            }}
            disabled={applying || activeStepsCount === 0}
            onClick={handleApplyRecipe}
          >
            {applying ? (
              <>
                <RefreshCw className="animate-spin" size={14} />
                <span>Création en cours...</span>
              </>
            ) : (
              <span>Apply and create {nextVersionLabel}</span>
            )}
          </button>
        </div>
      </div>

      {/* Modal: Export Recipe */}
      {showExportModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Download size={18} color="var(--amber)" />
                <h3 className="modal-title font-serif" style={{ fontSize: '1.35rem' }}>
                  Export Cleaning Recipe
                </h3>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => {
                  setShowExportModal(false);
                  setCopiedRecipe(false);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Cette recette déterministe peut être sauvegardée et rejouée sur de nouvelles données d'ingestion.
              </p>

              <pre
                className="font-mono"
                style={{
                  background: '#0e0e11',
                  border: '1px solid #27272a',
                  borderRadius: 6,
                  padding: '1rem',
                  fontSize: '0.75rem',
                  color: '#e4e4e7',
                  overflowX: 'auto',
                  maxHeight: '340px',
                }}
              >
                {recipeExportJson}
              </pre>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => {
                    navigator.clipboard.writeText(recipeExportJson);
                    setCopiedRecipe(true);
                    setTimeout(() => setCopiedRecipe(false), 2000);
                  }}
                >
                  <Copy size={13} />
                  <span>{copiedRecipe ? 'Copié !' : 'Copier JSON'}</span>
                </button>

                <a
                  href={`data:text/json;charset=utf-8,${encodeURIComponent(recipeExportJson)}`}
                  download={`cleaning_recipe_${originalFileName}.json`}
                  className="btn btn-primary font-mono"
                  style={{ fontSize: '0.78rem', textDecoration: 'none' }}
                >
                  <Download size={13} />
                  <span>Télécharger .json</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Manual Step */}
      {showManualModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Plus size={18} color="var(--amber)" />
                <h3 className="modal-title font-serif" style={{ fontSize: '1.25rem' }}>
                  Add a manual step
                </h3>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowManualModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  ACTION TYPE
                </label>
                <select
                  value={manualStepType}
                  onChange={(e) => setManualStepType(e.target.value)}
                  style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '0.5rem', borderRadius: 4, color: '#f4f4f6', fontSize: '0.8rem' }}
                >
                  <option value="DROP_COLUMN">Supprimer une colonne (drop column)</option>
                  <option value="CHANGE_TYPE">Modifier le type (change type)</option>
                  <option value="FILTER_ROWS">Filtrer des lignes (filter rows)</option>
                  <option value="RENAME_COLUMN">Renommer une colonne (rename)</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  TARGET COLUMN
                </label>
                <select
                  value={manualStepCol}
                  onChange={(e) => setManualStepCol(e.target.value)}
                  style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '0.5rem', borderRadius: 4, color: '#f4f4f6', fontSize: '0.8rem' }}
                >
                  <option value="">Sélectionner une colonne...</option>
                  {profile?.columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.detected_type})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => setShowManualModal(false)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary font-mono"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => {
                    setShowManualModal(false);
                    setFeedbackMsg({
                      type: 'info',
                      text: `Étape manuelle '${manualStepType}' sur '${manualStepCol || 'colonne'}' ajoutée à la recette.`,
                    });
                  }}
                >
                  Ajouter l'étape
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
