import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GitBranch,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Eye,
  FileText,
  Upload,
  ChevronRight,
  Tag,
  X,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  LineageGraphResponse,
  LineageNode,
  VersioningHeaderMetrics,
  CompareResponse,
  RowDiffPage,
  ViewQueryResponse,
  GuardrailItem,
  DatasetCardResponse,
} from '../types';
import { UploadModal } from '../components/UploadModal';
import { DataPreviewModal } from '../components/DataPreviewModal';

export const VersioningPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetParam = searchParams.get('dataset');

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

  // Lineage & Header metrics
  const [lineage, setLineage] = useState<LineageGraphResponse | null>(null);
  const [headerMetrics, setHeaderMetrics] = useState<VersioningHeaderMetrics | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loadingLineage, setLoadingLineage] = useState<boolean>(false);

  // Compare section state
  const [compareBaseHash, setCompareBaseHash] = useState<string>('');
  const [compareTargetHash, setCompareTargetHash] = useState<string>('');
  const [selectedRowKey, setSelectedRowKey] = useState<string>('');
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [loadingCompare, setLoadingCompare] = useState<boolean>(false);

  // Row diff state
  const [rowDiffPage, setRowDiffPage] = useState<RowDiffPage | null>(null);
  const [diffFilter, setDiffFilter] = useState<'all' | 'added' | 'removed' | 'modified'>('all');
  const [diffCurrentPage, setDiffCurrentPage] = useState<number>(1);
  const [loadingDiff, setLoadingDiff] = useState<boolean>(false);

  // Virtual views state
  const [viewInfo, setViewInfo] = useState<ViewQueryResponse | null>(null);
  const [activeViewFilter, setActiveViewFilter] = useState<string>('all');

  // Guardrails
  const [guardrails, setGuardrails] = useState<GuardrailItem[]>([]);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [inspectVersionHash, setInspectVersionHash] = useState<string | null>(null);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState<boolean>(false);
  const [branchName, setBranchName] = useState<string>('');
  const [branchDesc, setBranchDesc] = useState<string>('');
  const [isReplayModalOpen, setIsReplayModalOpen] = useState<boolean>(false);
  const [replayFile, setReplayFile] = useState<File | null>(null);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState<boolean>(false);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [isCardModalOpen, setIsCardModalOpen] = useState<boolean>(false);
  const [datasetCard, setDatasetCard] = useState<DatasetCardResponse | null>(null);
  const [cardModalTab, setCardModalTab] = useState<'markdown' | 'json'>('markdown');
  const [copiedCli, setCopiedCli] = useState<boolean>(false);
  const [copiedViewCli, setCopiedViewCli] = useState<boolean>(false);
  const [copiedCard, setCopiedCard] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Helper for type labels
  const getNodeTypeLabel = (node: LineageNode) => {
    if (node.is_branch) return 'Branche';
    if (node.operation_type === 'AUGMENTATION_PIPELINE' || node.recipe_summary.toLowerCase().includes('smote')) {
      return 'Augmenté';
    }
    if (node.operation_type === 'CLEANING_PIPELINE' || node.recipe_summary.toLowerCase().includes('nettoyage')) {
      return 'Nettoyé';
    }
    return 'Brut';
  };

  // 1. Initial Load of Datasets
  useEffect(() => {
    const fetchAllDatasets = async () => {
      try {
        const list = await api.getDatasets();
        setDatasets(list);

        if (list.length > 0) {
          const match = datasetParam ? list.find((d) => d.id === datasetParam) : null;
          const chosen = match || list[0];
          setSelectedDataset(chosen);
          if (!datasetParam || datasetParam !== chosen.id) {
            setSearchParams({ dataset: chosen.id }, { replace: true });
          }
        }
      } catch (err) {
        console.error('Erreur chargement datasets:', err);
      }
    };
    fetchAllDatasets();
  }, []);

  // 2. Fetch Lineage and Header when selectedDataset changes
  const loadDatasetData = async (datasetId: string) => {
    try {
      setLoadingLineage(true);
      setCompareResult(null);
      setRowDiffPage(null);
      setSelectedRowKey('');
      const [lin, hdr] = await Promise.all([
        api.getLineageGraph(datasetId),
        api.getVersioningHeader(datasetId),
      ]);
      setLineage(lin);
      setHeaderMetrics(hdr);

      if (lin.nodes.length > 0) {
        // Default select current version or baseline or first node
        const current = lin.nodes.find((n) => n.is_current) || lin.nodes.find((n) => n.is_baseline) || lin.nodes[lin.nodes.length - 1];
        setSelectedNodeId(current.id);

        // Prepopulate compare selectors: if >= 2 nodes, pick parent and current (guaranteeing different nodes)
        if (lin.nodes.length >= 2) {
          let targetNode = lin.nodes.find((n) => n.is_current && n.parent_version_id) || lin.nodes[lin.nodes.length - 1];
          let baseNode = lin.nodes.find((n) => n.id === targetNode.parent_version_id);
          if (!baseNode || baseNode.id === targetNode.id) {
            baseNode = lin.nodes.find((n) => n.id !== targetNode.id) || lin.nodes[0];
          }
          if (baseNode.id === targetNode.id) {
            baseNode = lin.nodes[0];
            targetNode = lin.nodes[1];
          }
          setCompareBaseHash(baseNode.version_hash);
          setCompareTargetHash(targetNode.version_hash);
        } else if (lin.nodes.length === 1) {
          setCompareBaseHash(lin.nodes[0].version_hash);
          setCompareTargetHash(lin.nodes[0].version_hash);
        } else {
          setCompareBaseHash('');
          setCompareTargetHash('');
        }
      } else {
        setSelectedNodeId(null);
      }
    } catch (err) {
      console.error('Erreur chargement lineage/header:', err);
      setCompareResult(null);
      setRowDiffPage(null);
    } finally {
      setLoadingLineage(false);
    }
  };

  useEffect(() => {
    if (selectedDataset) {
      loadDatasetData(selectedDataset.id);
    }
  }, [selectedDataset?.id]);

  // Selected Node
  const selectedNode = useMemo(() => {
    if (!lineage || !selectedNodeId) return null;
    return lineage.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [lineage, selectedNodeId]);

  // 3. Load Guardrails & Views when selectedNode changes
  useEffect(() => {
    if (selectedNode) {
      api.getGuardrails(selectedNode.version_hash)
        .then((g) => setGuardrails(g))
        .catch((err) => console.error('Erreur guardrails:', err));

      loadViewCounts(selectedNode.version_hash, activeViewFilter);
    }
  }, [selectedNode?.version_hash]);

  const loadViewCounts = async (versionHash: string, filterMode: string) => {
    try {
      let queryParams: any = {};
      if (filterMode === 'real_only') queryParams.origin = 'real';
      else if (filterMode === 'smote') queryParams.origin = 'smote';
      else if (filterMode === 'train') queryParams.split = 'train';
      else if (filterMode === 'val') queryParams.split = 'val';
      else if (filterMode === 'test') queryParams.split = 'test';

      const res = await api.queryView(versionHash, queryParams);
      setViewInfo(res);
    } catch (err) {
      console.error('Erreur query view:', err);
    }
  };

  // 4. Run Version Comparison
  const runComparison = async (baseHash: string, targetHash: string, rowKeyOverride?: string) => {
    if (!baseHash || !targetHash) {
      setCompareResult(null);
      setRowDiffPage(null);
      return;
    }
    try {
      setLoadingCompare(true);
      const keyToUse = rowKeyOverride !== undefined ? rowKeyOverride : selectedRowKey;
      const res = await api.compareVersions(baseHash, targetHash, keyToUse || undefined);
      setCompareResult(res);
      if (res.row_key_used && !keyToUse) {
        setSelectedRowKey(res.row_key_used);
      }
      setDiffCurrentPage(1);
      loadRowDiff(baseHash, targetHash, diffFilter, 1, res.row_key_used || keyToUse || undefined);
    } catch (err) {
      console.error('Erreur compare:', err);
      setCompareResult(null);
      setRowDiffPage(null);
    } finally {
      setLoadingCompare(false);
    }
  };

  useEffect(() => {
    if (compareBaseHash && compareTargetHash) {
      runComparison(compareBaseHash, compareTargetHash);
    } else {
      setCompareResult(null);
      setRowDiffPage(null);
    }
  }, [compareBaseHash, compareTargetHash]);

  const loadRowDiff = async (
    baseHash: string,
    targetHash: string,
    filter: 'all' | 'added' | 'removed' | 'modified',
    page: number,
    rowKeyOverride?: string
  ) => {
    try {
      setLoadingDiff(true);
      const keyToUse = rowKeyOverride !== undefined ? rowKeyOverride : selectedRowKey;
      const res = await api.getRowDiff(baseHash, targetHash, filter, page, 10, keyToUse || undefined);
      setRowDiffPage(res);
      setDiffCurrentPage(page);
    } catch (err) {
      console.error('Erreur row diff:', err);
      setRowDiffPage(null);
    } finally {
      setLoadingDiff(false);
    }
  };

  const handleDiffFilterChange = (newFilter: 'all' | 'added' | 'removed' | 'modified') => {
    setDiffFilter(newFilter);
    if (compareBaseHash && compareTargetHash) {
      loadRowDiff(compareBaseHash, compareTargetHash, newFilter, 1);
    }
  };

  // Actions
  const handleRestore = async (node: LineageNode) => {
    try {
      await api.restoreVersion(node.version_hash);
      setActionMessage({ text: `Version ${node.version_label} restaurée comme version courante.`, type: 'success' });
      if (selectedDataset) loadDatasetData(selectedDataset.id);
    } catch (err: any) {
      setActionMessage({ text: err.response?.data?.detail || 'Erreur lors de la restauration.', type: 'error' });
    }
  };

  const handleCreateBranch = async () => {
    if (!selectedNode || !branchName.trim()) return;
    try {
      await api.branchFromVersion(selectedNode.version_hash, branchName.trim(), branchDesc.trim());
      setIsBranchModalOpen(false);
      setBranchName('');
      setBranchDesc('');
      setActionMessage({ text: `Branche ${branchName} créée avec succès.`, type: 'success' });
      if (selectedDataset) loadDatasetData(selectedDataset.id);
    } catch (err: any) {
      setActionMessage({ text: err.response?.data?.detail || 'Erreur lors de la création de branche.', type: 'error' });
    }
  };

  const handleAddTag = async (tag: string) => {
    if (!selectedNode || !tag.trim()) return;
    try {
      await api.addVersionTag(selectedNode.version_hash, tag.trim().toLowerCase());
      setNewTagInput('');
      setActionMessage({ text: `Étiquette '${tag}' ajoutée.`, type: 'success' });
      if (selectedDataset) loadDatasetData(selectedDataset.id);
    } catch (err: any) {
      setActionMessage({ text: err.response?.data?.detail || "Erreur lors de l'ajout d'étiquette.", type: 'error' });
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selectedNode) return;
    try {
      await api.removeVersionTag(selectedNode.version_hash, tag);
      setActionMessage({ text: `Étiquette '${tag}' retirée.`, type: 'success' });
      if (selectedDataset) loadDatasetData(selectedDataset.id);
    } catch (err: any) {
      setActionMessage({ text: err.response?.data?.detail || "Erreur lors du retrait d'étiquette.", type: 'error' });
    }
  };

  const handleDeleteVersion = async (node: LineageNode) => {
    if (!window.confirm(`Confirmez-vous la suppression de la version ${node.version_label} ?`)) {
      return;
    }
    try {
      await api.deleteVersion(node.version_hash);
      setActionMessage({ text: `Version ${node.version_label} supprimée avec succès.`, type: 'success' });
      if (selectedDataset) loadDatasetData(selectedDataset.id);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Suppression refusée.';
      setActionMessage({ text: msg, type: 'error' });
      alert(`Suppression refusée : ${msg}`);
    }
  };

  const handleReplayRecipe = async () => {
    if (!selectedNode || !replayFile) return;
    try {
      setIsReplaying(true);
      const res = await api.replayRecipe(selectedNode.version_hash, replayFile);
      setIsReplaying(false);
      setIsReplayModalOpen(false);
      setReplayFile(null);
      setActionMessage({
        text: `Rejouer réussi ! ${res.created_versions.length} version(s) créée(s) automatiquement.`,
        type: 'success',
      });
      if (selectedDataset) loadDatasetData(selectedDataset.id);
    } catch (err: any) {
      setIsReplaying(false);
      setActionMessage({
        text: err.response?.data?.detail || 'Erreur lors du rejeu de la recette.',
        type: 'error',
      });
    }
  };

  const handleExportDatasetCard = async () => {
    if (!selectedNode) return;
    try {
      const card = await api.getDatasetCard(selectedNode.version_hash);
      setDatasetCard(card);
      setIsCardModalOpen(true);
    } catch (err: any) {
      setActionMessage({ text: 'Impossible de générer la carte du dataset.', type: 'error' });
    }
  };

  // Listen to TopBar export dataset card event
  useEffect(() => {
    const handler = () => {
      handleExportDatasetCard();
    };
    window.addEventListener('datalift:export-dataset-card', handler);
    return () => window.removeEventListener('datalift:export-dataset-card', handler);
  }, [selectedNode?.version_hash]);

  const copyToClipboard = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper date formatter
  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } catch {
      return isoStr;
    }
  };

  const branchesCount = useMemo(() => {
    return lineage?.nodes.filter((n) => n.is_branch).length || 0;
  }, [lineage]);

  return (
    <div style={{ padding: '2rem 3rem 8rem 3rem', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
      {/* Toast Notification */}
      {actionMessage && (
        <div
          style={{
            position: 'fixed',
            top: '4.5rem',
            right: '2rem',
            zIndex: 9999,
            backgroundColor: actionMessage.type === 'success' ? '#14532d' : '#7f1d1d',
            color: '#f8fafc',
            border: `1px solid ${actionMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
            padding: '0.75rem 1.25rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          }}
        >
          {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: '0.5rem' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Breadcrumb line */}
      <div
        className="font-mono"
        style={{
          fontSize: '0.74rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}
      >
        <span>JEU DE DONNÉES</span>
        <span>•</span>
        <span>{headerMetrics?.version_count ?? lineage?.nodes.length ?? 0} VERSIONS</span>
        <span>•</span>
        <span>{branchesCount} BRANCHE(S)</span>
        <span>•</span>
        <span style={{ color: headerMetrics?.test_set_hash ? '#22c55e' : 'var(--text-muted)' }}>
          {headerMetrics?.test_set_hash ? 'JEU DE TEST VERROUILLÉ' : 'JEU DE TEST NON DÉFINI'}
        </span>
      </div>

      {/* Dataset Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1.5rem',
        }}
      >
        {/* Left: Dataset Name & selector */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h1
              className="font-serif"
              style={{
                fontSize: '3.2rem',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                color: 'var(--text-main)',
              }}
            >
              {selectedDataset?.name || 'Aucun jeu de données'}
            </h1>

            {/* Dataset switch dropdown */}
            {datasets.length > 1 && (
              <select
                value={selectedDataset?.id || ''}
                onChange={(e) => {
                  const target = datasets.find((d) => d.id === e.target.value);
                  if (target) {
                    setSelectedDataset(target);
                    setSearchParams({ dataset: target.id });
                  }
                }}
                className="font-mono"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => setIsUploadOpen(true)}
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', gap: '0.4rem' }}
            >
              <Upload size={13} />
              <span>Nouveau CSV</span>
            </button>
          </div>
        </div>

        {/* Right: Big golden current version block */}
        <div style={{ textAlign: 'right', minWidth: '180px' }}>
          {selectedNode?.is_baseline && (
            <div
              className="font-mono"
              style={{
                display: 'inline-block',
                border: '1px solid var(--amber)',
                color: 'var(--amber)',
                fontSize: '0.68rem',
                letterSpacing: '0.12em',
                padding: '0.15rem 0.5rem',
                borderRadius: '3px',
                marginBottom: '0.2rem',
                textTransform: 'uppercase',
              }}
            >
              RÉFÉRENCE (BASELINE)
            </div>
          )}
          <div
            className="font-serif"
            style={{
              fontSize: '4.2rem',
              fontWeight: 400,
              lineHeight: 1,
              color: 'var(--amber)',
              letterSpacing: '-0.02em',
            }}
          >
            {headerMetrics?.current_version_label || selectedNode?.version_label || 'v1'}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.68rem',
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              marginTop: '0.25rem',
            }}
          >
            VERSION COURANTE
          </div>
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          marginBottom: '3rem',
        }}
      >
        {/* VERSIONS */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            VERSIONS
          </div>
          <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem' }}>
            {headerMetrics?.version_count ?? lineage?.nodes.length ?? 0}
          </div>
          <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lineage?.nodes.map((n) => n.version_label).join(' • ') || 'Aucune version'}
          </div>
        </div>

        {/* STORED */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            STOCKÉ
          </div>
          <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem' }}>
            {headerMetrics?.total_stored_formatted || '0 Ko'}
          </div>
          <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {headerMetrics?.logical_size_formatted || '0 Ko'} logique • stockage réel
          </div>
        </div>

        {/* TEST SET HASH */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            HASH DU JEU DE TEST
          </div>
          <div className="font-mono" style={{ fontSize: '1.8rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: headerMetrics?.test_set_hash ? 'var(--text-main)' : 'var(--text-muted)' }}>
            {headerMetrics?.test_set_hash ? `${headerMetrics.test_set_hash.slice(0, 8)}...` : 'Non défini'}
          </div>
          <div className="font-mono" style={{ fontSize: '0.75rem', color: headerMetrics?.test_set_hash ? '#22c55e' : 'var(--text-muted)' }}>
            {headerMetrics?.test_set_status || 'Pas de split test'}
          </div>
        </div>

        {/* USED BY */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            UTILISÉ PAR
          </div>
          <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
            0 modèle
          </div>
          <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Sera alimenté par l'étape 06 Training
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. LINEAGE SECTION */}
      {/* ========================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400 }}>
            1 • Lignage
          </h2>
          <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            CLIQUER SUR UNE VERSION POUR L'OUVRIR
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(320px, 380px)', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left: DAG Graph Nodes + 3 Action Cards */}
          <div>
            <div
              className="card"
              style={{
                padding: '2rem 1.5rem',
                minHeight: '260px',
                display: 'flex',
                alignItems: 'center',
                overflowX: 'auto',
                position: 'relative',
              }}
            >
              {loadingLineage ? (
                <div style={{ width: '100%', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 0.75rem auto', color: 'var(--amber)' }} />
                  <p className="font-mono" style={{ fontSize: '0.8rem' }}>Chargement du graphe de lignage...</p>
                </div>
              ) : !lineage || lineage.nodes.length === 0 ? (
                <div style={{ width: '100%', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <Layers size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
                  <p>Aucune version trouvée pour ce jeu de données.</p>
                  <button onClick={() => setIsUploadOpen(true)} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                    <Upload size={14} />
                    Uploader un premier fichier CSV
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                  {lineage.nodes.map((node, idx) => {
                    const isSelected = selectedNodeId === node.id;
                    const edgeToNext = lineage.edges.find((e) => e.source_id === node.id);

                    return (
                      <React.Fragment key={node.id}>
                        {/* Node Card */}
                        <div
                          onClick={() => setSelectedNodeId(node.id)}
                          style={{
                            minWidth: '175px',
                            backgroundColor: isSelected ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                            border: isSelected ? '1px solid var(--amber)' : '1px solid var(--border)',
                            borderRadius: '8px',
                            padding: '1.1rem 1.15rem',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 0 15px rgba(245, 158, 11, 0.15)' : 'none',
                          }}
                        >
                          {/* Node Header: label + type */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span className="font-mono" style={{ fontSize: '0.74rem', color: isSelected ? 'var(--amber)' : 'var(--text-secondary)', fontWeight: 600 }}>
                              {node.version_label.toUpperCase()} • {(node.type_label || getNodeTypeLabel(node)).toUpperCase()}
                            </span>
                            {node.is_baseline && (
                              <span className="badge font-mono" style={{ fontSize: '0.62rem', border: '1px solid var(--amber)', color: 'var(--amber)', background: 'transparent' }}>
                                BASELINE
                              </span>
                            )}
                            {node.is_draft && (
                              <span className="badge font-mono" style={{ fontSize: '0.62rem', border: '1px solid #f97316', color: '#f97316', background: 'transparent' }}>
                                BROUILLON
                              </span>
                            )}
                          </div>

                          {/* Node Rows count & breakdown */}
                          <div className="font-serif" style={{ fontSize: '1.35rem', fontWeight: 500, marginBottom: '0.15rem' }}>
                            {node.row_count.toLocaleString('fr-FR')} lignes
                          </div>
                          {node.splits_breakdown && (
                            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--amber)', marginBottom: '0.35rem' }}>
                              {node.splits_breakdown}
                            </div>
                          )}

                          {/* Node Subtitle */}
                          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {node.is_draft && node.expires_at ? (
                              <span style={{ color: '#f97316' }}>Exp. dans 30 jours</span>
                            ) : (
                              <span>{formatDate(node.created_at)}</span>
                            )}
                          </div>
                        </div>

                        {/* Edge Connector to Next Node */}
                        {idx < lineage.nodes.length - 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.25rem' }}>
                            <div style={{ width: '20px', height: '1px', backgroundColor: 'var(--border)' }} />
                            <div
                              className="font-mono"
                              style={{
                                fontSize: '0.65rem',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border)',
                                borderRadius: '3px',
                                padding: '0.2rem 0.45rem',
                                whiteSpace: 'nowrap',
                                backgroundColor: 'var(--bg-main)',
                              }}
                            >
                              {edgeToNext?.label || 'ÉTAPE'}
                            </div>
                            <div style={{ width: '20px', height: '1px', backgroundColor: 'var(--border)' }} />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3 Explainer Sub-cards under the graph */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
              {/* REJOUER */}
              <div className="card" style={{ padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                    REJOUER
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '0.85rem' }}>
                    Nouveau fichier brut → mêmes recettes appliquées automatiquement, sans recliquer sur le Nettoyage.
                  </p>
                </div>
                <button
                  onClick={() => setIsReplayModalOpen(true)}
                  disabled={!selectedNode}
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.72rem', width: '100%', justifyContent: 'center', padding: '0.4rem' }}
                >
                  <Play size={12} />
                  Rejouer la recette...
                </button>
              </div>

              {/* BRANCHER */}
              <div className="card" style={{ padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                    BRANCHER
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '0.85rem' }}>
                    Tester un autre paramètre à côté de cette version ; les deux restent comparables sur le même test set.
                  </p>
                </div>
                <button
                  onClick={() => setIsBranchModalOpen(true)}
                  disabled={!selectedNode}
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.72rem', width: '100%', justifyContent: 'center', padding: '0.4rem' }}
                >
                  <GitBranch size={12} />
                  Créer une branche
                </button>
              </div>

              {/* RESTAURER */}
              <div className="card" style={{ padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                    RESTAURER
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '0.85rem' }}>
                    Rendre une ancienne version courante. Rien n'est supprimé, l'historique complet reste intact.
                  </p>
                </div>
                <button
                  onClick={() => selectedNode && handleRestore(selectedNode)}
                  disabled={!selectedNode || selectedNode.is_current}
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.72rem', width: '100%', justifyContent: 'center', padding: '0.4rem' }}
                >
                  <RotateCcw size={12} />
                  Définir comme courante
                </button>
              </div>
            </div>
          </div>

          {/* Right: Selected Version Details Panel */}
          <div className="card" style={{ padding: '1.5rem' }}>
            {selectedNode ? (
              <>
                {/* Panel Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 500 }}>
                    {selectedNode.version_label} • {(selectedNode.type_label || getNodeTypeLabel(selectedNode)).toLowerCase()}
                  </h3>
                  {selectedNode.is_baseline && (
                    <span className="badge font-mono" style={{ border: '1px solid var(--amber)', color: 'var(--amber)', background: 'transparent' }}>
                      BASELINE
                    </span>
                  )}
                </div>

                {/* Attributes Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>PARENT</span>
                    <span style={{ color: 'var(--text-main)' }}>
                      {lineage?.nodes.find((n) => n.id === selectedNode.parent_version_id)?.version_label || 'Aucun (racine)'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>RECETTE</span>
                    <span style={{ color: 'var(--text-main)' }}>{selectedNode.recipe_summary}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>GRAINE</span>
                    <span className="font-mono" style={{ color: 'var(--text-main)' }}>{selectedNode.seed ?? '—'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>CODE</span>
                    <span className="font-mono" style={{ color: 'var(--text-main)' }}>{selectedNode.code_version}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>DÉCOUPAGE</span>
                    <span className="font-mono" style={{ color: 'var(--text-main)' }}>{selectedNode.splits || 'Non découpé'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>CRÉÉ PAR</span>
                    <span style={{ color: 'var(--text-main)' }}>
                      {selectedNode.author} • {formatDate(selectedNode.created_at)}
                    </span>
                  </div>
                </div>

                {/* API Download URL Box */}
                <div
                  style={{
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '0.65rem 0.85rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                  }}
                >
                  <code className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--amber)', wordBreak: 'break-all' }}>
                    {selectedNode.api_download_url || `http://localhost:8000/api/v1/versions/${selectedNode.version_hash}/download?format=parquet`}
                  </code>
                  <button
                    onClick={() => copyToClipboard(selectedNode.api_download_url || `http://localhost:8000/api/v1/versions/${selectedNode.version_hash}/download?format=parquet`, setCopiedCli)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
                    title="Copier l'adresse de l'API de téléchargement"
                  >
                    {copiedCli ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                  </button>
                </div>

                {/* Actions Button Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button
                    onClick={() => handleRestore(selectedNode)}
                    disabled={selectedNode.is_current}
                    className="btn btn-secondary font-mono"
                    style={{ fontSize: '0.72rem', padding: '0.45rem', justifyContent: 'center' }}
                  >
                    Restaurer
                  </button>
                  <button
                    onClick={() => setIsBranchModalOpen(true)}
                    className="btn btn-secondary font-mono"
                    style={{ fontSize: '0.72rem', padding: '0.45rem', justifyContent: 'center' }}
                  >
                    Brancher...
                  </button>
                  <button
                    onClick={() => setIsTagModalOpen(true)}
                    className="btn btn-secondary font-mono"
                    style={{ fontSize: '0.72rem', padding: '0.45rem', justifyContent: 'center' }}
                  >
                    Étiqueter...
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                  <a
                    href={api.getDownloadUrl(selectedNode.version_hash)}
                    className="btn btn-secondary font-mono"
                    style={{ fontSize: '0.72rem', padding: '0.45rem', justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <Download size={12} />
                    Télécharger
                  </a>
                  <button
                    onClick={() => setInspectVersionHash(selectedNode.version_hash)}
                    className="btn btn-secondary font-mono"
                    style={{ fontSize: '0.72rem', padding: '0.45rem', justifyContent: 'center' }}
                  >
                    <Eye size={12} />
                    Inspecter
                  </button>
                  <button
                    onClick={() => handleDeleteVersion(selectedNode)}
                    className="btn font-mono"
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.45rem',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                      border: '1px solid #7f1d1d',
                      color: '#f87171',
                    }}
                  >
                    <Trash2 size={12} />
                    Supprimer
                  </button>
                </div>

                <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Formats : CSV • Parquet • JSONL
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                Sélectionnez une version dans le lignage pour inspecter ses paramètres.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. COMPARE SECTION */}
      {/* ========================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400 }}>
            2 • Comparer
          </h2>

          {/* Selectors FROM / TO / ROW KEY */}
          {lineage && lineage.nodes.length >= 2 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
              <span className="font-mono" style={{ color: 'var(--text-muted)' }}>DE</span>
              <select
                value={compareBaseHash}
                onChange={(e) => setCompareBaseHash(e.target.value)}
                className="font-mono"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                }}
              >
                {lineage.nodes.map((n) => (
                  <option key={n.id} value={n.version_hash}>
                    {n.version_label} • {(n.type_label || getNodeTypeLabel(n)).toLowerCase()}
                  </option>
                ))}
              </select>

              <span className="font-mono" style={{ color: 'var(--text-muted)' }}>À</span>
              <select
                value={compareTargetHash}
                onChange={(e) => setCompareTargetHash(e.target.value)}
                className="font-mono"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                }}
              >
                {lineage.nodes.map((n) => (
                  <option key={n.id} value={n.version_hash}>
                    {n.version_label} • {(n.type_label || getNodeTypeLabel(n)).toLowerCase()}
                  </option>
                ))}
              </select>

              <span className="font-mono" style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>CLÉ DE LIGNE</span>
              <select
                value={selectedRowKey || compareResult?.row_key_used || 'none'}
                onChange={(e) => {
                  const newKey = e.target.value;
                  setSelectedRowKey(newKey);
                  if (compareBaseHash && compareTargetHash) {
                    runComparison(compareBaseHash, compareTargetHash, newKey);
                  }
                }}
                className="font-mono"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--amber)',
                  border: '1px solid var(--border)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                }}
              >
                {(compareResult?.available_keys && compareResult.available_keys.length > 0
                  ? compareResult.available_keys
                  : (compareResult?.row_key_used && compareResult.row_key_used !== 'none' ? [compareResult.row_key_used] : [])
                ).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
                <option value="none">Aucune (par empreinte)</option>
              </select>
            </div>
          ) : (
            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              1 seule version enregistrée
            </div>
          )}
        </div>

        {loadingCompare ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 0.75rem auto', color: 'var(--amber)' }} />
            <p className="font-mono" style={{ fontSize: '0.8rem' }}>Calcul de la comparaison différentielle...</p>
          </div>
        ) : compareResult ? (
          <>
            {/* 4 Summary Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              {/* AJOUTÉES */}
              <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  AJOUTÉES
                </div>
                <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: '#22c55e' }}>
                  +{compareResult.added_count.toLocaleString('fr-FR')}
                </div>
                <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {compareResult.added_summary}
                </div>
              </div>

              {/* RETIRÉES */}
              <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  RETIRÉES
                </div>
                <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: '#ef4444' }}>
                  -{compareResult.removed_count.toLocaleString('fr-FR')}
                </div>
                <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {compareResult.removed_summary}
                </div>
              </div>

              {/* TARGET CLASS EVOLUTION */}
              <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  {compareResult.target_column ? `${compareResult.target_column.toUpperCase()} • ÉVOLUTION` : 'CIBLE'}
                </div>
                <div className="font-serif" style={{ fontSize: '2.2rem', fontWeight: 500, lineHeight: 1.1, marginBottom: '0.35rem', color: 'var(--amber)' }}>
                  {compareResult.target_evolution || '—'}
                </div>
                <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {compareResult.target_evolution_details || 'train split • val / test inchangés'}
                </div>
              </div>

              {/* TEST SET */}
              <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  JEU DE TEST
                </div>
                <div
                  className="font-serif"
                  style={{
                    fontSize: '2.2rem',
                    fontWeight: 500,
                    lineHeight: 1.1,
                    marginBottom: '0.35rem',
                    color: compareResult.test_set_status === 'identical' ? '#22c55e' : compareResult.test_set_status === 'not_applicable' ? 'var(--text-muted)' : '#ef4444',
                  }}
                >
                  {compareResult.test_set_status === 'identical' ? '✓ identique' : compareResult.test_set_status === 'not_applicable' ? '— non applicable' : '⚠️ modifié'}
                </div>
                <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {compareResult.test_set_message}
                </div>
              </div>
            </div>

            {/* Cell Modifications Summary if any */}
            {compareResult.cells_modified_detail && (
              <div
                className="card"
                style={{
                  padding: '0.85rem 1.25rem',
                  marginBottom: '1.5rem',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <span className="font-mono" style={{ fontSize: '0.72rem', color: '#38bdf8', letterSpacing: '0.08em', fontWeight: 600 }}>
                  MODIFICATIONS CELLULES :
                </span>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                  {compareResult.cells_modified_detail}
                </span>
              </div>
            )}

            {/* Split 2 Columns: Distribution Shift vs Row Diff */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Left: Distribution shift */}
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
                  <h3 className="font-serif" style={{ fontSize: '1.35rem', fontWeight: 400 }}>
                    Décalage des distributions
                  </h3>
                  <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {compareResult.distribution_shifts_title || `TRAIN • ${compareResult.base_version_label} → ${compareResult.target_version_label}`}
                  </span>
                </div>

                <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th className="font-mono" style={{ padding: '0.5rem 0.5rem 0.5rem 0', fontWeight: 500 }}>COLONNE</th>
                        <th className="font-mono" style={{ padding: '0.5rem', fontWeight: 500 }}>{compareResult.base_version_label}</th>
                        <th className="font-mono" style={{ padding: '0.5rem', fontWeight: 500 }}>{compareResult.target_version_label}</th>
                        <th className="font-mono" style={{ padding: '0.5rem 0 0.5rem 0.5rem', fontWeight: 500 }}>DÉCALAGE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareResult.distribution_shifts.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Aucun décalage de distribution détecté.
                          </td>
                        </tr>
                      ) : (
                        compareResult.distribution_shifts.map((item) => {
                          const levelColor =
                            item.shift_level === 'HIGH' ? '#f59e0b' : item.shift_level === 'MEDIUM' ? '#38bdf8' : '#71717a';
                          const barWidth =
                            item.shift_level === 'HIGH' ? '85%' : item.shift_level === 'MEDIUM' ? '50%' : item.shift_level === 'LOW' ? '25%' : '8%';

                          return (
                            <tr key={item.column} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td className="font-mono" style={{ padding: '0.65rem 0.5rem 0.65rem 0', color: 'var(--text-main)' }}>
                                {item.column}
                              </td>
                              <td className="font-mono" style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)' }}>
                                {String(item.val_before)}
                              </td>
                              <td className="font-mono" style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)' }}>
                                {String(item.val_after)}
                              </td>
                              <td style={{ padding: '0.65rem 0 0.65rem 0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ width: barWidth, height: '100%', backgroundColor: levelColor, borderRadius: '2px' }} />
                                  </div>
                                  <span className="font-mono" style={{ fontSize: '0.68rem', color: levelColor, minWidth: '45px' }}>
                                    {item.shift_level}
                                  </span>
                                  {item.is_expected && (
                                    <span
                                      className="font-mono"
                                      style={{
                                        fontSize: '0.62rem',
                                        color: '#22c55e',
                                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                        padding: '0.1rem 0.35rem',
                                        borderRadius: '3px',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      attendu
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Les décalages attendus proviennent de la recette (équilibre cible). Les décalages inattendus sont signalés avant d'étiqueter une version.
                </p>
              </div>

              {/* Right: Row diff */}
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 className="font-serif" style={{ fontSize: '1.35rem', fontWeight: 400 }}>
                    Différences de lignes (Row diff)
                  </h3>

                  {/* Filter tabs */}
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {(['all', 'added', 'removed', 'modified'] as const).map((filter) => {
                      const count = rowDiffPage ? rowDiffPage.counts[filter] : 0;
                      const active = diffFilter === filter;
                      const label = filter === 'all' ? 'Tout' : filter === 'added' ? 'Ajoutées' : filter === 'removed' ? 'Retirées' : 'Modifiées';
                      return (
                        <button
                          key={filter}
                          onClick={() => handleDiffFilterChange(filter)}
                          className="font-mono"
                          style={{
                            backgroundColor: active ? 'var(--amber-bg)' : 'transparent',
                            border: active ? '1px solid var(--amber)' : '1px solid var(--border)',
                            color: active ? 'var(--amber)' : 'var(--text-muted)',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '4px',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                          }}
                        >
                          {label} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {loadingDiff ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    <RefreshCw className="animate-spin" size={18} style={{ margin: '0 auto 0.5rem auto' }} />
                    <span className="font-mono" style={{ fontSize: '0.75rem' }}>Chargement des lignes...</span>
                  </div>
                ) : !rowDiffPage || rowDiffPage.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {compareBaseHash === compareTargetHash
                      ? `✓ Versions identiques (${compareResult.base_version_label} = ${compareResult.target_version_label}) : 0 différence.`
                      : 'Aucune différence correspondant au filtre.'}
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th className="font-mono" style={{ padding: '0.45rem 0.5rem 0.45rem 0', fontWeight: 500 }}>MODIF</th>
                            <th className="font-mono" style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>LIGNE</th>
                            <th className="font-mono" style={{ padding: '0.45rem 0 0.45rem 0.5rem', fontWeight: 500 }}>DÉTAIL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowDiffPage.items.map((row, idx) => {
                            const changeColor = row.change === 'added' ? '#22c55e' : row.change === 'removed' ? '#ef4444' : '#38bdf8';
                            const changePrefix = row.change === 'added' ? '+ ajoutée' : row.change === 'removed' ? '- retirée' : '~ modifiée';

                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <td className="font-mono" style={{ padding: '0.55rem 0.5rem 0.55rem 0', color: changeColor, whiteSpace: 'nowrap' }}>
                                  {changePrefix}
                                </td>
                                <td className="font-mono" style={{ padding: '0.55rem 0.5rem', color: 'var(--text-secondary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.row_id}
                                </td>
                                <td className="font-mono" style={{ padding: '0.55rem 0 0.55rem 0.5rem', color: 'var(--text-main)', fontSize: '0.74rem' }}>
                                  {row.detail}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>
                        Page {rowDiffPage.page} sur {Math.max(1, Math.ceil(rowDiffPage.total / rowDiffPage.page_size))} ({rowDiffPage.total} lignes)
                      </span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          disabled={diffCurrentPage <= 1}
                          onClick={() => loadRowDiff(compareBaseHash, compareTargetHash, diffFilter, diffCurrentPage - 1)}
                          className="btn btn-secondary font-mono"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                        >
                          Précédent
                        </button>
                        <button
                          disabled={diffCurrentPage * rowDiffPage.page_size >= rowDiffPage.total}
                          onClick={() => loadRowDiff(compareBaseHash, compareTargetHash, diffFilter, diffCurrentPage + 1)}
                          className="btn btn-secondary font-mono"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                        >
                          Suivant
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: '1rem' }}>
                  Différences mot à mot calculées sur la clé de ligne{' '}
                  <code className="font-mono" style={{ color: 'var(--amber)' }}>
                    {compareResult.row_key_used || 'empreinte SHA-256'}
                  </code>
                  .
                </p>
              </div>
            </div>
          </>
        ) : lineage && lineage.nodes.length < 2 ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p className="font-serif" style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              Une seule version disponible ({lineage.nodes[0]?.version_label || 'v1'} • brute)
            </p>
            <p className="font-mono" style={{ fontSize: '0.8rem', maxWidth: '540px', margin: '0 auto', color: 'var(--text-secondary)' }}>
              La comparaison nécessite au moins deux versions. Créez une nouvelle version via le Nettoyage (Étape 02) ou l'Augmentation (Étape 03) pour observer les différences et décalages ici.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Sélectionnez deux versions ci-dessus pour lancer la comparaison différentielle.
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* 3. VIEWS & 4. USED BY SECTION */}
      {/* ========================================================= */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '3.5rem' }}>
        {/* Left: 3 • Views */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
            <h2 className="font-serif" style={{ fontSize: '1.65rem', fontWeight: 400 }}>
              3 • Vues
            </h2>
            <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              SANS COPIE • SANS NOUVELLE VERSION
            </span>
          </div>

          {/* Filter Pills with live counts */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {[
              { id: 'all', label: `Tout • ${viewInfo?.counts.all ?? 0}` },
              { id: 'real_only', label: `Réel seulement • ${viewInfo?.counts.real_only ?? 0}` },
              { id: 'smote', label: `origin = smote • ${viewInfo?.counts.synthetic ?? 0}` },
              { id: 'train', label: `Train • ${viewInfo?.counts.train ?? 0}` },
              { id: 'val', label: `Val • ${viewInfo?.counts.val ?? 0}` },
              { id: 'test', label: `Test • ${viewInfo?.counts.test ?? 0}` },
            ].map((pill) => {
              const active = activeViewFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => {
                    setActiveViewFilter(pill.id);
                    if (selectedNode) loadViewCounts(selectedNode.version_hash, pill.id);
                  }}
                  className="font-mono"
                  style={{
                    backgroundColor: active ? 'var(--amber-bg)' : 'var(--bg-main)',
                    border: active ? '1px solid var(--amber)' : '1px solid var(--border)',
                    color: active ? 'var(--amber)' : 'var(--text-secondary)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                  }}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Une vue peut être téléchargée ou interrogée via l'API comme une version :
          </p>

          {/* API URL snippet box */}
          <div
            style={{
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              gap: '0.5rem',
            }}
          >
            <code className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--amber)', wordBreak: 'break-all' }}>
              {viewInfo?.api_url || (selectedNode ? `http://localhost:8000/api/v1/versions/${selectedNode.version_hash}/views/query` : '')}
            </code>
            <button
              onClick={() => copyToClipboard(viewInfo?.api_url || '', setCopiedViewCli)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
              title="Copier l'URL d'API de la vue"
            >
              {copiedViewCli ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
            </button>
          </div>

          {/* Download View options */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <a
              href={selectedNode ? api.getViewDownloadUrl(selectedNode.version_hash, 'csv', activeViewFilter === 'real_only' ? { origin: 'real' } : activeViewFilter === 'smote' ? { origin: 'smote' } : activeViewFilter === 'train' ? { split: 'train' } : activeViewFilter === 'val' ? { split: 'val' } : activeViewFilter === 'test' ? { split: 'test' } : undefined) : '#'}
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.72rem', padding: '0.35rem 0.75rem', textDecoration: 'none' }}
            >
              <Download size={12} />
              Télécharger CSV
            </a>
            <a
              href={selectedNode ? api.getViewDownloadUrl(selectedNode.version_hash, 'parquet', activeViewFilter === 'real_only' ? { origin: 'real' } : activeViewFilter === 'smote' ? { origin: 'smote' } : activeViewFilter === 'train' ? { split: 'train' } : activeViewFilter === 'val' ? { split: 'val' } : activeViewFilter === 'test' ? { split: 'test' } : undefined) : '#'}
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.72rem', padding: '0.35rem 0.75rem', textDecoration: 'none' }}
            >
              <Download size={12} />
              Parquet
            </a>
            <a
              href={selectedNode ? api.getViewDownloadUrl(selectedNode.version_hash, 'jsonl', activeViewFilter === 'real_only' ? { origin: 'real' } : activeViewFilter === 'smote' ? { origin: 'smote' } : activeViewFilter === 'train' ? { split: 'train' } : activeViewFilter === 'val' ? { split: 'val' } : activeViewFilter === 'test' ? { split: 'test' } : undefined) : '#'}
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.72rem', padding: '0.35rem 0.75rem', textDecoration: 'none' }}
            >
              <Download size={12} />
              JSONL
            </a>
          </div>
        </div>

        {/* Right: 4 • Used by */}
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
            <h2 className="font-serif" style={{ fontSize: '1.65rem', fontWeight: 400 }}>
              4 • Utilisé par
            </h2>
            <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              LIÉ DEPUIS L'ÉTAPE 06 TRAINING
            </span>
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '2rem 1.5rem',
              border: '1px dashed var(--border)',
              borderRadius: '6px',
            }}
          >
            <Sparkles size={28} style={{ color: 'var(--amber)', opacity: 0.5, marginBottom: '0.75rem' }} />
            <h4 className="font-serif" style={{ fontSize: '1.15rem', fontWeight: 500, marginBottom: '0.35rem' }}>
              Aucun modèle lié
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
              Ce registre sera automatiquement alimenté lors de l'entraînement de modèles dans l'Étape 06 Training.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. GUARDRALLS SECTION */}
      {/* ========================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2 className="font-serif" style={{ fontSize: '1.85rem', fontWeight: 400 }}>
            Garde-fous
          </h2>
          <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            VÉRIFIÉ AVANT CHAQUE ÉTIQUETAGE OU SUPPRESSION
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {guardrails.map((g) => {
            const isPassed = g.status === 'passed';
            const isWarning = g.status === 'warning';

            const iconColor = isPassed ? '#22c55e' : isWarning ? '#f97316' : '#71717a';
            const badgeLabel = isPassed ? 'Conforme' : isWarning ? 'Attention' : 'Non évalué';

            return (
              <div key={g.id} className="card" style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ marginTop: '0.15rem' }}>
                    {isPassed ? (
                      <CheckCircle2 size={18} color="#22c55e" />
                    ) : isWarning ? (
                      <AlertTriangle size={18} color="#f97316" />
                    ) : (
                      <div className="font-mono" style={{ fontSize: '1.1rem', color: '#71717a', lineHeight: 1 }}>—</div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-main)' }}>
                        {g.name}
                      </h4>
                      <span className="font-mono" style={{ fontSize: '0.65rem', color: iconColor }}>
                        {badgeLabel}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {g.message}
                    </p>
                    {g.detail && (
                      <p className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        {g.detail}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. STICKY BOTTOM BAR */}
      {/* ========================================================= */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '250px',
          right: 0,
          backgroundColor: 'var(--bg-sidebar)',
          borderTop: '1px solid var(--border)',
          padding: '1rem 3rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
          boxShadow: '0 -10px 25px rgba(0,0,0,0.5)',
        }}
      >
        {/* Left summary */}
        <div>
          <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
            {selectedNode?.version_label || 'v1'} • {selectedNode?.recipe_summary || 'Ingestion'} • {selectedNode?.splits || 'Non découpé'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Carte du dataset prête : sources, recettes, distributions, part synthétique.
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => selectedNode && handleAddTag('production')}
            className="btn btn-secondary font-mono"
            style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
          >
            <Tag size={13} />
            Étiqueter en production
          </button>
          <button
            onClick={handleExportDatasetCard}
            className="btn btn-secondary font-mono"
            style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
          >
            <FileText size={13} />
            Exporter la carte du dataset
          </button>
          <button
            onClick={() => navigate('/labeling')}
            className="btn btn-primary font-mono"
            style={{ fontSize: '0.78rem', padding: '0.45rem 1.15rem' }}
          >
            <span>Continuer vers le labeling</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}

      {/* 1. Branch Modal */}
      {isBranchModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <GitBranch size={18} color="var(--amber)" />
                <h3 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                  Brancher depuis {selectedNode?.version_label}
                </h3>
              </div>
              <button onClick={() => setIsBranchModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.4 }}>
                Crée une version brouillon liée à cette version pour tester une variation de paramètres sans impacter la branche principale.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label className="font-mono" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  NOM DE LA BRANCHE *
                </label>
                <input
                  type="text"
                  placeholder="ex: exp-smote-50-percent"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '0.5rem 0.75rem',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="font-mono" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  DESCRIPTION
                </label>
                <textarea
                  placeholder="ex: Test avec 50% de synthétique au lieu de 30%"
                  value={branchDesc}
                  onChange={(e) => setBranchDesc(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '0.5rem 0.75rem',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-main)', borderRadius: '4px', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                <Clock size={16} color="#f97316" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Cette version sera étiquetée <strong>brouillon</strong> avec une date d'expiration à 30 jours sans utilisation.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button onClick={() => setIsBranchModalOpen(false)} className="btn btn-secondary">
                  Annuler
                </button>
                <button onClick={handleCreateBranch} disabled={!branchName.trim()} className="btn btn-primary">
                  Créer la branche
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Replay Modal */}
      {isReplayModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Play size={18} color="var(--amber)" />
                <h3 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                  Rejouer la chaîne de recettes sur un nouveau fichier
                </h3>
              </div>
              <button onClick={() => setIsReplayModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.4 }}>
                Sélectionnez un nouveau fichier brut CSV. Le système réappliquera automatiquement l'intégralité des recettes enregistrées jusqu'à{' '}
                <strong>{selectedNode?.version_label}</strong> ({selectedNode?.recipe_summary}).
              </p>

              <div
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: '6px',
                  padding: '2rem 1.5rem',
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  backgroundColor: 'var(--bg-main)',
                }}
              >
                <input
                  type="file"
                  id="replayFileInput"
                  accept=".csv,.tsv,.txt"
                  onChange={(e) => e.target.files && setReplayFile(e.target.files[0])}
                  style={{ display: 'none' }}
                />
                <label htmlFor="replayFileInput" style={{ cursor: 'pointer' }}>
                  <Upload size={24} style={{ color: 'var(--amber)', margin: '0 auto 0.75rem auto' }} />
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    {replayFile ? replayFile.name : 'Choisir un fichier CSV brut'}
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {replayFile ? `${(replayFile.size / 1024).toFixed(1)} Ko` : 'Cliquez pour parcourir vos fichiers'}
                  </div>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button onClick={() => setIsReplayModalOpen(false)} className="btn btn-secondary">
                  Annuler
                </button>
                <button
                  onClick={handleReplayRecipe}
                  disabled={!replayFile || isReplaying}
                  className="btn btn-primary"
                >
                  {isReplaying ? (
                    <>
                      <RefreshCw className="animate-spin" size={14} />
                      Exécution du rejeu...
                    </>
                  ) : (
                    'Lancer le rejeu'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Tag Modal */}
      {isTagModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Tag size={18} color="var(--amber)" />
                <h3 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                  Étiquettes de {selectedNode?.version_label}
                </h3>
              </div>
              <button onClick={() => setIsTagModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Les étiquettes sont mutables et permettent d'identifier les versions clés sans altérer les données immuables.
              </p>

              {/* Quick tags */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button
                  onClick={() => handleAddTag('production')}
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.72rem', flex: 1, justifyContent: 'center' }}
                >
                  + production
                </button>
                <button
                  onClick={() => handleAddTag('baseline')}
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.72rem', flex: 1, justifyContent: 'center' }}
                >
                  + baseline
                </button>
                <button
                  onClick={() => handleAddTag('archived')}
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.72rem', flex: 1, justifyContent: 'center' }}
                >
                  + archived
                </button>
              </div>

              {/* Custom tag input */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <input
                  type="text"
                  placeholder="Nouvelle étiquette personnalisée..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag(newTagInput)}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '0.45rem 0.75rem',
                    color: 'var(--text-main)',
                    fontSize: '0.82rem',
                  }}
                />
                <button
                  onClick={() => handleAddTag(newTagInput)}
                  disabled={!newTagInput.trim()}
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 0.85rem' }}
                >
                  Ajouter
                </button>
              </div>

              {/* Current tags list */}
              <div>
                <label className="font-mono" style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  ÉTIQUETTES ACTUELLES
                </label>
                {selectedNode?.tags && selectedNode.tags.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {selectedNode.tags.map((t) => (
                      <span
                        key={t}
                        className="font-mono"
                        style={{
                          backgroundColor: 'var(--bg-main)',
                          border: '1px solid var(--border)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        {t}
                        <button
                          onClick={() => handleRemoveTag(t)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Aucune étiquette associée.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Dataset Card Modal */}
      {isCardModalOpen && datasetCard && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '840px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <FileText size={18} color="var(--amber)" />
                <h3 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                  Carte du Dataset • {selectedNode?.version_label}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--bg-main)', padding: '0.2rem', borderRadius: '4px' }}>
                  <button
                    onClick={() => setCardModalTab('markdown')}
                    className="font-mono"
                    style={{
                      background: cardModalTab === 'markdown' ? 'var(--bg-surface)' : 'transparent',
                      border: 'none',
                      color: cardModalTab === 'markdown' ? 'var(--amber)' : 'var(--text-muted)',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '3px',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Markdown
                  </button>
                  <button
                    onClick={() => setCardModalTab('json')}
                    className="font-mono"
                    style={{
                      background: cardModalTab === 'json' ? 'var(--bg-surface)' : 'transparent',
                      border: 'none',
                      color: cardModalTab === 'json' ? 'var(--amber)' : 'var(--text-muted)',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '3px',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    JSON
                  </button>
                </div>
                <button onClick={() => setIsCardModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div style={{ padding: '1.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
              <pre
                className="font-mono"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  padding: '1.25rem',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--text-main)',
                }}
              >
                {cardModalTab === 'markdown' ? datasetCard.markdown : JSON.stringify(datasetCard.json_data, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() =>
                  copyToClipboard(
                    cardModalTab === 'markdown' ? datasetCard.markdown : JSON.stringify(datasetCard.json_data, null, 2),
                    setCopiedCard
                  )
                }
                className="btn btn-secondary font-mono"
                style={{ fontSize: '0.75rem' }}
              >
                {copiedCard ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                Copier
              </button>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => downloadFile(datasetCard.markdown, `dataset-card-${selectedNode?.version_label}.md`, 'text/markdown')}
                  className="btn btn-secondary font-mono"
                  style={{ fontSize: '0.75rem' }}
                >
                  <Download size={13} />
                  Télécharger .md
                </button>
                <button
                  onClick={() =>
                    downloadFile(
                      JSON.stringify(datasetCard.json_data, null, 2),
                      `dataset-card-${selectedNode?.version_label}.json`,
                      'application/json'
                    )
                  }
                  className="btn btn-primary font-mono"
                  style={{ fontSize: '0.75rem' }}
                >
                  <Download size={13} />
                  Télécharger .json
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Upload CSV Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        datasets={datasets}
        selectedDatasetId={selectedDataset?.id}
        onSuccess={async (newId) => {
          setIsUploadOpen(false);
          const list = await api.getDatasets();
          setDatasets(list);
          const target = list.find((d) => d.id === newId) || list.find((d) => d.id === selectedDataset?.id) || list[0];
          if (target) {
            setSelectedDataset(target);
            setSearchParams({ dataset: target.id });
            loadDatasetData(target.id);
          }
        }}
      />

      {/* 6. Parquet Inspection Modal */}
      <DataPreviewModal
        versionHash={inspectVersionHash}
        onClose={() => setInspectVersionHash(null)}
      />
    </div>
  );
};
