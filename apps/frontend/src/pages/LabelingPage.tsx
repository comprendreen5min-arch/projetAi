import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  LabelingStatusResponse,
  QueueItemResponse,
  LabelChecksResponse,
  LabelingCandidate,
  BulkPattern,
} from '../types';

export const LabelingPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  // Status & Candidate
  const [status, setStatus] = useState<LabelingStatusResponse | null>(null);
  const [activeQueueId, setActiveQueueId] = useState<string>('suspected_errors');
  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const [queueItem, setQueueItem] = useState<QueueItemResponse | null>(null);
  const [loadingCandidate, setLoadingCandidate] = useState<boolean>(false);

  // Settings
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [threshold, setThreshold] = useState<number>(0.90);
  const [columnsMode, setColumnsMode] = useState<string>('8 most useful (auto)');
  const [secondReviewMode, setSecondReviewMode] = useState<string>('Every change');

  // Decision State
  const [selectedDecision, setSelectedDecision] = useState<'keep' | 'change' | 'not_yet' | 'unsure'>('change');
  const [selectedReason, setSelectedReason] = useState<string>('Saisie tardive de résiliation dans le CRM');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<boolean>(false);

  // Checks & Guardrails
  const [checksData, setChecksData] = useState<LabelChecksResponse | null>(null);

  // Modals
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [isTargetDefModalOpen, setIsTargetDefModalOpen] = useState<boolean>(false);
  const [rerunAugmentation, setRerunAugmentation] = useState<boolean>(false);
  const [isSavingVersion, setIsSavingVersion] = useState<boolean>(false);

  // Target Definition event listener from TopBar
  useEffect(() => {
    const handleTargetDef = () => setIsTargetDefModalOpen(true);
    window.addEventListener('datalift:target-definition', handleTargetDef);
    return () => window.removeEventListener('datalift:target-definition', handleTargetDef);
  }, []);

  // 1. Load initial datasets
  useEffect(() => {
    api.getDatasets()
      .then((data) => {
        setDatasets(data);
        if (data.length > 0) {
          const defaultDs = data.find((d) => d.name === 'data' || d.name === 'customer_churn.csv') || data[0];
          setSelectedDatasetId(defaultDs.id);
        }
      })
      .catch((err) => console.error('Erreur chargement datasets:', err))
      .finally(() => setLoadingInitial(false));
  }, []);

  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  );

  // 2. Load Status & Checks when dataset/target/threshold changes
  const loadStatusAndChecks = useCallback(async (dsId: string, tgtCol?: string, thresh?: number) => {
    if (!dsId) return;
    try {
      const [st, chk] = await Promise.all([
        api.getLabelingStatus(dsId, tgtCol || undefined, thresh || 0.90),
        api.getLabelChecks(dsId),
      ]);
      setStatus(st);
      setChecksData(chk);
      if (!tgtCol && st.target_column) {
        setTargetColumn(st.target_column);
      }
    } catch (err) {
      console.error('Erreur chargement statut labeling:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      loadStatusAndChecks(selectedDatasetId, targetColumn || undefined, threshold);
      setCandidateIndex(0);
    }
  }, [selectedDatasetId, targetColumn, threshold, loadStatusAndChecks]);

  // 3. Load Candidate Row for active queue & index
  const loadCandidate = useCallback(
    async (dsId: string, queue: string, idx: number, tgtCol?: string, thresh?: number) => {
      if (!dsId) return;
      try {
        setLoadingCandidate(true);
        const res = await api.getQueueCandidate(dsId, queue, idx, tgtCol || undefined, thresh || 0.90);
        setQueueItem(res);
        if (res.candidate) {
          // Preselect decision
          if (res.candidate.current_decision) {
            setSelectedDecision(res.candidate.current_decision as any);
          } else {
            setSelectedDecision(queue === 'missing_target' ? 'not_yet' : 'change');
          }
          if (res.candidate.current_reason) {
            setSelectedReason(res.candidate.current_reason);
          }
        }
      } catch (err) {
        console.error('Erreur chargement candidat:', err);
      } finally {
        setLoadingCandidate(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedDatasetId) {
      loadCandidate(selectedDatasetId, activeQueueId, candidateIndex, targetColumn || undefined, threshold);
    }
  }, [selectedDatasetId, activeQueueId, candidateIndex, targetColumn, threshold, loadCandidate]);

  // Candidate shortcut
  const candidate: LabelingCandidate | null = queueItem?.candidate || null;

  // 4. Handle Save Decision & Next
  const handleSaveDecision = async () => {
    if (!selectedDatasetId || !candidate) return;
    try {
      setIsSubmittingDecision(true);
      const newLabelVal =
        selectedDecision === 'change'
          ? (status?.pos_label === candidate.current_label ? status?.neg_label : status?.pos_label)
          : selectedDecision === 'keep'
          ? candidate.current_label
          : selectedDecision === 'not_yet'
          ? 'not_yet'
          : candidate.current_label;

      await api.applyLabelDecision(selectedDatasetId, {
        rowIndex: candidate.row_index,
        customerId: candidate.customer_id,
        decision: selectedDecision,
        newLabel: newLabelVal,
        reason: selectedReason,
        queueId: activeQueueId,
      });

      // Refresh checks and status
      loadStatusAndChecks(selectedDatasetId, targetColumn, threshold);

      // Advance to next item in queue
      if (queueItem && candidateIndex < queueItem.total_items - 1) {
        setCandidateIndex((prev) => prev + 1);
      } else {
        // Reload current index
        loadCandidate(selectedDatasetId, activeQueueId, candidateIndex, targetColumn, threshold);
      }
    } catch (err: any) {
      console.error('Erreur application décision:', err);
      alert(err.response?.data?.detail || 'Erreur lors de l’enregistrement de la décision.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // 5. Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing inside an input/textarea/select
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === '1') {
        setSelectedDecision('keep');
      } else if (e.key === '2') {
        setSelectedDecision('change');
      } else if (e.key === 'n' || e.key === 'N') {
        setSelectedDecision('not_yet');
      } else if (e.key === 'u' || e.key === 'U') {
        setSelectedDecision('unsure');
      } else if (e.key === 'Enter') {
        handleSaveDecision();
      } else if (e.key === 'ArrowRight') {
        if (queueItem && candidateIndex < queueItem.total_items - 1) {
          setCandidateIndex((prev) => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (candidateIndex > 0) {
          setCandidateIndex((prev) => prev - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [candidate, selectedDecision, selectedReason, queueItem, candidateIndex]);

  // 6. Handle Bulk Fix
  const handleApplyBulkFix = async () => {
    if (!selectedDatasetId || !candidate?.bulk_pattern) return;
    try {
      const p: BulkPattern = candidate.bulk_pattern;
      const targetFix = status?.pos_label || 'yes';
      await api.applyBulkFix(selectedDatasetId, {
        rowIndices: p.matching_row_indices,
        newLabel: targetFix,
        reason: selectedReason || 'Correction groupée par motif de résiliation',
        patternDescription: p.description,
      });

      setIsBulkModalOpen(false);
      loadStatusAndChecks(selectedDatasetId, targetColumn, threshold);
      loadCandidate(selectedDatasetId, activeQueueId, candidateIndex, targetColumn, threshold);
    } catch (err: any) {
      console.error('Erreur bulk fix:', err);
      alert(err.response?.data?.detail || 'Erreur lors de la correction en masse.');
    }
  };

  // 7. Handle Save New Version
  const handleSaveVersion = async () => {
    if (!selectedDatasetId) return;
    try {
      setIsSavingVersion(true);
      const res = await api.saveLabelingVersion(selectedDatasetId, {
        rerunAugmentation,
        description: `Labellisation humaine et par règles métier sur ${selectedDataset?.name}`,
      });
      setIsSaveModalOpen(false);

      // Refresh status and checks
      await loadStatusAndChecks(selectedDatasetId, targetColumn, threshold);
      alert(`Nouvelle version ${res.new_version_label} créée avec succès !`);
    } catch (err: any) {
      console.error('Erreur enregistrement version:', err);
      alert(err.response?.data?.detail || 'Erreur lors de l’enregistrement de la version.');
    } finally {
      setIsSavingVersion(false);
    }
  };

  if (loadingInitial) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <RefreshCw className="animate-spin" size={24} style={{ marginRight: '0.75rem', color: 'var(--amber)' }} />
        <span className="font-mono">Initialisation du module de labellisation...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem 3.5rem', maxWidth: '1440px', margin: '0 auto', color: 'var(--text-main)' }}>
      {/* ========================================================= */}
      {/* TOP HEADER: BREADCRUMB & METRICS */}
      {/* ========================================================= */}
      <div style={{ marginBottom: '2rem' }}>
        {/* Breadcrumb row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
          <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            JEU DE DONNÉES • {status?.source_version_label || 'V3'} → {status?.target_version_label || 'V4'} BROUILLON • CLASSIFICATION BINAIRE • CIBLE = {(status?.target_column || 'CHURNED').toUpperCase()}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>JEU DE DONNÉES :</span>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="font-mono"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                padding: '0.25rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
              }}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Big Title Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 className="font-serif" style={{ fontSize: '3rem', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
              {selectedDataset?.name || 'customer_churn.csv'}
            </h1>
          </div>

          {/* Big Score: LABEL TRUST / 100 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span className="font-serif" style={{ fontSize: '3.6rem', fontWeight: 400, color: 'var(--text-muted)', lineHeight: 1 }}>
                {status?.label_trust_before ?? 93}
              </span>
              <span className="font-serif" style={{ fontSize: '2.5rem', color: 'var(--amber)', lineHeight: 1 }}>
                →
              </span>
              <span className="font-serif" style={{ fontSize: '4.8rem', fontWeight: 500, color: 'var(--amber)', lineHeight: 1 }}>
                {status?.label_trust_after ?? 99}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
              <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                CONFIANCE DES LABELS / 100
              </span>
              <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--amber)' }}>
                AVANT → APRÈS
              </span>
            </div>
          </div>
        </div>

        {/* 4 Header Metric Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* 1. Suspected Errors */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              ERREURS SUSPECTÉES
            </div>
            <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: 'var(--amber)' }}>
              {status?.suspected_errors_count.toLocaleString('fr-FR') ?? 0}
            </div>
            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              le modèle est en désaccord à ≥ {Math.round(threshold * 100)} %
            </div>
          </div>

          {/* 2. Rule Conflicts */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              CONFLITS DE RÈGLES
            </div>
            <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: '#ef4444' }}>
              {status?.rule_conflicts_count.toLocaleString('fr-FR') ?? 0}
            </div>
            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              date d'annulation mais {status?.target_column || 'cible'} = {status?.neg_label || 'non'}
            </div>
          </div>

          {/* 3. Done Today */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              TRAITÉES AUJOURD'HUI
            </div>
            <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: '#22c55e' }}>
              {status?.done_today_count.toLocaleString('fr-FR') ?? 0}
            </div>
            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              1 analyste • 1 réviseur
            </div>
          </div>

          {/* 4. Output Version */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              SORTIE
            </div>
            <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: 'var(--text-main)' }}>
              {status?.output_version ?? 'v4'}
            </div>
            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {status?.source_version_label ?? 'v3'} conservée telle quelle
            </div>
          </div>
        </div>

        {/* Blue Info Callout Box */}
        <div
          style={{
            backgroundColor: '#0c192c',
            borderLeft: '4px solid #38bdf8',
            padding: '1rem 1.5rem',
            borderRadius: '4px',
            marginBottom: '3rem',
          }}
        >
          <div className="font-mono" style={{ fontSize: '0.72rem', color: '#38bdf8', letterSpacing: '0.08em', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
            Comment fonctionne la labellisation pour les données tabulaires
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#bae6fd', lineHeight: 1.5 }}>
            La colonne cible existe déjà (elle provient de votre CRM ou base métier). Personne ne la remplit à la main. Vous vérifiez et corrigez ici les lignes où le label est probablement faux ou contradictoire.
          </p>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. QUEUES SECTION */}
      {/* ========================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400 }}>
            1 • Files d'attente
          </h2>
          <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            LES LIGNES LES PLUS PROBABLEMENT FAUSSES EN PREMIER
          </span>
        </div>

        {/* 4 Queue Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {status?.queues.map((q) => {
            const isActive = activeQueueId === q.id;
            return (
              <div
                key={q.id}
                onClick={() => {
                  setActiveQueueId(q.id);
                  setCandidateIndex(0);
                }}
                className="card"
                style={{
                  padding: '1.5rem',
                  border: isActive ? '1px solid var(--amber)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  backgroundColor: isActive ? 'var(--bg-surface)' : 'var(--bg-card)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                      {q.title}
                    </span>
                    {isActive && (
                      <span className="badge font-mono" style={{ backgroundColor: 'var(--amber)', color: '#000', fontSize: '0.65rem', fontWeight: 600 }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="font-serif" style={{ fontSize: '2.5rem', fontWeight: 500, lineHeight: 1, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
                    {q.count.toLocaleString('fr-FR')}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 1.25rem 0' }}>
                    {q.description}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {q.done_count} traitée{q.done_count > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className={isActive ? 'btn btn-primary font-mono' : 'btn btn-secondary font-mono'}
                    style={{ fontSize: '0.72rem', padding: '0.35rem 0.85rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveQueueId(q.id);
                      setCandidateIndex(0);
                    }}
                  >
                    {isActive ? 'Continuer' : q.button_label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Queue Settings Controls Bar */}
        <div
          className="card"
          style={{
            padding: '1rem 1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.25rem',
            alignItems: 'center',
          }}
        >
          {/* Target Column */}
          <div>
            <label className="font-mono" style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              COLONNE CIBLE
            </label>
            <select
              value={targetColumn || status?.target_column || ''}
              onChange={(e) => setTargetColumn(e.target.value)}
              className="font-mono"
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                padding: '0.4rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
              }}
            >
              {status?.available_target_columns.map((c) => (
                <option key={c} value={c}>
                  {c} • {status.pos_label} / {status.neg_label}
                </option>
              ))}
            </select>
          </div>

          {/* Model Certainty Threshold */}
          <div>
            <label className="font-mono" style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              SIGNALER SI LE MODÈLE EST SÛR À
            </label>
            <select
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="font-mono"
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                padding: '0.4rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
              }}
            >
              <option value={0.95}>≥ 0.95 (Très strict)</option>
              <option value={0.90}>≥ 0.90 (Recommandé)</option>
              <option value={0.85}>≥ 0.85</option>
              <option value={0.80}>≥ 0.80</option>
              <option value={0.70}>≥ 0.70 (Large)</option>
            </select>
          </div>

          {/* Columns Shown Mode */}
          <div>
            <label className="font-mono" style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              COLONNES SUR LA CARTE
            </label>
            <select
              value={columnsMode}
              onChange={(e) => setColumnsMode(e.target.value)}
              className="font-mono"
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                padding: '0.4rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
              }}
            >
              <option value="8 most useful (auto)">8 plus utiles (auto)</option>
              <option value="all">Toutes les colonnes</option>
              <option value="categorical">Catégorielles seules</option>
            </select>
          </div>

          {/* Second Review Mode */}
          <div>
            <label className="font-mono" style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              SECONDE LECTURE
            </label>
            <select
              value={secondReviewMode}
              onChange={(e) => setSecondReviewMode(e.target.value)}
              className="font-mono"
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                padding: '0.4rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
              }}
            >
              <option value="Every change">Chaque modification</option>
              <option value="Test set only">Jeu de test seulement</option>
              <option value="Unsure only">Incertaines seulement</option>
              <option value="None">Aucune</option>
            </select>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. WORKSPACE SECTION */}
      {/* ========================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400 }}>
            2 • Espace de travail
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              {activeQueueId.toUpperCase().replace('_', ' ')} • {candidate?.customer_id || '—'} • {queueItem?.current_index ?? 0} / {queueItem?.total_items ?? 0}
            </span>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                disabled={candidateIndex <= 0}
                onClick={() => setCandidateIndex((prev) => Math.max(0, prev - 1))}
                className="btn btn-secondary font-mono"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                title="Ligne précédente (Flèche gauche)"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={!queueItem || candidateIndex >= queueItem.total_items - 1}
                onClick={() => setCandidateIndex((prev) => prev + 1)}
                className="btn btn-secondary font-mono"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                title="Ligne suivante (Flèche droite)"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {loadingCandidate ? (
          <div className="card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 0.75rem auto', color: 'var(--amber)' }} />
            <span className="font-mono" style={{ fontSize: '0.8rem' }}>Chargement de la ligne à vérifier...</span>
          </div>
        ) : !candidate ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p className="font-serif" style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              Aucune ligne en attente dans cette file
            </p>
            <p className="font-mono" style={{ fontSize: '0.8rem' }}>
              Toutes les lignes de la file {activeQueueId} ont été traitées ou aucun conflit n'a été détecté.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
            {/* Left Column: Main Card */}
            <div className="card" style={{ padding: '1.75rem' }}>
              {/* Card Header: Customer ID + Partition + Label vs Model */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400, margin: 0 }}>
                    Client {candidate.customer_id}
                  </h3>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '0.68rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '3px',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {(candidate.split || 'TRAIN').toUpperCase()}
                  </span>
                </div>

                <div className="font-mono" style={{ fontSize: '0.88rem', display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                  <span>
                    Label :{' '}
                    <strong style={{ color: '#ef4444', textDecoration: selectedDecision === 'change' ? 'line-through' : 'none' }}>
                      {candidate.current_label}
                    </strong>
                  </span>
                  <span>
                    Modèle :{' '}
                    <strong style={{ color: '#22c55e' }}>
                      {candidate.model_prediction} • {candidate.model_probability}
                    </strong>
                  </span>
                </div>
              </div>

              {/* 2x4 Feature Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                {candidate.features.map((f, idx) => {
                  let borderColor = 'var(--border)';
                  let bgColor = 'var(--bg-main)';
                  if (f.is_contradiction) {
                    borderColor = '#ef4444';
                    bgColor = 'rgba(239, 68, 68, 0.08)';
                  } else if (f.is_positive_driver) {
                    borderColor = '#38bdf8';
                    bgColor = 'rgba(56, 189, 248, 0.08)';
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: bgColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '6px',
                        padding: '0.75rem',
                      }}
                    >
                      <div className="font-mono" style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginBottom: '0.35rem', letterSpacing: '0.05em' }}>
                        {f.display_name}
                      </div>
                      <div className="font-mono" style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                        {String(f.value)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend Caption */}
              <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                <span style={{ color: '#38bdf8' }}>Bleu</span> = colonnes qui font dire '{status?.pos_label}' au modèle.{' '}
                <span style={{ color: '#ef4444' }}>Rouge</span> = un fait qui contredit le label actuel.
              </div>

              {/* Decision Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                  VOTRE DÉCISION
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  {/* [1] Keep */}
                  <button
                    type="button"
                    onClick={() => setSelectedDecision('keep')}
                    style={{
                      backgroundColor: selectedDecision === 'keep' ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-main)',
                      border: selectedDecision === 'keep' ? '1px solid var(--amber)' : '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.85rem 0.75rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedDecision === 'keep' ? 'var(--amber)' : 'var(--text-main)', marginBottom: '0.25rem' }}>
                      [1] Conserver "{candidate.current_label}"
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Le label est correct</div>
                  </button>

                  {/* [2] Change */}
                  <button
                    type="button"
                    onClick={() => setSelectedDecision('change')}
                    style={{
                      backgroundColor: selectedDecision === 'change' ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-main)',
                      border: selectedDecision === 'change' ? '1px solid var(--amber)' : '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.85rem 0.75rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedDecision === 'change' ? 'var(--amber)' : 'var(--text-main)', marginBottom: '0.25rem' }}>
                      [2] Changer pour "{status?.pos_label === candidate.current_label ? status?.neg_label : status?.pos_label}"
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Le client est parti</div>
                  </button>

                  {/* [N] Not Yet */}
                  <button
                    type="button"
                    onClick={() => setSelectedDecision('not_yet')}
                    style={{
                      backgroundColor: selectedDecision === 'not_yet' ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-main)',
                      border: selectedDecision === 'not_yet' ? '1px solid var(--amber)' : '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.85rem 0.75rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedDecision === 'not_yet' ? 'var(--amber)' : 'var(--text-main)', marginBottom: '0.25rem' }}>
                      [N] Pas encore connu
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Trop récent pour décider</div>
                  </button>

                  {/* [U] Unsure */}
                  <button
                    type="button"
                    onClick={() => setSelectedDecision('unsure')}
                    style={{
                      backgroundColor: selectedDecision === 'unsure' ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-main)',
                      border: selectedDecision === 'unsure' ? '1px solid var(--amber)' : '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.85rem 0.75rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div className="font-mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedDecision === 'unsure' ? 'var(--amber)' : 'var(--text-main)', marginBottom: '0.25rem' }}>
                      [U] Incertain
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Envoyer au réviseur</div>
                  </button>
                </div>
              </div>

              {/* Reason Selector (Mandatory for change) */}
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <label className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                    MOTIF (REQUIS POUR MODIFIER UN LABEL)
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate('/cleaning')}
                    className="font-mono"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--amber)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: 0,
                    }}
                  >
                    <span>Mauvaise valeur dans une autre colonne ? Envoyer au Nettoyage</span>
                    <ExternalLink size={12} />
                  </button>
                </div>

                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="font-mono"
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border)',
                    padding: '0.55rem 0.85rem',
                    borderRadius: '4px',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value="Saisie tardive de résiliation dans le CRM">Saisie tardive de résiliation dans le CRM</option>
                  <option value="Erreur de frappe dans le CRM">Erreur de frappe dans le CRM</option>
                  <option value="Litige de facturation résolu">Litige de facturation résolu</option>
                  <option value="Confirmation client suite à contact">Confirmation client suite à contact</option>
                  <option value="Contrat résilié manuellement">Contrat résilié manuellement</option>
                  <option value="Compte suspendu pour impayé">Compte suspendu pour impayé</option>
                  <option value="Autre motif professionnel...">Autre motif professionnel...</option>
                </select>
              </div>

              {/* Keyboard Shortcuts Hint & Action Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.85rem' }}>
                  <span><strong style={{ color: 'var(--amber)' }}>[1]</strong> garder</span>
                  <span><strong style={{ color: 'var(--amber)' }}>[2]</strong> changer</span>
                  <span><strong style={{ color: 'var(--amber)' }}>[N]</strong> pas encore</span>
                  <span><strong style={{ color: 'var(--amber)' }}>[U]</strong> incertain</span>
                  <span><strong style={{ color: 'var(--amber)' }}>[Entrée]</strong> enregistrer & suivant</span>
                </div>

                <button
                  type="button"
                  onClick={handleSaveDecision}
                  disabled={isSubmittingDecision}
                  className="btn btn-primary font-mono"
                  style={{ fontSize: '0.78rem', padding: '0.5rem 1.25rem' }}
                >
                  {isSubmittingDecision ? (
                    <>
                      <RefreshCw className="animate-spin" size={13} />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <span>Valider & Suivant</span>
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Sidebar Panels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Box 1: Customer History Timeline */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.85rem' }}>
                  HISTORIQUE CLIENT
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem' }}>
                  {candidate.history.map((h, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', alignItems: 'center' }}>
                      <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{h.date}</span>
                      <span style={{ color: h.is_highlighted ? 'var(--amber)' : 'var(--text-main)', fontWeight: h.is_highlighted ? 600 : 400 }}>
                        {h.event}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Box 2: Most Similar Customers */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                    CLIENTS LES PLUS SIMILAIRES
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.75rem' }}>
                  {candidate.nearest_customers.map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span className="font-mono" style={{ color: 'var(--text-main)' }}>{c.customer_id}</span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '0.68rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '3px',
                          backgroundColor: c.label === 'OUI' || c.label === 'YES' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: c.label === 'OUI' || c.label === 'YES' ? '#22c55e' : '#ef4444',
                          border: `1px solid ${c.label === 'OUI' || c.label === 'YES' ? '#22c55e' : '#ef4444'}`,
                          fontWeight: 600,
                        }}
                      >
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  5 clients les plus proches • {candidate.nearest_customers.filter((c) => c.label === 'OUI' || c.label === 'YES').length} partis
                </div>
              </div>

              {/* Box 3: Same Pattern · Bulk Fix */}
              {candidate.bulk_pattern && (
                <div
                  className="card"
                  style={{
                    padding: '1.25rem',
                    border: '1px solid var(--amber)',
                    backgroundColor: 'rgba(245, 158, 11, 0.04)',
                  }}
                >
                  <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--amber)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    MÊME MOTIF • CORRECTION EN MASSE
                  </div>

                  <p style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.4, margin: '0 0 1rem 0' }}>
                    {candidate.bulk_pattern.description}
                  </p>

                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(true)}
                    className="btn btn-secondary font-mono"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      fontSize: '0.74rem',
                      borderColor: 'var(--amber)',
                      color: 'var(--amber)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span>Aperçu des {candidate.bulk_pattern.matching_count} lignes →</span>
                  </button>

                  <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Appliqué uniquement après validation de l'aperçu
                  </div>
                </div>
              )}

              {/* Box 4: This Row Metadata */}
              <div className="card" style={{ padding: '1.25rem', fontSize: '0.78rem' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                  CETTE LIGNE
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.45rem', marginBottom: '0.35rem' }}>
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>Source du label</span>
                  <span style={{ color: 'var(--text-main)' }}>{candidate.label_source}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.45rem' }}>
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>Enfants SMOTE</span>
                  <span style={{ color: 'var(--text-main)' }}>{candidate.smote_children}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* 3. LABEL CHECKS & CHANGES SECTION */}
      {/* ========================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: 3 · Label checks */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
              <h2 className="font-serif" style={{ fontSize: '1.65rem', fontWeight: 400 }}>
                3 • Contrôles des labels
              </h2>
              <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                EXÉCUTÉS À CHAQUE ENREGISTREMENT
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {checksData?.checks.map((chk) => (
                <div
                  key={chk.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '0.85rem',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ maxWidth: '65%' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 500, marginBottom: '0.2rem' }}>
                      {chk.title}
                    </div>
                    <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {chk.subtitle}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        color: chk.count_or_status === 'ok' ? '#22c55e' : (chk.count && chk.count > 0 ? 'var(--amber)' : 'var(--text-muted)'),
                      }}
                    >
                      {chk.count_or_status}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (chk.id === 'cancel_date_conflict') {
                          setActiveQueueId('rule_conflicts');
                          setCandidateIndex(0);
                        } else {
                          setActiveQueueId('suspected_errors');
                          setCandidateIndex(0);
                        }
                      }}
                      className="btn btn-secondary font-mono"
                      style={{ fontSize: '0.7rem', padding: '0.25rem 0.65rem' }}
                    >
                      {chk.action_type === 'fix' ? 'Corriger →' : 'Voir →'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Changes Today */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
              <h2 className="font-serif" style={{ fontSize: '1.65rem', fontWeight: 400 }}>
                Modifications
              </h2>
              <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                AUJOURD'HUI
              </span>
            </div>

            {checksData?.recent_changes && checksData.recent_changes.length > 0 ? (
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th className="font-mono" style={{ padding: '0.45rem 0.5rem 0.45rem 0', fontWeight: 500 }}>LIGNE</th>
                      <th className="font-mono" style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>AVANT</th>
                      <th className="font-mono" style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>APRÈS</th>
                      <th className="font-mono" style={{ padding: '0.45rem 0 0.45rem 0.5rem', fontWeight: 500 }}>MOTIF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checksData.recent_changes.map((ch, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="font-mono" style={{ padding: '0.55rem 0.5rem 0.55rem 0', color: 'var(--text-secondary)' }}>
                          {ch.row_id}
                        </td>
                        <td className="font-mono" style={{ padding: '0.55rem 0.5rem', color: '#ef4444', textDecoration: 'line-through' }}>
                          {ch.before}
                        </td>
                        <td className="font-mono" style={{ padding: '0.55rem 0.5rem', color: '#22c55e', fontWeight: 600 }}>
                          {ch.after}
                        </td>
                        <td className="font-mono" style={{ padding: '0.55rem 0 0.55rem 0.5rem', color: 'var(--text-main)', fontSize: '0.72rem' }}>
                          {ch.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Aucune modification appliquée aujourd'hui pour l'instant.
              </div>
            )}

            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Chaque modification conserve l'ancienne valeur, le motif, qui l'a effectuée et qui l'a révisée.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. GUARDRAILS SECTION */}
      {/* ========================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400 }}>
            Garde-fous
          </h2>
          <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            VÉRIFIÉS AVANT TOUT ENREGISTREMENT
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {checksData?.guardrails.map((g) => (
            <div
              key={g.id}
              className="card"
              style={{
                padding: '1.25rem',
                borderLeft: g.is_warning ? '3px solid #f59e0b' : '3px solid #22c55e',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                {g.is_warning ? (
                  <AlertTriangle size={15} color="#f59e0b" />
                ) : (
                  <Check size={15} color="#22c55e" />
                )}
                <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-main)' }}>
                  {g.title}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {g.subtitle}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. BOTTOM ACTION BAR */}
      {/* ========================================================= */}
      <div
        className="card"
        style={{
          position: 'sticky',
          bottom: '1rem',
          padding: '1.25rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          backgroundColor: '#0a0a0c',
          border: '1px solid var(--border)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 40,
        }}
      >
        <div>
          <div style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
            {checksData?.summary.total_checked ?? 240} lignes vérifiées • {checksData?.summary.labels_fixed ?? 96} labels corrigés • {checksData?.summary.marked_not_yet ?? 62} marqués "pas encore"
          </div>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Enregistré comme {status?.output_version || 'v4'} avec le journal des modifications attaché ; la recette d'augmentation peut être rejouée dessus
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setRerunAugmentation(true);
              setIsSaveModalOpen(true);
            }}
            className="btn btn-secondary font-mono"
            style={{ fontSize: '0.78rem', padding: '0.55rem 1.25rem' }}
          >
            Rejouer l'augmentation sur {status?.output_version || 'v4'}
          </button>

          <button
            type="button"
            onClick={() => {
              setRerunAugmentation(false);
              setIsSaveModalOpen(true);
            }}
            className="btn btn-primary font-mono"
            style={{ fontSize: '0.78rem', padding: '0.55rem 1.25rem' }}
          >
            Enregistrer comme {status?.output_version || 'v4'}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* BULK FIX PREVIEW MODAL */}
      {/* ========================================================= */}
      {isBulkModalOpen && candidate?.bulk_pattern && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div className="card" style={{ maxWidth: '600px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 500, margin: 0 }}>
                Aperçu de la correction en masse
              </h3>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid var(--amber)',
                borderRadius: '6px',
                padding: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--amber)', marginBottom: '0.35rem' }}>
                MOTIF IDENTIFIÉ
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                {candidate.bulk_pattern.description}
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Cette action va remplacer le label actuel par <strong style={{ color: '#22c55e' }}>"{status?.pos_label || 'yes'}"</strong> pour les{' '}
              <strong style={{ color: 'var(--text-main)' }}>{candidate.bulk_pattern.matching_count} lignes</strong> correspondantes. Le motif{' '}
              <em>"{selectedReason}"</em> sera enregistré dans le journal d'audit pour chacune de ces lignes.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="btn btn-secondary font-mono"
                style={{ fontSize: '0.78rem' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApplyBulkFix}
                className="btn btn-primary font-mono"
                style={{ fontSize: '0.78rem' }}
              >
                Confirmer & Appliquer ({candidate.bulk_pattern.matching_count} lignes)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SAVE VERSION MODAL */}
      {/* ========================================================= */}
      {isSaveModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div className="card" style={{ maxWidth: '540px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 500, margin: 0 }}>
                Enregistrer comme {status?.output_version || 'v4'}
              </h3>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Une nouvelle version immuable <strong style={{ color: 'var(--amber)' }}>{status?.output_version || 'v4'}</strong> va être créée dans le lignage du jeu de données{' '}
              <strong style={{ color: 'var(--text-main)' }}>{selectedDataset?.name}</strong>.
              <ul style={{ margin: '0.75rem 0', paddingLeft: '1.25rem', color: 'var(--text-main)' }}>
                <li>{checksData?.summary.labels_fixed ?? 0} labels corrigés</li>
                <li>{checksData?.summary.marked_not_yet ?? 0} lignes marquées "pas encore"</li>
                <li>Journal complet d'audit des motifs conservé</li>
              </ul>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rerunAugmentation}
                onChange={(e) => setRerunAugmentation(e.target.checked)}
                style={{ accentColor: 'var(--amber)' }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                Rejouer automatiquement la recette d'augmentation sur cette nouvelle version
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="btn btn-secondary font-mono"
                style={{ fontSize: '0.78rem' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveVersion}
                disabled={isSavingVersion}
                className="btn btn-primary font-mono"
                style={{ fontSize: '0.78rem' }}
              >
                {isSavingVersion ? (
                  <>
                    <RefreshCw className="animate-spin" size={13} />
                    <span>Création de {status?.output_version || 'v4'}...</span>
                  </>
                ) : (
                  <span>Confirmer la création de {status?.output_version || 'v4'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TARGET DEFINITION MODAL */}
      {/* ========================================================= */}
      {isTargetDefModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 500, margin: 0 }}>
                Définition de la cible
              </h3>
              <button
                onClick={() => setIsTargetDefModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                COLONNE CIBLE ACTUELLE
              </div>
              <div className="font-mono" style={{ fontSize: '1.1rem', color: 'var(--amber)', fontWeight: 600 }}>
                {status?.target_column || 'churned'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div className="card" style={{ padding: '0.85rem' }}>
                <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>CLASSE POSITIVE (1)</div>
                <div className="font-mono" style={{ fontSize: '1rem', color: '#22c55e', fontWeight: 600 }}>
                  {status?.pos_label || 'yes'}
                </div>
              </div>
              <div className="card" style={{ padding: '0.85rem' }}>
                <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>CLASSE NÉGATIVE (0)</div>
                <div className="font-mono" style={{ fontSize: '1rem', color: '#ef4444', fontWeight: 600 }}>
                  {status?.neg_label || 'no'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsTargetDefModalOpen(false)}
                className="btn btn-primary font-mono"
                style={{ fontSize: '0.78rem' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
