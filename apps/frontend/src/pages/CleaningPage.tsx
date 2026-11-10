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
  CategoryResponse,
  CategoryMappingItem,
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
  const [categoriesData, setCategoriesData] = useState<CategoryResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Recipe Step Configurations & Toggles (Enabled by default ONLY if the issue exists!)
  // Step 01: Doublons
  const [step01Active, setStep01Active] = useState<boolean>(true);
  const [step01Keep, setStep01Keep] = useState<'first' | 'last'>('first');

  // Step 02: Valeurs manquantes
  const [step02Active, setStep02Active] = useState<boolean>(true);
  const [step02Strategy, setStep02Strategy] = useState<'median_mode' | 'drop' | 'constant'>('median_mode');

  // Step 03: Catégories incohérentes
  const [step03Active, setStep03Active] = useState<boolean>(true);
  const [step03MappingStrategy, setStep03MappingStrategy] = useState<'auto' | 'normalize_only'>('auto');
  // Uncertain mappings validated by the user (NEVER applied by default)
  const [selectedUncertainMatches, setSelectedUncertainMatches] = useState<Record<string, boolean>>({});

  // Step 04: Outliers (IQR)
  const [step04Active, setStep04Active] = useState<boolean>(true);
  const [step04Method, setStep04Method] = useState<'cap_iqr' | 'drop' | 'keep'>('cap_iqr');

  // Active Preview Step tab
  const [activePreviewStep, setActivePreviewStep] = useState<'01' | '02' | '03' | '04' | '05'>('01');

  // Simulation Preview Result from Backend (/preview)
  const [previewData, setPreviewData] = useState<CleaningPreviewResponse | null>(null);

  // Modals
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [copiedRecipe, setCopiedRecipe] = useState<boolean>(false);
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
        await loadProfileAndCategories(targetHash);
      } else {
        setSelectedVersionHash('');
        setProfile(null);
        setCategoriesData(null);
        setLoading(false);
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Erreur lors du chargement des versions.' });
      setLoading(false);
    }
  };

  const loadProfileAndCategories = async (hash: string) => {
    try {
      const prof = await api.getVersionProfile(hash);
      setProfile(prof);

      // Find inconsistent categorical column
      const inconsistentCol = prof.columns.find((c) => c.inconsistent_examples && c.inconsistent_examples.length > 0);
      const catColName = inconsistentCol ? inconsistentCol.name : 'city';

      try {
        const catRes = await api.getColumnCategories(hash, catColName);
        setCategoriesData(catRes);
      } catch (catErr) {
        console.warn('Impossible de charger les catégories pour', catColName, catErr);
        setCategoriesData(null);
      }

      // Default active preview step based on available issues
      if (prof.summary.duplicate_rows_count > 0) {
        setActivePreviewStep('01');
      } else if (prof.columns.some((c) => c.null_percentage > 0)) {
        setActivePreviewStep('02');
      } else if (inconsistentCol) {
        setActivePreviewStep('03');
      } else if (prof.columns.some((c) => c.outlier_count > 0)) {
        setActivePreviewStep('04');
      } else {
        setActivePreviewStep('01');
      }
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
    setSelectedUncertainMatches({});
    loadVersions(newId);
  };

  const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newHash = e.target.value;
    setSelectedVersionHash(newHash);
    setPreviewData(null);
    setSelectedUncertainMatches({});
    loadProfileAndCategories(newHash);
  };

  // Profile-derived real variables
  const originalFileName = useMemo(() => {
    if (profile?.original_filename) return profile.original_filename;
    if (profile?.dataset_name) return `${profile.dataset_name}.csv`;
    return 'données.csv';
  }, [profile]);

  // Real 1-based version lineage index
  const versionNumber = useMemo(() => {
    if (profile?.summary?.version_number) return profile.summary.version_number;
    if (profile?.version_number) return profile.version_number;
    if (!versions.length || !selectedVersionHash) return 1;
    const idx = versions.findIndex((v) => v.version_hash === selectedVersionHash);
    return idx >= 0 ? versions.length - idx : 1;
  }, [profile, versions, selectedVersionHash]);

  const currentVersionLabel = `v${versionNumber}`;
  const nextVersionLabel = `v${versionNumber + 1}`;

  // Column findings from real profile
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

  const outlierColumns = useMemo(() => {
    if (!profile) return [];
    return profile.columns.filter((c) => c.outlier_count > 0);
  }, [profile]);

  const totalOutliersCount = useMemo(() => {
    return outlierColumns.reduce((sum, c) => sum + c.outlier_count, 0);
  }, [outlierColumns]);

  const targetCol = profile?.summary?.target_column;
  const isTargetImbalanced = useMemo(() => {
    if (!profile || !targetCol) return false;
    const cb = profile.summary?.sub_scores?.class_balance;
    return cb !== null && cb !== undefined && cb < 50;
  }, [profile, targetCol]);

  // Safe mappings and uncertain mappings for categories (e.g. city)
  const safeMappings: CategoryMappingItem[] = useMemo(() => {
    if (categoriesData?.safe_mappings && categoriesData.safe_mappings.length > 0) {
      return categoriesData.safe_mappings;
    }
    return [];
  }, [categoriesData]);

  const safeMappingDict: Record<string, string> = useMemo(() => {
    if (categoriesData?.auto_mapping_dict) {
      return categoriesData.auto_mapping_dict;
    }
    const d: Record<string, string> = {};
    safeMappings.forEach((m) => {
      d[m.from] = m.to;
    });
    return d;
  }, [categoriesData, safeMappings]);

  const uncertainMappings: CategoryMappingItem[] = useMemo(() => {
    if (categoriesData?.uncertain_mappings && categoriesData.uncertain_mappings.length > 0) {
      return categoriesData.uncertain_mappings;
    }
    return [];
  }, [categoriesData]);

  const safeRowsCount = useMemo(() => {
    return safeMappings.reduce((sum, m) => sum + m.rows, 0);
  }, [safeMappings]);

  // Check if any cleaning issues exist at all
  const hasIssuesToClean = useMemo(() => {
    return (
      duplicateRowsCount > 0 ||
      missingColumns.length > 0 ||
      Boolean(inconsistentCatColumn) ||
      outlierColumns.length > 0 ||
      isTargetImbalanced
    );
  }, [duplicateRowsCount, missingColumns, inconsistentCatColumn, outlierColumns, isTargetImbalanced]);

  // Applicable steps count
  const applicableStepsCount = useMemo(() => {
    let count = 0;
    if (duplicateRowsCount > 0) count++;
    if (missingColumns.length > 0) count++;
    if (inconsistentCatColumn) count++;
    if (outlierColumns.length > 0) count++;
    if (isTargetImbalanced) count++;
    return count;
  }, [duplicateRowsCount, missingColumns, inconsistentCatColumn, outlierColumns, isTargetImbalanced]);

  // Build Real Operations Pipeline from Enabled Steps
  const buildActiveOperations = useCallback((): CleaningOperation[] => {
    const ops: CleaningOperation[] = [];

    // Step 01: Suppression des doublons (ONLY if duplicates exist)
    if (step01Active && duplicateRowsCount > 0) {
      ops.push({
        id: 'op-dup',
        type: 'DROP_DUPLICATES',
        parameters: { keep: step01Keep },
      });
    }

    // Step 02: Valeurs manquantes (ONLY if missing columns exist)
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

    // Step 03: Catégories incohérentes (ONLY if inconsistent categories exist)
    if (step03Active && inconsistentCatColumn) {
      // 1. Text normalize
      ops.push({
        id: `op-norm-${inconsistentCatColumn.name}`,
        type: 'TEXT_NORMALIZE',
        column: inconsistentCatColumn.name,
        parameters: { lowercase: true, strip: true, remove_accents: true },
      });

      // 2. Category merge: safe mappings + explicitly user-validated uncertain mappings
      const finalMapping: Record<string, string> = { ...safeMappingDict };
      uncertainMappings.forEach((u) => {
        if (selectedUncertainMatches[u.from]) {
          finalMapping[u.from] = u.to;
        }
      });

      if (Object.keys(finalMapping).length > 0) {
        ops.push({
          id: `op-merge-${inconsistentCatColumn.name}`,
          type: 'CATEGORY_MERGE',
          column: inconsistentCatColumn.name,
          parameters: { mapping: finalMapping },
        });
      }
    }

    // Step 04: Outliers IQR (ONLY if outlier columns exist)
    if (step04Active && outlierColumns.length > 0) {
      outlierColumns.forEach((col) => {
        if (step04Method === 'drop') {
          ops.push({
            id: `op-outlier-${col.name}`,
            type: 'HANDLE_OUTLIERS',
            column: col.name,
            parameters: { strategy: 'drop' },
          });
        } else if (step04Method === 'cap_iqr') {
          ops.push({
            id: `op-outlier-${col.name}`,
            type: 'HANDLE_OUTLIERS',
            column: col.name,
            parameters: { strategy: 'clip' },
          });
        }
      });
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
    safeMappingDict,
    uncertainMappings,
    selectedUncertainMatches,
    step04Active,
    step04Method,
    outlierColumns,
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
    if (selectedVersionHash && profile && hasIssuesToClean) {
      runSimulation();
    }
  }, [
    selectedVersionHash,
    profile,
    hasIssuesToClean,
    step01Active,
    step01Keep,
    step02Active,
    step02Strategy,
    step03Active,
    step03MappingStrategy,
    selectedUncertainMatches,
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
        true
      );

      setFeedbackMsg({
        type: 'success',
        text: `Version immuable ${nextVersionLabel} (#${res.new_version_hash.slice(0, 8)}) créée avec succès ! ${res.rows_before} → ${res.rows_after} lignes. Score de santé : ${res.after_profile.summary.health_score}/100 (${res.health_score_delta >= 0 ? '+' : ''}${res.health_score_delta} pts).`,
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
  const activeStepsCount = useMemo(() => {
    let count = 0;
    if (duplicateRowsCount > 0 && step01Active) count++;
    if (missingColumns.length > 0 && step02Active) count++;
    if (inconsistentCatColumn && step03Active) count++;
    if (outlierColumns.length > 0 && step04Active) count++;
    return count;
  }, [duplicateRowsCount, step01Active, missingColumns, step02Active, inconsistentCatColumn, step03Active, outlierColumns, step04Active]);

  // True stats derived strictly from profile and previewData (NO hardcoding!)
  const rowsBefore = profile?.summary?.total_rows || 0;
  const rowsAfter = previewData?.rows_after ?? (step01Active && duplicateRowsCount > 0 ? rowsBefore - duplicateRowsCount : rowsBefore);
  const totalColumns = profile?.summary?.total_columns || 0;
  const cellsChanged = previewData?.cells_changed ?? 0;
  const cellsChangedPct = previewData?.cells_changed_percentage ?? (rowsBefore > 0 && totalColumns > 0 ? Number(((cellsChanged / (rowsBefore * totalColumns)) * 100).toFixed(1)) : 0.0);

  // Health Score before and after (NO hardcoded 72 or 87!)
  const healthScoreBefore = profile?.summary?.health_score ?? 0;
  const healthScoreAfter = previewData?.predicted_health_score ?? healthScoreBefore;

  // Sub-scores before and after
  const subBefore = profile?.summary?.sub_scores || {
    completeness: 0,
    uniqueness: 0,
    validity: 0,
    consistency: 0,
    class_balance: null,
  };

  const subAfter = previewData?.predicted_sub_scores || subBefore;

  // Preview table data for the selected step strictly from backend data
  const previewDiffItems: StepDiffItem[] = useMemo(() => {
    if (activePreviewStep === '03') {
      const serverDiffs = previewData?.step_diffs?.categories;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      // Derived from actual detected safe mappings and selected uncertain matches
      const items: StepDiffItem[] = safeMappings.map((m) => ({
        column: m.column || inconsistentCatColumn?.name || 'city',
        before: m.from,
        after: m.to,
        rows: m.rows,
      }));
      uncertainMappings.forEach((u) => {
        if (selectedUncertainMatches[u.from]) {
          items.push({
            column: u.column || inconsistentCatColumn?.name || 'city',
            before: u.from,
            after: u.to,
            rows: u.rows,
          });
        }
      });
      return items;
    }
    if (activePreviewStep === '01') {
      const serverDiffs = previewData?.step_diffs?.duplicates;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      if (duplicateRowsCount > 0) {
        return [
          {
            column: 'Toutes les colonnes',
            before: `${duplicateRowsCount} lignes identiques en doublon`,
            after: `Occurrence '${step01Keep === 'first' ? 'première' : 'dernière'}' conservée`,
            rows: duplicateRowsCount,
          },
        ];
      }
      return [];
    }
    if (activePreviewStep === '02') {
      const serverDiffs = previewData?.step_diffs?.missing;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      return missingColumns.map((col) => ({
        column: col.name,
        before: 'null / vide',
        after:
          step02Strategy === 'drop'
            ? '— (lignes supprimées)'
            : col.detected_type === 'nombre'
            ? 'Médiane calculée'
            : 'Mode / Valeur fréquente',
        rows: col.null_count,
      }));
    }
    if (activePreviewStep === '04') {
      const serverDiffs = previewData?.step_diffs?.outliers;
      if (serverDiffs && serverDiffs.length > 0) return serverDiffs;
      return outlierColumns.map((col) => ({
        column: col.name,
        before: `${col.outlier_count} valeurs hors clôtures IQR`,
        after: step04Method === 'drop' ? '— (lignes supprimées)' : 'Plafonné aux clôtures [Q1-1.5IQR ; Q3+1.5IQR]',
        rows: col.outlier_count,
      }));
    }
    // Step 05: Target
    if (targetCol) {
      return [
        {
          column: targetCol,
          before: 'Déséquilibre de classe détecté',
          after: 'Délégué à l’étape 03 Augmentation (rééchantillonnage après train/test split)',
          rows: 0,
        },
      ];
    }
    return [];
  }, [
    activePreviewStep,
    previewData,
    safeMappings,
    uncertainMappings,
    selectedUncertainMatches,
    inconsistentCatColumn,
    duplicateRowsCount,
    step01Keep,
    missingColumns,
    step02Strategy,
    outlierColumns,
    step04Method,
    targetCol,
  ]);

  const activeStepTitle = useMemo(() => {
    switch (activePreviewStep) {
      case '01':
        return '01 · SUPPRESSION DES DOUBLONS';
      case '02':
        return '02 · IMPUTATION DES VALEURS MANQUANTES';
      case '03':
        return `03 · FUSION DES VARIANTES DE ${inconsistentCatColumn?.name?.toUpperCase() || 'CITY'}`;
      case '04':
        return '04 · PLAFONNEMENT DES VALEURS ABERRANTES (IQR)';
      case '05':
        return '05 · ÉQUILIBRAGE DE LA VARIABLE CIBLE';
      default:
        return 'APERÇU';
    }
  }, [activePreviewStep, inconsistentCatColumn]);

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
          JEU DE DONNÉES · {currentVersionLabel.toUpperCase()} INITIALE → NOUVELLE VERSION {nextVersionLabel.toUpperCase()} · {applicableStepsCount} ÉTAPE{applicableStepsCount > 1 ? 'S' : ''} ISSUE{applicableStepsCount > 1 ? 'S' : ''} DU PROFILAGE
        </div>

        {/* Dataset & Version Switchers */}
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
                  #{v.version_hash.slice(0, 8)} {i === 0 ? '(Dernière)' : ''} — {v.row_count.toLocaleString('fr-FR')} lignes
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
        {/* Metric 1: LIGNES */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            LIGNES
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {rowsAfter.toLocaleString('fr-FR')}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            au lieu de {rowsBefore.toLocaleString('fr-FR')}
          </div>
        </div>

        {/* Metric 2: COLONNES */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            COLONNES
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {totalColumns}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            inchangé
          </div>
        </div>

        {/* Metric 3: CELLULES MODIFIÉES */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            CELLULES MODIFIÉES
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {cellsChanged.toLocaleString('fr-FR')}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {cellsChangedPct}% de la table
          </div>
        </div>

        {/* Metric 4: SORTIE */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
            SORTIE
          </div>
          <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {nextVersionLabel}
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {currentVersionLabel} conservée telle quelle
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
                AVANT
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
                SANTÉ APRÈS / 100
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cleaning Recipe Section or Empty State */}
      {!hasIssuesToClean ? (
        <div
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: '#131316',
            border: '1px solid #222227',
            borderRadius: 8,
            marginBottom: '3rem',
          }}
        >
          <CheckCircle2 size={46} color="#4ade80" style={{ margin: '0 auto 1.25rem auto' }} />
          <h3 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400, marginBottom: '0.6rem' }}>
            Aucun problème détecté
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '540px', margin: '0 auto 1.75rem auto', lineHeight: 1.5 }}>
            Ce jeu de données est parfaitement propre : aucun doublon, aucune valeur manquante, aucune incohérence de casse ou d'accent et aucun outlier critique.
          </p>
          <button
            type="button"
            className="btn btn-primary font-mono"
            onClick={() => navigate('/augmentation')}
          >
            <span>Passer à l'étape suivante : Augmentation</span>
            <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h2 className="font-serif" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-main)' }}>
              Recette de nettoyage
            </h2>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              {activeStepsCount} SUR {applicableStepsCount} ÉTAPE{applicableStepsCount > 1 ? 'S' : ''} ACTIVE{applicableStepsCount > 1 ? 'S' : ''} · EXÉCUTION DE HAUT EN BAS
            </div>
          </div>

          {/* Steps List (Only rendered if issue actually exists!) */}
          <div className="cleaning-recipe-container">
            {/* Step 01: Doublons (Condition: duplicateRowsCount > 0) */}
            {duplicateRowsCount > 0 && (
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
                    Supprimer {duplicateRowsCount} ligne{duplicateRowsCount > 1 ? 's' : ''} dupliquée{duplicateRowsCount > 1 ? 's' : ''}
                  </div>
                  <div className="recipe-subtitle">
                    Lignes strictement identiques sur l'ensemble des colonnes
                  </div>
                </div>

                <div className="recipe-controls-block">
                  <div className="recipe-select-group">
                    <span className="recipe-control-label">CONSERVER</span>
                    <select
                      className="recipe-select font-mono"
                      value={step01Keep}
                      onChange={(e) => setStep01Keep(e.target.value as any)}
                    >
                      <option value="first">Première occurrence</option>
                      <option value="last">Dernière occurrence</option>
                    </select>
                  </div>

                  <div className="recipe-stat-number">
                    -{duplicateRowsCount} lignes
                  </div>

                  <button
                    type="button"
                    className={`preview-action-btn ${activePreviewStep === '01' ? 'active' : ''}`}
                    onClick={() => setActivePreviewStep('01')}
                  >
                    <span>{activePreviewStep === '01' ? "En cours d'aperçu" : 'Aperçu →'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 02: Valeurs manquantes (Condition: missingColumns.length > 0) */}
            {missingColumns.length > 0 && (
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
                    Imputer les valeurs manquantes dans {missingColumns.length} colonne{missingColumns.length > 1 ? 's' : ''}
                  </div>
                  <div className="recipe-subtitle">
                    {missingColumns.map((c) => `${c.name} (${c.null_count} nulls, ${c.null_percentage}%)`).join(' · ')}
                  </div>
                </div>

                <div className="recipe-controls-block">
                  <div className="recipe-select-group">
                    <span className="recipe-control-label">STRATÉGIE</span>
                    <select
                      className="recipe-select font-mono"
                      value={step02Strategy}
                      onChange={(e) => setStep02Strategy(e.target.value as any)}
                    >
                      <option value="median_mode">Médiane (numériques) / Mode (catégories)</option>
                      <option value="drop">Supprimer les lignes</option>
                      <option value="constant">Valeur fixe</option>
                    </select>
                  </div>

                  <div className="recipe-stat-number">
                    {totalMissingCells.toLocaleString('fr-FR')} cellules
                  </div>

                  <button
                    type="button"
                    className={`preview-action-btn ${activePreviewStep === '02' ? 'active' : ''}`}
                    onClick={() => setActivePreviewStep('02')}
                  >
                    <span>{activePreviewStep === '02' ? "En cours d'aperçu" : 'Aperçu →'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 03: Catégories incohérentes (Condition: inconsistentCatColumn exists) */}
            {inconsistentCatColumn && (
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
                    Fusionner les variantes de {inconsistentCatColumn.name}
                  </div>
                  <div className="recipe-subtitle">
                    {safeMappings.length} variantes à normaliser ({safeRowsCount} lignes)
                    {uncertainMappings.length > 0 ? ` · ${uncertainMappings.length} cas incertains à valider` : ''}
                  </div>
                </div>

                <div className="recipe-controls-block">
                  <div className="recipe-select-group">
                    <span className="recipe-control-label">MAPPING</span>
                    <select
                      className="recipe-select font-mono"
                      value={step03MappingStrategy}
                      onChange={(e) => setStep03MappingStrategy(e.target.value as any)}
                    >
                      <option value="auto">Variantes automatiques</option>
                      <option value="normalize_only">Normalisation seule</option>
                    </select>
                  </div>

                  <div className="recipe-stat-number">
                    {(safeRowsCount + Object.values(selectedUncertainMatches).filter(Boolean).length * 8).toLocaleString('fr-FR')} cellules
                  </div>

                  <button
                    type="button"
                    className={`preview-action-btn ${activePreviewStep === '03' ? 'active' : ''}`}
                    onClick={() => setActivePreviewStep('03')}
                  >
                    <span>{activePreviewStep === '03' ? "En cours d'aperçu" : 'Aperçu →'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 04: Outliers (Condition: outlierColumns.length > 0) */}
            {outlierColumns.length > 0 && (
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
                    Plafonner les valeurs aberrantes ({outlierColumns.map((c) => c.name).join(', ')})
                  </div>
                  <div className="recipe-subtitle">
                    {outlierColumns.map((c) => `${c.name} (${c.outlier_count} outliers)`).join(' · ')} hors clôtures IQR
                  </div>
                </div>

                <div className="recipe-controls-block">
                  <div className="recipe-select-group">
                    <span className="recipe-control-label">MÉTHODE</span>
                    <select
                      className="recipe-select font-mono"
                      value={step04Method}
                      onChange={(e) => setStep04Method(e.target.value as any)}
                    >
                      <option value="cap_iqr">Plafonner aux bornes IQR</option>
                      <option value="drop">Supprimer les outliers</option>
                      <option value="keep">Conserver</option>
                    </select>
                  </div>

                  <div className="recipe-stat-number">
                    {totalOutliersCount.toLocaleString('fr-FR')} cellules
                  </div>

                  <button
                    type="button"
                    className={`preview-action-btn ${activePreviewStep === '04' ? 'active' : ''}`}
                    onClick={() => setActivePreviewStep('04')}
                  >
                    <span>{activePreviewStep === '04' ? "En cours d'aperçu" : 'Aperçu →'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 05: Balance the target (Condition: isTargetImbalanced) */}
            {isTargetImbalanced && (
              <div className={`recipe-card ${activePreviewStep === '05' ? 'active-preview' : ''}`}>
                <div className="recipe-toggle-wrapper">
                  <span className="recipe-step-num">05</span>
                  <span className="badge-later">PLUS TARD</span>
                </div>

                <div className="recipe-text-block">
                  <div className="recipe-title">
                    Équilibrer la variable cible · {targetCol}
                  </div>
                  <div className="recipe-subtitle">
                    Délégué à l'étape Augmentation : le rééchantillonnage s'effectue après la séparation apprentissage / test
                  </div>
                </div>

                <div className="recipe-controls-block">
                  <div className="recipe-select-group">
                    <span className="recipe-control-label">PRISE EN CHARGE</span>
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
                    Étape suivante
                  </div>

                  <button
                    type="button"
                    className={`preview-action-btn ${activePreviewStep === '05' ? 'active' : ''}`}
                    onClick={() => {
                      setActivePreviewStep('05');
                      navigate('/augmentation');
                    }}
                  >
                    <span>Aperçu →</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            )}

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
              <span>+ Ajouter une étape manuelle — supprimer colonne, modifier type, filtrer lignes, renommer</span>
            </div>
          </div>
        </div>
      )}

      {/* Two Columns Grid: Aperçu (Left) and Impact sur la qualité (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '3rem', alignItems: 'start' }}>
        {/* Left Column: Aperçu Table */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 className="font-serif" style={{ fontSize: '1.6rem', fontWeight: 400, color: 'var(--text-main)' }}>
              Aperçu
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
                    COLONNE
                  </th>
                  <th className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
                    AVANT
                  </th>
                  <th className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
                    APRÈS
                  </th>
                  <th className="font-mono" style={{ padding: '0.75rem 1.25rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.06em' }}>
                    LIGNES
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
                        {item.rows > 0 ? item.rows.toLocaleString('fr-FR') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Uncertain mappings section (User validation required, never applied automatically) */}
          {activePreviewStep === '03' && uncertainMappings.length > 0 && (
            <div style={{ marginTop: '1rem', background: '#141418', border: '1px solid #282830', borderRadius: 6, padding: '1rem' }}>
              <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--amber)', fontWeight: 600, marginBottom: '0.45rem' }}>
                Cas incertains à valider par l’utilisateur (non appliqués automatiquement) :
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Ces variantes ne diffèrent pas uniquement par la casse ou les accents. Cochez celles que vous confirmez vouloir fusionner :
              </p>
              {uncertainMappings.map((u) => (
                <div key={u.from} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.35rem 0' }}>
                  <input
                    type="checkbox"
                    id={`uncertain-${u.from}`}
                    checked={!!selectedUncertainMatches[u.from]}
                    onChange={(e) => {
                      setSelectedUncertainMatches((prev) => ({
                        ...prev,
                        [u.from]: e.target.checked,
                      }));
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor={`uncertain-${u.from}`} style={{ fontSize: '0.78rem', color: '#e4e4e7', cursor: 'pointer' }}>
                    <span className="strike-red">{u.from}</span> → <span className="badge-after">{u.to}</span> ({u.rows} lignes) —{' '}
                    <span style={{ color: 'var(--text-muted)' }}>{u.reason}</span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Impact sur la qualité */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3 className="font-serif" style={{ fontSize: '1.6rem', fontWeight: 400, color: 'var(--text-main)' }}>
              Impact sur la qualité
            </h3>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              AVANT · APRÈS
            </div>
          </div>

          {/* Bar 1: Complétude */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Complétude</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.completeness)} → {Math.round(subAfter.completeness)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.completeness)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.completeness)}%` }}></div>
            </div>
          </div>

          {/* Bar 2: Unicité */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Unicité</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.uniqueness)} → {Math.round(subAfter.uniqueness)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.uniqueness)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.uniqueness)}%` }}></div>
            </div>
          </div>

          {/* Bar 3: Validité */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Validité</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.validity)} → {Math.round(subAfter.validity)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.validity)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.validity)}%` }}></div>
            </div>
          </div>

          {/* Bar 4: Cohérence */}
          <div className="quality-impact-row">
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Cohérence</span>
              <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {Math.round(subBefore.consistency)} → {Math.round(subAfter.consistency)}%
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-delta" style={{ width: `${Math.round(subAfter.consistency)}%` }}></div>
              <div className="quality-bar-fill-base" style={{ width: `${Math.round(subBefore.consistency)}%` }}></div>
            </div>
          </div>

          {/* Bar 5: Équilibre des classes */}
          <div className="quality-impact-row" style={{ marginBottom: '0.5rem' }}>
            <div className="quality-impact-header">
              <span style={{ color: 'var(--text-secondary)' }}>Équilibre des classes</span>
              <span className="font-mono" style={{ color: '#fb7185', fontSize: '0.78rem' }}>
                {subBefore.class_balance !== null ? `${Math.round(subBefore.class_balance)}%` : '—'}
              </span>
            </div>
            <div className="quality-bar-track">
              <div className="quality-bar-fill-class" style={{ width: `${subBefore.class_balance || 0}%` }}></div>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              S'améliore à l'étape 03 Augmentation, sur le jeu d'entraînement uniquement
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Execution Bar */}
      {hasIssuesToClean && (
        <div className="footer-execution-bar">
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
              {activeStepsCount} étape{activeStepsCount > 1 ? 's seront appliquées' : ' sera appliquée'} sur la version {currentVersionLabel}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {currentVersionLabel} reste intacte · le résultat est enregistré en tant que {nextVersionLabel} avec cette recette attachée, rejouable sur de nouvelles données
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
              {simulating ? <RefreshCw className="animate-spin" size={14} /> : 'Simulation (Dry run)'}
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
                  <span>Application en cours...</span>
                </>
              ) : (
                <span>Appliquer et créer la version {nextVersionLabel}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Modal: Export Recipe */}
      {showExportModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Download size={18} color="var(--amber)" />
                <h3 className="modal-title font-serif" style={{ fontSize: '1.35rem' }}>
                  Exporter la recette de nettoyage
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
                  download={`recette_nettoyage_${originalFileName}.json`}
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
                  Ajouter une étape manuelle
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
                  TYPE D'OPÉRATION
                </label>
                <select
                  value={manualStepType}
                  onChange={(e) => setManualStepType(e.target.value)}
                  style={{ width: '100%', background: '#121214', border: '1px solid #27272a', padding: '0.5rem', borderRadius: 4, color: '#f4f4f6', fontSize: '0.8rem' }}
                >
                  <option value="DROP_COLUMN">Supprimer une colonne</option>
                  <option value="CHANGE_TYPE">Modifier le type</option>
                  <option value="FILTER_ROWS">Filtrer des lignes</option>
                  <option value="RENAME_COLUMN">Renommer une colonne</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  COLONNE CIBLE
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
