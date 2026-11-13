import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, X, Play, Copy, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { Dataset, ImageTrainingDataResponse } from '../types';

const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardElevated: '#16171b',
  border: '#1e2025',
  borderLight: '#2a2d35',
  text: '#e1e4ea',
  textMuted: '#6b7280',
  textFaint: '#4b5563',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  amberBg: 'rgba(245, 158, 11, 0.08)',
  amberBorder: 'rgba(245, 158, 11, 0.35)',
  blue: '#3b82f6',
  blueBg: 'rgba(59, 130, 246, 0.15)',
  green: '#22c55e',
  red: '#ef4444',
};

export const ImageTrainingPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<ImageTrainingDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & selections
  const [runFilter, setRunFilter] = useState<'all' | 'running' | 'done'>('all');
  const [selectedRunId, setSelectedRunId] = useState<string>('yolo-defects-v4');
  const [selectedSplit, setSelectedSplit] = useState<string>('val · 1,560 images');
  const [errorFilter, setErrorFilter] = useState<string>('all');

  // Interactive Form State (Section 1)
  const [selectedDatasetVersion, setSelectedDatasetVersion] = useState<string>('defects@v4 · current');
  const [selectedTrainView, setSelectedTrainView] = useState<string>('Real + copy-paste · train split only');
  const [augmentations, setAugmentations] = useState<Record<string, boolean>>({
    hflip: true,
    scale: true,
    bright: true,
    mosaic: true,
    vflip: false,
    mixup: false,
  });
  const [architecture, setArchitecture] = useState<string>('YOLO11-s · COCO pretrained');
  const [epochs, setEpochs] = useState<number>(120);
  const [patience, setPatience] = useState<number>(20);
  const [batch, setBatch] = useState<number>(16);
  const [lr0, setLr0] = useState<string>('0.01');
  const [optimize, setOptimize] = useState<string>('mAP@50 · all classes');
  const [runsOn, setRunsOn] = useState<string>('Line mini PC · CPU · OpenVINO');
  const [latencyBudget, setLatencyBudget] = useState<string>('≤ 120 ms per frame');
  const [worker, setWorker] = useState<string>('1 x [GPU TYPE]');
  const [precision, setPrecision] = useState<string>('Mixed · fp16');

  // Sliders in Section 3 Evaluate
  const [confAll, setConfAll] = useState<number>(0.35);
  const [confCrack, setConfCrack] = useState<number>(0.25);
  const [nmsIou, setNmsIou] = useState<number>(0.60);

  // Compare selection (Section 2)
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>(['yolo-defects-v4', 'yolo-defects-v3']);

  // Modals & Feedback
  const [notification, setNotification] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);
  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [showShadowModal, setShowShadowModal] = useState<boolean>(false);
  const [selectedErrorForModal, setSelectedErrorForModal] = useState<any | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Load image datasets on mount
  useEffect(() => {
    async function loadDatasets() {
      try {
        const list = await api.getDatasets();
        const imageDatasets = list.filter((d) => {
          const name = d.name.toLowerCase();
          return (
            name.includes('defect') ||
            name.includes('product') ||
            name.includes('image') ||
            name.includes('photo') ||
            name.includes('vision') ||
            name.includes('yolo') ||
            name.includes('coco') ||
            name.endsWith('.zip') ||
            name.endsWith('/')
          );
        });
        const usableList = imageDatasets.length > 0 ? imageDatasets : list;
        setDatasets(usableList);

        const preferred =
          usableList.find((d) => d.name.toLowerCase().includes('defect') || d.name.toLowerCase().includes('product')) ||
          usableList[0];
        if (preferred) {
          setSelectedDatasetId(preferred.id);
        }
      } catch (err: any) {
        setError('Erreur de chargement des jeux de données: ' + (err.message || 'inconnu'));
      }
    }
    loadDatasets();
  }, []);

  // Fetch training data when dataset, filter or selected run changes
  const fetchData = useCallback(
    async (datasetId: string, filter: string, runId?: string) => {
      if (!datasetId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getImageTrainingData(datasetId, filter, runId);
        setData(res);
        if (res.new_run_config) {
          setSelectedDatasetVersion(res.new_run_config.dataset_version);
          setSelectedTrainView(res.new_run_config.train_view);
          setArchitecture(res.new_run_config.model_architecture);
          setEpochs(res.new_run_config.epochs);
          setPatience(res.new_run_config.patience);
          setBatch(res.new_run_config.batch);
          setLr0(res.new_run_config.lr0);
          setOptimize(res.new_run_config.optimize);
          setRunsOn(res.new_run_config.runs_on);
          setLatencyBudget(res.new_run_config.latency_budget);
          if (res.new_run_config.compute) {
            setWorker(res.new_run_config.compute.worker);
            setPrecision(res.new_run_config.compute.precision);
          }
          if (res.new_run_config.on_the_fly_augmentation) {
            const augMap: Record<string, boolean> = {};
            res.new_run_config.on_the_fly_augmentation.forEach((a) => {
              augMap[a.id] = a.checked;
            });
            setAugmentations(augMap);
          }
        }
        if (res.evaluate) {
          setSelectedRunId(res.evaluate.selected_run);
          setSelectedSplit(res.evaluate.selected_split);
          if (res.evaluate.deployment_thresholds) {
            setConfAll(res.evaluate.deployment_thresholds.confidence_all);
            setConfCrack(res.evaluate.deployment_thresholds.confidence_crack);
            setNmsIou(res.evaluate.deployment_thresholds.nms_iou);
          }
        }
      } catch (err: any) {
        setError('Impossible de charger les données d\'entraînement: ' + (err.message || 'inconnu'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedDatasetId) {
      fetchData(selectedDatasetId, runFilter, selectedRunId);
    }
  }, [selectedDatasetId, runFilter, fetchData]);

  const handleDatasetChange = (newId: string) => {
    setSelectedDatasetId(newId);
  };

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const handleStartRun = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.startImageTrainingRun(selectedDatasetId, {
        architecture,
        epochs,
        patience,
        batch,
        lr0,
        optimize,
        runsOn,
        augmentations,
      });
      setNotification(`✓ ${res.message || 'Entraînement lancé avec succès !'}`);
      setTimeout(() => setNotification(null), 4000);
      fetchData(selectedDatasetId, runFilter, selectedRunId);
    } catch (err: any) {
      setError('Erreur au lancement: ' + (err.message || 'inconnu'));
    }
  };

  const handleStartShadow = async () => {
    if (!selectedDatasetId) return;
    try {
      const res = await api.startImageShadowMode(selectedDatasetId, {
        device: 'Line 2 mini PC',
      });
      setNotification(`✓ ${res.message || 'Shadow mode activé'}`);
      setShowShadowModal(false);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setError('Erreur shadow mode: ' + (err.message || 'inconnu'));
    }
  };

  // Dynamic calculations based on threshold sliders
  const calculatedFalseAlarms = useMemo(() => {
    const base = 12;
    const delta = Math.round((0.35 - confAll) * 30);
    return Math.max(2, base + delta);
  }, [confAll]);

  const calculatedMissedCracks = useMemo(() => {
    const base = 2;
    const delta = Math.round((confCrack - 0.25) * 12);
    return Math.max(0, base + delta);
  }, [confCrack]);

  // Filtered errors
  const filteredErrors = useMemo(() => {
    if (!data?.evaluate?.errors_to_look_at) return [];
    if (errorFilter === 'all') return data.evaluate.errors_to_look_at;
    if (errorFilter === 'missed') return data.evaluate.errors_to_look_at.filter((e) => e.tag === 'MISSED');
    if (errorFilter === 'false_alarm') return data.evaluate.errors_to_look_at.filter((e) => e.tag === 'FALSE ALARM');
    if (errorFilter === 'wrong_class') return data.evaluate.errors_to_look_at.filter((e) => e.tag === 'WRONG CLASS');
    if (errorFilter === 'loose_box') return data.evaluate.errors_to_look_at.filter((e) => e.tag === 'LOOSE BOX');
    return data.evaluate.errors_to_look_at;
  }, [data, errorFilter]);

  if (loading && !data) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontFamily: 'monospace' }}>
        <span>Chargement du pipeline d'entraînement YOLO...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '3rem', color: C.red, fontFamily: 'monospace' }}>
        <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Erreur d'accès aux données :</p>
        <p style={{ marginBottom: '1.5rem' }}>{error}</p>
        <button
          onClick={() => selectedDatasetId && fetchData(selectedDatasetId, runFilter)}
          style={{ padding: '0.5rem 1rem', backgroundColor: C.amber, color: '#000', fontWeight: 'bold', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  const kpis = data?.kpis || {
    runs: '5',
    runs_sub: '1 running · 1 stopped early',
    data: 'defects@v4',
    data_sub: '412 labeled · 87 corrected',
    compute: '21 GPU h',
    compute_sub: 'this week · budget 60 h',
    in_production: 'yolo-defects-v3',
    in_production_sub: 'on line mini PCs',
  };

  const runsSec = data?.runs_section;
  const evalSec = data?.evaluate;
  const compareSec = data?.compare_and_promote;
  const guardrails = data?.guardrails || [];
  const candidateV = data?.candidate_version || 'v4';

  return (
    <div
      style={{
        backgroundColor: C.bg,
        color: C.text,
        minHeight: '100vh',
        padding: '1.5rem 2.5rem 7rem 2.5rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '2rem',
            right: '2rem',
            zIndex: 9999,
            backgroundColor: C.amber,
            color: '#000',
            padding: '0.75rem 1.25rem',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{notification}</span>
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
          <span style={{ fontSize: '0.72rem', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            JEU DE DONNÉES :
          </span>
          <select
            value={selectedDatasetId}
            onChange={(e) => handleDatasetChange(e.target.value)}
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
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* HEADER */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          {data?.breadcrumb || 'EXPERIMENT · 5 RUNS · DATA DEFECTS@V4 · OBJECT DETECTION · 6 CLASSES · TEST SET LOCKED'}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '3rem', color: '#f4f4f6', letterSpacing: '-0.02em', margin: '0 0 1.5rem 0', fontWeight: 400 }}>
              {data?.display_title || 'product_defects/'}
            </h1>

            {/* 4 KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))', gap: '2rem', maxWidth: '780px' }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>RUNS</div>
                <div style={{ fontSize: '2rem', fontFamily: 'Newsreader, Georgia, serif', color: '#f4f4f6', marginTop: '0.2rem' }}>{kpis.runs}</div>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.2rem' }}>{kpis.runs_sub}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>DATA</div>
                <div style={{ fontSize: '1.5rem', fontFamily: 'Newsreader, Georgia, serif', color: '#f4f4f6', marginTop: '0.2rem' }}>{kpis.data}</div>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.2rem' }}>{kpis.data_sub}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>COMPUTE</div>
                <div style={{ fontSize: '1.5rem', fontFamily: 'Newsreader, Georgia, serif', color: '#f4f4f6', marginTop: '0.2rem' }}>{kpis.compute}</div>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.2rem' }}>{kpis.compute_sub}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>IN PRODUCTION</div>
                <div style={{ fontSize: '1.35rem', fontFamily: 'Newsreader, Georgia, serif', color: '#f4f4f6', marginTop: '0.2rem' }}>{kpis.in_production}</div>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.2rem' }}>{kpis.in_production_sub}</div>
              </div>
            </div>
          </div>

          {/* Candidate Callout Top Right */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: '2rem' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', border: `1px solid ${C.amber}`, color: C.amber, backgroundColor: 'rgba(245, 158, 11, 0.05)', padding: '0.15rem 0.5rem', borderRadius: '3px', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              CANDIDATE
            </div>
            <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '5rem', color: C.amber, lineHeight: 1 }}>
              {candidateV.toUpperCase()}
            </div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase', marginTop: '0.35rem' }}>
              CANDIDATE MODEL
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: NEW RUN */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', color: '#f4f4f6', margin: 0 }}>
            1 · New run
          </h2>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>
            EVERYTHING HERE IS SAVED WITH THE RUN
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Data & Augmentations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* DATA CARD */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                DATA
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>DATASET VERSION</label>
                <select
                  value={selectedDatasetVersion}
                  onChange={(e) => setSelectedDatasetVersion(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                >
                  <option value="defects@v4 · current">defects@v4 · current</option>
                  <option value="defects@v3">defects@v3</option>
                  <option value="defects@v2">defects@v2</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>TRAIN VIEW</label>
                <select
                  value={selectedTrainView}
                  onChange={(e) => setSelectedTrainView(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                >
                  <option value="Real + copy-paste · train split only">Real + copy-paste · train split only</option>
                  <option value="Real only">Real only</option>
                  <option value="Copy-paste only">Copy-paste only</option>
                </select>
              </div>

              <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, lineHeight: 1.5 }}>
                <div>{data?.new_run_config?.splits_info || 'Splits from 04: 70 / 15 / 15 · by scene group · train 8,882 · val 1,560 · test 1,776'}</div>
                <div style={{ marginTop: '0.25rem' }}>{data?.new_run_config?.image_size_info || 'Image size 1280 px · letterbox, as in 04'}</div>
              </div>
            </div>

            {/* ON-THE-FLY AUGMENTATION */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                ON-THE-FLY AUGMENTATION · FROM RECIPE V3
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
                {[
                  { id: 'hflip', label: 'Horizontal flip' },
                  { id: 'scale', label: 'Scale 0.5 - 1.5' },
                  { id: 'bright', label: 'Brightness ± 25%' },
                  { id: 'mosaic', label: 'Mosaic · off last 10 ep.' },
                  { id: 'vflip', label: 'Vertical flip' },
                  { id: 'mixup', label: 'Mixup' },
                ].map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '4px',
                      border: `1px solid ${augmentations[item.id] ? C.amber : C.borderLight}`,
                      backgroundColor: augmentations[item.id] ? C.amberBg : 'transparent',
                      color: augmentations[item.id] ? C.text : C.textMuted,
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!augmentations[item.id]}
                      onChange={(e) => setAugmentations({ ...augmentations, [item.id]: e.target.checked })}
                      style={{ accentColor: C.amber }}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <p style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, lineHeight: 1.4, margin: 0 }}>
                Applied to train only, never stored. Copy-paste images were made in 03 and are already in v4.
              </p>
            </div>
          </div>

          {/* Middle Column: Model, Target Device & Compute */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* MODEL */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                MODEL
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>ARCHITECTURE</label>
                <select
                  value={architecture}
                  onChange={(e) => setArchitecture(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                >
                  <option value="YOLO11-s · COCO pretrained">YOLO11-s · COCO pretrained</option>
                  <option value="YOLO11-n · lightweight">YOLO11-n · lightweight</option>
                  <option value="YOLO11-m · medium">YOLO11-m · medium</option>
                  <option value="YOLO11-l · high accuracy">YOLO11-l · high accuracy</option>
                  <option value="RT-DETR-l · transformer">RT-DETR-l · transformer</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>EPOCHS</label>
                  <input
                    type="number"
                    value={epochs}
                    onChange={(e) => setEpochs(Number(e.target.value))}
                    style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>PATIENCE</label>
                  <input
                    type="number"
                    value={patience}
                    onChange={(e) => setPatience(Number(e.target.value))}
                    style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>BATCH</label>
                  <input
                    type="number"
                    value={batch}
                    onChange={(e) => setBatch(Number(e.target.value))}
                    style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>LR0</label>
                  <input
                    type="text"
                    value={lr0}
                    onChange={(e) => setLr0(e.target.value)}
                    style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                  />
                </div>
              </div>
            </div>

            {/* GOAL AND TARGET DEVICE */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                GOAL AND TARGET DEVICE
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>OPTIMIZE</label>
                <select
                  value={optimize}
                  onChange={(e) => setOptimize(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                >
                  <option value="mAP@50 · all classes">mAP@50 · all classes</option>
                  <option value="mAP@50-95 · tighter boxes">mAP@50-95 · tighter boxes</option>
                  <option value="Recall · crack focus">Recall · crack focus</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>RUNS ON</label>
                <select
                  value={runsOn}
                  onChange={(e) => setRunsOn(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                >
                  <option value="Line mini PC · CPU · OpenVINO">Line mini PC · CPU · OpenVINO</option>
                  <option value="NVIDIA Jetson Orin Nano">NVIDIA Jetson Orin Nano</option>
                  <option value="Cloud GPU A10G">Cloud GPU A10G</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>LATENCY BUDGET</label>
                <input
                  type="text"
                  value={latencyBudget}
                  onChange={(e) => setLatencyBudget(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.78rem', fontFamily: 'monospace', padding: '0.45rem 0.65rem', borderRadius: '4px', outline: 'none' }}
                />
              </div>
            </div>

            {/* COMPUTE AND REPRODUCIBILITY */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase', marginBottom: '0.85rem' }}>
                COMPUTE AND REPRODUCIBILITY
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                <div>
                  <div style={{ color: C.textMuted, fontSize: '0.65rem', marginBottom: '0.25rem' }}>WORKER</div>
                  <select
                    value={worker}
                    onChange={(e) => setWorker(e.target.value)}
                    style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.7rem', padding: '0.25rem 0.4rem', borderRadius: '3px' }}
                  >
                    <option value="1 x [GPU TYPE]">1 x [GPU TYPE]</option>
                    <option value="1 x RTX 4090">1 x RTX 4090</option>
                  </select>
                </div>
                <div>
                  <div style={{ color: C.textMuted, fontSize: '0.65rem', marginBottom: '0.25rem' }}>PRECISION</div>
                  <select
                    value={precision}
                    onChange={(e) => setPrecision(e.target.value)}
                    style={{ width: '100%', backgroundColor: '#090a0c', border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.7rem', padding: '0.25rem 0.4rem', borderRadius: '3px' }}
                  >
                    <option value="Mixed · fp16">Mixed · fp16</option>
                    <option value="FP32">FP32</option>
                  </select>
                </div>
                <div>
                  <div style={{ color: C.textMuted, fontSize: '0.65rem', marginBottom: '0.25rem' }}>SEED</div>
                  <div style={{ color: C.text, paddingTop: '0.35rem' }}>42 · deterministic</div>
                </div>
                <div>
                  <div style={{ color: C.textMuted, fontSize: '0.65rem', marginBottom: '0.25rem' }}>ESTIMATE</div>
                  <div style={{ color: C.text, paddingTop: '0.35rem' }}>≈ 3 h 10 · 3.2 GPU h</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Checks Before Start & Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#f4f4f6', margin: '0 0 1.25rem 0' }}>
                Checks before start
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                {(data?.new_run_config?.checks_before_start || [
                  { title: 'Test set hash unchanged', sub: '1,776 images · labeled by humans only', ok: true },
                  { title: 'Copy-paste images in train only', sub: '927 generated · none in val or test', ok: true },
                  { title: 'Scene groups never split', sub: 'Frames of one scene stay in one split', ok: true },
                  { title: 'Boxes match their images', sub: 'Checked after letterbox to 1280 px', ok: true },
                  { title: 'crack is rare', sub: '272 real boxes · its score will be noisy', ok: false, is_warning: true },
                ]).map((chk, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                    {chk.is_warning ? (
                      <AlertTriangle size={15} color={C.amber} style={{ flexShrink: 0, marginTop: '2px' }} />
                    ) : (
                      <Check size={15} color={C.green} style={{ flexShrink: 0, marginTop: '2px' }} />
                    )}
                    <div>
                      <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 600, color: chk.is_warning ? C.amber : C.text }}>
                        {chk.title}
                      </div>
                      <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
                        {chk.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Command box */}
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.72rem',
                  color: C.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1.25rem',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                  {data?.new_run_config?.command || 'datalift train defects@v4 --config yolo11s.yaml'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCommand(data?.new_run_config?.command || 'datalift train defects@v4 --config yolo11s.yaml')}
                  style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: 0 }}
                  title="Copier"
                >
                  {copiedCmd ? <Check size={13} color={C.green} /> : <Copy size={13} />}
                </button>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={handleStartRun}
                  style={{
                    backgroundColor: C.amber,
                    color: '#000',
                    fontWeight: 'bold',
                    padding: '0.65rem',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Play size={13} fill="#000" />
                  <span>Start run</span>
                </button>

                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => setNotification('Configuration enregistrée comme modèle réutilisable')}
                    style={{ flex: 1, backgroundColor: 'transparent', color: C.text, border: `1px solid ${C.borderLight}`, padding: '0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'monospace', cursor: 'pointer' }}
                  >
                    Save as template
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotification('Planification des entraînements...')}
                    style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: '0.72rem', fontFamily: 'monospace', cursor: 'pointer' }}
                  >
                    Schedule...
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: RUNS */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', color: '#f4f4f6', margin: 0 }}>
            2 · Runs
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ display: 'flex', backgroundColor: '#090a0c', border: `1px solid ${C.border}`, borderRadius: '4px', padding: '2px' }}>
              {(['all', 'running', 'done'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRunFilter(mode)}
                  style={{
                    backgroundColor: runFilter === mode ? C.amber : 'transparent',
                    color: runFilter === mode ? '#000' : C.textMuted,
                    fontWeight: runFilter === mode ? 'bold' : 'normal',
                    border: 'none',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '3px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  {mode === 'all'
                    ? `All · ${runsSec?.counts?.all || 5}`
                    : mode === 'running'
                    ? `Running · ${runsSec?.counts?.running || 1}`
                    : `Done · ${runsSec?.counts?.done || 4}`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              style={{ backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.35rem 0.8rem', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'monospace', cursor: 'pointer' }}
            >
              Compare 2 selected
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '1.5rem' }}>
          {/* Table of Runs */}
          <div>
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    <th style={{ padding: '0.65rem 0.85rem' }}>RUN</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>DATA</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>MODEL</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>STATUS</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>mAP@50 · VAL</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>TIME</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>TAG</th>
                  </tr>
                </thead>
                <tbody>
                  {(runsSec?.runs || []).map((r) => {
                    const isSel = selectedRunId === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedRunId(r.id)}
                        style={{
                          borderBottom: `1px solid ${C.border}`,
                          backgroundColor: isSel ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="checkbox"
                            checked={selectedForCompare.includes(r.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.checked) setSelectedForCompare([...selectedForCompare, r.id]);
                              else setSelectedForCompare(selectedForCompare.filter((id) => id !== r.id));
                            }}
                            style={{ accentColor: C.amber }}
                          />
                          <span>{r.id}</span>
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem', color: C.textMuted }}>{r.data}</td>
                        <td style={{ padding: '0.75rem 0.85rem', color: C.text }}>{r.model}</td>
                        <td style={{ padding: '0.75rem 0.85rem' }}>
                          {r.is_running ? (
                            <div>
                              <div style={{ color: '#38bdf8' }}>{r.status}</div>
                              <div style={{ width: '90px', height: '4px', backgroundColor: '#1e2229', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                                <div style={{ width: `${r.progress_pct || 53}%`, height: '100%', backgroundColor: '#38bdf8' }} />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: C.textMuted }}>{r.status}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 'bold',
                              color: r.tag === 'CANDIDATE' ? C.amber : C.text,
                              cursor: 'default',
                            }}
                            title={`mAP@50: ${r.map50_val}`}
                          >
                            [RESULT]
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.85rem', color: C.textMuted }}>{r.time}</td>
                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                          {r.tag === 'LIVE' && (
                            <span style={{ padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.62rem', fontWeight: 'bold', border: '1px solid #38bdf8', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)' }}>
                              LIVE
                            </span>
                          )}
                          {r.tag === 'CANDIDATE' && (
                            <span style={{ padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.62rem', fontWeight: 'bold', border: `1px solid ${C.amber}`, color: C.amber, backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                              CANDIDATE
                            </span>
                          )}
                          {r.tag === 'PRODUCTION' && (
                            <span style={{ padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.62rem', fontWeight: 'bold', backgroundColor: C.amber, color: '#000' }}>
                              PRODUCTION
                            </span>
                          )}
                          {r.tag === 'ARCHIVED' && (
                            <span style={{ padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.62rem', border: `1px solid ${C.borderLight}`, color: C.textMuted }}>
                              ARCHIVED
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.65rem' }}>
              Each run keeps its weights, every checkpoint's val score, and the exact augmentation it saw.
            </div>
          </div>

          {/* Right: Live Run Card */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.85rem', color: C.text }}>
                {runsSec?.active_run?.id || 'yolo-defects-v4-m'}
              </div>
              <span style={{ padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.62rem', fontWeight: 'bold', border: '1px solid #38bdf8', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)' }}>
                RUNNING
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1rem' }}>
              {runsSec?.active_run?.header_sub || 'Epoch 64 / 120 · GPU 97% · ETA 1 h 30'}
            </div>

            {/* Live Chart SVG */}
            <div style={{ height: '130px', backgroundColor: '#090a0c', border: `1px solid ${C.border}`, borderRadius: '4px', padding: '0.5rem', marginBottom: '1rem', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <svg viewBox="0 0 300 80" style={{ width: '100%', height: '80px', overflow: 'visible' }}>
                <line x1="0" y1="20" x2="300" y2="20" stroke="#1f2228" strokeDasharray="2" />
                <line x1="0" y1="50" x2="300" y2="50" stroke="#1f2228" strokeDasharray="2" />
                <path d="M 10 20 Q 80 45, 160 55 T 290 62" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d="M 10 30 Q 100 50, 180 58 T 290 65" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
                <path d="M 10 70 Q 70 40, 150 25 T 290 18" fill="none" stroke={C.amber} strokeWidth="2" />
              </svg>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: '0.35rem' }}>
                <div style={{ display: 'flex', gap: '0.85rem' }}>
                  <span style={{ color: '#9ca3af' }}>-- box loss</span>
                  <span style={{ color: '#38bdf8' }}>- class loss</span>
                  <span style={{ color: C.amber }}>- val mAP@50</span>
                </div>
                <span>EPOCH →</span>
              </div>
            </div>

            {/* Val Preview Thumbnails */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.08em' }}>
                VAL PREVIEW · EPOCH 60
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {[
                  { borderCol: C.amber, dashed: false },
                  { borderCol: C.amber, dashed: false },
                  { borderCol: '#38bdf8', dashed: true },
                  { borderCol: 'transparent', dashed: false },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      height: '55px',
                      backgroundColor: '#1b1d22',
                      border: `1px solid ${C.borderLight}`,
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '20px',
                        border: item.borderCol !== 'transparent' ? `2px ${item.dashed ? 'dashed' : 'solid'} ${item.borderCol}` : 'none',
                        borderRadius: '2px',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setNotification('Entraînement interrompu')}
                style={{ flex: 1, backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.red, padding: '0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => setNotification('Ouverture des logs GPU...')}
                style={{ flex: 1, backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Open logs
              </button>
              <button
                type="button"
                onClick={() => setNotification('Notification configurée dès la fin du run')}
                style={{ flex: 1.3, backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'monospace', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Notify me when done
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: EVALUATE */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', color: '#f4f4f6', margin: 0 }}>
            3 · Evaluate
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted }}>RUN</span>
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                style={{ backgroundColor: C.card, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.75rem', fontFamily: 'monospace', padding: '0.3rem 0.6rem', borderRadius: '4px' }}
              >
                <option value="yolo-defects-v4">yolo-defects-v4</option>
                <option value="yolo-defects-v4-m">yolo-defects-v4-m</option>
                <option value="yolo-defects-v3">yolo-defects-v3</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted }}>SPLIT</span>
              <select
                value={selectedSplit}
                onChange={(e) => setSelectedSplit(e.target.value)}
                style={{ backgroundColor: C.card, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: '0.75rem', fontFamily: 'monospace', padding: '0.3rem 0.6rem', borderRadius: '4px' }}
              >
                <option value="val · 1,560 images">val · 1,560 images</option>
                <option value="train · 8,882 images">train · 8,882 images</option>
                <option value="test · 1,776 images (locked)">test · 1,776 images (locked)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 5 KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>mAP@50</div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 'bold', color: C.amber, marginTop: '0.2rem', cursor: 'default' }} title={evalSec?.summary_kpis?.map50 || '0.892'}>
              [RESULT]
            </div>
            <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.25rem' }}>
              {evalSec?.summary_kpis?.map50_sub || 'all 6 classes'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>mAP@50-95</div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 'bold', color: '#f4f4f6', marginTop: '0.2rem', cursor: 'default' }} title={evalSec?.summary_kpis?.map50_95 || '0.648'}>
              [RESULT]
            </div>
            <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.25rem' }}>
              {evalSec?.summary_kpis?.map50_95_sub || 'tighter boxes count'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>RECALL · CRACK</div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 'bold', color: '#f4f4f6', marginTop: '0.2rem', cursor: 'default' }} title={evalSec?.summary_kpis?.recall_crack || '0.84'}>
              [RESULT]
            </div>
            <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.25rem' }}>
              {evalSec?.summary_kpis?.recall_crack_sub || 'a missed crack is costly'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>LATENCY · MINI PC</div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 'bold', color: '#f4f4f6', marginTop: '0.2rem', cursor: 'default' }} title={evalSec?.summary_kpis?.latency_device || '78 ms'}>
              [RESULT]
            </div>
            <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.25rem' }}>
              {evalSec?.summary_kpis?.latency_device_sub || 'measured on the device'}
            </div>
          </div>

          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>TEST SET</div>
              <div style={{ fontSize: '1.25rem', fontFamily: 'Newsreader, Georgia, serif', color: C.textMuted, marginTop: '0.2rem' }}>
                {evalSec?.summary_kpis?.test_set || 'locked'}
              </div>
              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
                {evalSec?.summary_kpis?.test_set_sub || 'opened 0 times for this run'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              style={{ marginTop: '0.5rem', backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.35rem', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'monospace', cursor: 'pointer' }}
            >
              Evaluate on test...
            </button>
          </div>
        </div>

        {/* Per Class Table & Confusion Matrix Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
          {/* Per Class */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#f4f4f6', margin: 0 }}>Per class</h3>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>VAL · IOU 0.5</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.5rem' }}>CLASS</th>
                  <th style={{ padding: '0.5rem' }}>BOXES</th>
                  <th style={{ padding: '0.5rem' }}>PRECISION</th>
                  <th style={{ padding: '0.5rem' }}>RECALL</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>AP@50</th>
                </tr>
              </thead>
              <tbody>
                {(evalSec?.per_class || []).map((cls, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{cls.name}</span>
                      {cls.is_rare && (
                        <span style={{ fontSize: '0.6rem', border: `1px solid ${C.amber}`, color: C.amber, padding: '0.05rem 0.3rem', borderRadius: '2px' }}>
                          RARE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.textMuted }}>{cls.boxes}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.text }} title={`Precision: ${cls.precision}`}>[RESULT]</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.text }} title={`Recall: ${cls.recall}`}>[RESULT]</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: C.text }} title={`AP@50: ${cls.ap50}`}>[RESULT]</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confusion Matrix */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#f4f4f6', margin: 0 }}>Confusion matrix</h3>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>INCLUDES BACKGROUND</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'flex', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem', paddingLeft: '5.5rem' }}>
                {(evalSec?.confusion_matrix?.labels || ['OK', 'SCR', 'DENT', 'STN', 'MIS', 'CRK', 'BG']).map((lbl, i) => (
                  <div key={i} style={{ width: '38px', textAlign: 'center', fontWeight: 'bold' }}>{lbl}</div>
                ))}
              </div>

              {(evalSec?.confusion_matrix?.matrix || [
                [94, 1, 1, 1, 0, 0, 3],
                [1, 87, 3, 2, 0, 1, 6],
                [2, 2, 86, 1, 1, 0, 8],
                [1, 4, 2, 84, 0, 0, 9],
                [0, 1, 1, 1, 81, 1, 15],
                [0, 2, 0, 1, 0, 84, 13],
                [3, 4, 3, 5, 2, 3, 80],
              ]).map((row, rIdx) => {
                const rowLabels = evalSec?.confusion_matrix?.labels || ['OK', 'SCRATCH', 'DENT', 'STAIN', 'MISALIGNED', 'CRACK', 'BACKGROUND'];
                const rowLabel = rowLabels[rIdx] || `R${rIdx}`;
                return (
                  <div key={rIdx} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <div style={{ width: '5.5rem', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, textTransform: 'uppercase', textAlign: 'right', paddingRight: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rowLabel}
                    </div>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {row.map((val, cIdx) => {
                        const isDiag = rIdx === cIdx;
                        let bg = 'rgba(255, 255, 255, 0.03)';
                        let col = '#9ca3af';
                        if (isDiag) {
                          bg = val > 90 ? C.amber : val > 80 ? '#d97706' : '#b45309';
                          col = '#000';
                        } else if (val > 10) {
                          bg = 'rgba(239, 68, 68, 0.25)';
                          col = '#f87171';
                        }
                        return (
                          <div
                            key={cIdx}
                            style={{
                              width: '35px',
                              height: '24px',
                              borderRadius: '2px',
                              backgroundColor: bg,
                              color: col,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                            }}
                          >
                            {val}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.85rem', lineHeight: 1.4, margin: '0.85rem 0 0 0' }}>
              Rows true · columns predicted. "bg" column = missed defects, "background" row = false alarms. Shading is illustrative.
            </p>
          </div>
        </div>

        {/* Deployment Thresholds & Slices */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
          {/* Thresholds */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#f4f4f6', margin: 0 }}>Deployment thresholds</h3>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>SAVED WITH THE MODEL</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'monospace', marginBottom: '0.35rem' }}>
                  <span>CONFIDENCE · ALL CLASSES</span>
                  <span style={{ color: C.amber, fontWeight: 'bold' }}>{confAll.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.05"
                  value={confAll}
                  onChange={(e) => setConfAll(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: C.amber }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'monospace', marginBottom: '0.35rem' }}>
                  <span>CONFIDENCE · CRACK ONLY</span>
                  <span style={{ color: C.amber, fontWeight: 'bold' }}>{confCrack.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.80"
                  step="0.05"
                  value={confCrack}
                  onChange={(e) => setConfCrack(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: C.amber }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'monospace', marginBottom: '0.35rem' }}>
                  <span>OVERLAP TO MERGE BOXES (NMS IOU)</span>
                  <span style={{ color: C.amber, fontWeight: 'bold' }}>{nmsIou.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.30"
                  max="0.80"
                  step="0.05"
                  value={nmsIou}
                  onChange={(e) => setNmsIou(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: C.amber }}
                />
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'monospace' }}>
              <div>
                <span style={{ color: C.textMuted }}>FALSE ALARMS / 1K PARTS</span>
                <div style={{ color: C.text, fontWeight: 'bold', marginTop: '0.2rem' }} title={`Estimated: ~${calculatedFalseAlarms} per 1k parts`}>[RESULT]</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: C.textMuted }}>MISSED CRACKS / 1K PARTS</span>
                <div style={{ color: C.amber, fontWeight: 'bold', marginTop: '0.2rem' }} title={`Estimated: ~${calculatedMissedCracks} per 1k parts`}>[RESULT]</div>
              </div>
            </div>

            <p style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.75rem', margin: '0.75rem 0 0 0' }}>
              A lower threshold for crack trades more false alarms for fewer missed cracks.
            </p>
          </div>

          {/* Slices */}
          <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#f4f4f6', margin: 0 }}>Slices</h3>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>WHERE THE MODEL IS WEAKER</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.5rem' }}>SLICE</th>
                  <th style={{ padding: '0.5rem' }}>IMAGES</th>
                  <th style={{ padding: '0.5rem' }}>mAP@50</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>FLAG</th>
                </tr>
              </thead>
              <tbody>
                {(evalSec?.slices || []).map((sl, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.text }}>{sl.slice}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.textMuted }}>{sl.images}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: C.text }} title={`mAP@50: ${sl.map50}`}>[RESULT]</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                      {sl.is_weak ? (
                        <span style={{ border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.62rem', fontWeight: 'bold' }}>
                          WEAK
                        </span>
                      ) : (
                        <span style={{ color: C.textMuted, fontSize: '0.7rem' }}>ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.85rem', margin: '0.85rem 0 0 0' }}>
              Weak slices are sent to 07 as a focus, and to 02 if the images themselves are the problem.
            </p>
          </div>
        </div>

        {/* Errors to look at */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.25rem', color: '#f4f4f6', margin: 0 }}>Errors to look at</h3>

            <div style={{ display: 'flex', backgroundColor: '#090a0c', border: `1px solid ${C.border}`, borderRadius: '4px', padding: '2px' }}>
              {[
                { id: 'all', label: 'All · val' },
                { id: 'missed', label: 'Missed' },
                { id: 'false_alarm', label: 'False alarm' },
                { id: 'wrong_class', label: 'Wrong class' },
                { id: 'loose_box', label: 'Loose box' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setErrorFilter(item.id)}
                  style={{
                    backgroundColor: errorFilter === item.id ? C.amber : 'transparent',
                    color: errorFilter === item.id ? '#000' : C.textMuted,
                    fontWeight: errorFilter === item.id ? 'bold' : 'normal',
                    border: 'none',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '3px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '0.65rem' }}>
            {filteredErrors.map((errItem, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 'bold', color: C.text }}>{errItem.image_id}</span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '2px',
                        border: `1px solid ${
                          errItem.tag_type === 'red' ? '#ef4444' : errItem.tag_type === 'blue' ? '#38bdf8' : errItem.tag_type === 'orange' ? C.amber : '#6b7280'
                        }`,
                        color:
                          errItem.tag_type === 'red' ? '#ef4444' : errItem.tag_type === 'blue' ? '#38bdf8' : errItem.tag_type === 'orange' ? C.amber : '#9ca3af',
                      }}
                    >
                      {errItem.tag}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.85rem' }}>{errItem.desc}</div>

                  {/* Thumbnail */}
                  <div
                    onClick={() => setSelectedErrorForModal(errItem)}
                    style={{
                      height: '110px',
                      backgroundColor: '#1b1d22',
                      border: `1px solid ${C.borderLight}`,
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      marginBottom: '0.85rem',
                    }}
                    title="Cliquer pour afficher en grand côte à côte"
                  >
                    <div style={{ width: '130px', height: '65px', backgroundColor: '#373c44', borderRadius: '3px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {(idx === 0 || idx === 2) && <div style={{ width: '45px', height: '2px', backgroundColor: '#111', transform: 'rotate(-10deg)' }} />}
                      {idx === 3 && <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#111' }} />}
                      {idx === 0 && <div style={{ position: 'absolute', inset: '10px 20px', border: '2px solid #ef4444', borderRadius: '2px' }} />}
                      {idx === 1 && <div style={{ position: 'absolute', inset: '12px 25px', border: '1px dashed #38bdf8', borderRadius: '2px' }} />}
                      {idx === 2 && <div style={{ position: 'absolute', inset: '10px 20px', border: '2px solid #f59e0b', borderRadius: '2px' }} />}
                      {idx === 3 && <div style={{ position: 'absolute', inset: '8px 15px', border: '2px solid #f59e0b', borderRadius: '2px' }} />}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (errItem.action_target === '07') setNotification(`✓ ${errItem.image_id} ajouté au pool Active Learning (07)`);
                    else navigate('/labeling');
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  {errItem.action_label}
                </button>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
            Click an image to open it full size with label boxes (solid) and predictions (dashed) side by side.
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: COMPARE AND PROMOTE */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', color: '#f4f4f6', margin: 0 }}>
            4 · Compare and promote
          </h2>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>
            SAME LOCKED TEST SET, MEASURED ON THE REAL DEVICE
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Test Comparison & Edge Benchmark */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Test Set Comparison Table */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.5rem' }}>
                      ON TEST · {data?.dataset_name?.includes('defect') ? '1,776' : '350'} IMAGES
                    </th>
                    <th style={{ padding: '0.5rem' }}>YOLO-DEFECTS-V3 · PROD</th>
                    <th style={{ padding: '0.5rem', color: C.amber }}>YOLO-DEFECTS-V4 · CAND.</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>CHANGE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text, fontWeight: 600 }}>Test set hash</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>same</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.amber, fontWeight: 'bold' }}>same</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: C.green, fontWeight: 'bold' }}>✓ comparable</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text, fontWeight: 600 }}>mAP@50</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.amber, fontWeight: 'bold' }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: C.text, fontWeight: 'bold' }}>[RESULT]</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text, fontWeight: 600 }}>Recall · crack</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.amber, fontWeight: 'bold' }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: C.text, fontWeight: 'bold' }}>[RESULT]</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text, fontWeight: 600 }}>False alarms / 1k parts</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.amber, fontWeight: 'bold' }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: C.text, fontWeight: 'bold' }}>[RESULT]</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Edge Benchmark Table */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#f4f4f6', margin: 0 }}>Edge benchmark</h3>
                <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>RUN ON ONE LINE MINI PC</span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.5rem' }}>EXPORT</th>
                    <th style={{ padding: '0.5rem' }}>LATENCY</th>
                    <th style={{ padding: '0.5rem' }}>mAP@50 KEPT</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>SIZE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text, fontWeight: 600 }}>OpenVINO · FP16</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: C.textMuted }}>[RESULT]</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text, fontWeight: 600 }}>OpenVINO · INT8</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: C.textMuted }}>[RESULT]</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text, fontWeight: 600 }}>ONNX · FP32</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', color: C.text }}>[RESULT]</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: C.textMuted }}>[RESULT]</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.85rem' }}>
                INT8 is calibrated on 300 train images, never on test. Budget: ≤ 120 ms per frame.
              </div>
            </div>
          </div>

          {/* Right Column: Before Production & Shadow Mode Box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Before Production */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.15rem', color: '#f4f4f6', margin: '0 0 1.25rem 0' }}>
                Before production
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  <Check size={15} color={C.amber} style={{ flexShrink: 0 }} />
                  <span style={{ color: C.text, fontWeight: 600 }}>Same locked test set</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted }}>
                  <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>○</span>
                  <span>Beats production on mAP@50</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted }}>
                  <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>○</span>
                  <span>Crack recall not lower than production</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted }}>
                  <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>○</span>
                  <span>Within latency budget on the device</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted }}>
                  <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>○</span>
                  <span>3 days in shadow mode on line 2</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted }}>
                  <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>○</span>
                  <span>Approved by a second person</span>
                </div>
              </div>
            </div>

            {/* Shadow Mode explanation & Replay */}
            <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, lineHeight: 1.5, margin: 0 }}>
                Shadow mode: the new model runs next to production on one device, its boxes are logged but never acted on.
              </p>

              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#090a0c',
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.72rem',
                  color: C.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                  {compareSec?.replay_command || 'datalift train --replay yolo-defects-v4'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCommand(compareSec?.replay_command || 'datalift train --replay yolo-defects-v4')}
                  style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: 0 }}
                  title="Copier"
                >
                  {copiedCmd ? <Check size={13} color={C.green} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* GUARDRAILS (8 items) */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.35rem', color: '#f4f4f6', margin: 0 }}>Guardrails</h3>
          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: C.textMuted, textTransform: 'uppercase' }}>
            CHECKED BEFORE EVERY RUN AND PROMOTION
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {guardrails.map((gr, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
              }}
            >
              {gr.is_warning ? (
                <AlertTriangle size={15} color={C.amber} style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <Check size={15} color={C.green} style={{ flexShrink: 0, marginTop: '2px' }} />
              )}
              <div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600, color: gr.is_warning ? C.amber : C.text }}>
                  {gr.title}
                </div>
                <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.2rem', lineHeight: 1.35 }}>
                  {gr.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* BOTTOM ACTION BANNER */}
      {/* ========================================================================= */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '250px',
          right: 0,
          zIndex: 40,
          backgroundColor: '#0c0d0e',
          borderTop: `1px solid ${C.border}`,
          padding: '1rem 2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 -10px 25px rgba(0,0,0,0.6)',
        }}
      >
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 'bold', color: '#f4f4f6' }}>
            {data?.action_banner?.summary || 'yolo-defects-v4 · YOLO11-s · trained on v4 · candidate'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {data?.action_banner?.detail || 'Model card generated: classes, thresholds, metrics on locked test, edge latency, known limits'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setShowShadowModal(true)}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: C.text,
              padding: '0.5rem 1.25rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {data?.action_banner?.secondary_action || 'Start shadow mode'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/active-learning')}
            style={{
              backgroundColor: C.amber,
              color: '#000',
              fontWeight: 'bold',
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {data?.action_banner?.primary_action || 'Continue to active learning →'}
          </button>
        </div>
      </div>

      {/* MODAL: COMPARE RUNS */}
      {showCompareModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '650px', backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.25rem', color: '#f4f4f6', margin: 0 }}>Comparaison des runs YOLO</h3>
              <button onClick={() => setShowCompareModal(false)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted }}>
              Runs sélectionnés : {selectedForCompare.join(', ')}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace', border: `1px solid ${C.border}` }}>
              <thead>
                <tr style={{ backgroundColor: '#090a0c', borderBottom: `1px solid ${C.border}`, color: C.textMuted }}>
                  <th style={{ padding: '0.5rem' }}>METRIC</th>
                  <th style={{ padding: '0.5rem' }}>yolo-defects-v4 (Candidate)</th>
                  <th style={{ padding: '0.5rem' }}>yolo-defects-v3 (Production)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>Architecture</td>
                  <td style={{ padding: '0.5rem' }}>YOLO11-s</td>
                  <td style={{ padding: '0.5rem' }}>YOLO11-s</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>mAP@50 Val</td>
                  <td style={{ padding: '0.5rem', color: C.amber, fontWeight: 'bold' }}>0.892 (+2.8%)</td>
                  <td style={{ padding: '0.5rem' }}>0.864</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>Recall · crack</td>
                  <td style={{ padding: '0.5rem', color: C.amber, fontWeight: 'bold' }}>0.840 (+5.1%)</td>
                  <td style={{ padding: '0.5rem' }}>0.789</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>Latency (Mini PC)</td>
                  <td style={{ padding: '0.5rem' }}>78 ms</td>
                  <td style={{ padding: '0.5rem' }}>76 ms</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <button
                onClick={() => setShowCompareModal(false)}
                style={{ backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.45rem 1rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TEST SET CONFIRMATION */}
      {showTestModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '480px', backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.25rem', color: '#f4f4f6', margin: 0 }}>Évaluation sur le Test Set Verrouillé</h3>
              <button onClick={() => setShowTestModal(false)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted, lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.5rem 0' }}>⚠️ Le test set est verrouillé à 1,776 images étiquetées uniquement par des humains.</p>
              <p style={{ margin: 0 }}>Chaque évaluation sur le test set est auditée et comptabilisée pour prévenir le surapprentissage.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', paddingTop: '0.5rem' }}>
              <button
                onClick={() => setShowTestModal(false)}
                style={{ backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.45rem 1rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowTestModal(false);
                  setNotification('✓ Évaluation test set lancée : hash vérifié et conforme');
                  setTimeout(() => setNotification(null), 4000);
                }}
                style={{ backgroundColor: C.amber, color: '#000', fontWeight: 'bold', border: 'none', padding: '0.45rem 1rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Confirmer l'évaluation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SHADOW MODE */}
      {showShadowModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '480px', backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.25rem', color: '#f4f4f6', margin: 0 }}>Démarrer le Shadow Mode</h3>
              <button onClick={() => setShowShadowModal(false)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: C.textMuted, lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.5rem 0' }}>Le modèle candidat <strong style={{ color: C.amber }}>yolo-defects-v4</strong> sera déployé en mode miroir sur le Mini PC de la Ligne 2.</p>
              <p style={{ margin: 0 }}>Il traitera les flux caméras en temps réel en parallèle du modèle v3 en production sans impacter les décisions de tri.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', paddingTop: '0.5rem' }}>
              <button
                onClick={() => setShowShadowModal(false)}
                style={{ backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.45rem 1rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={handleStartShadow}
                style={{ backgroundColor: C.amber, color: '#000', fontWeight: 'bold', border: 'none', padding: '0.45rem 1rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Activer le Shadow Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ERROR SIDE-BY-SIDE INSPECTOR */}
      {selectedErrorForModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '850px', backgroundColor: C.cardElevated, border: `1px solid ${C.borderLight}`, borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: '1.25rem', color: '#f4f4f6', margin: 0, display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span>Inspection : {selectedErrorForModal.image_id}</span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '2px',
                      border: `1px solid ${selectedErrorForModal.tag_type === 'red' ? '#ef4444' : selectedErrorForModal.tag_type === 'blue' ? '#38bdf8' : C.amber}`,
                      color: selectedErrorForModal.tag_type === 'red' ? '#ef4444' : selectedErrorForModal.tag_type === 'blue' ? '#38bdf8' : C.amber,
                    }}
                  >
                    {selectedErrorForModal.tag}
                  </span>
                </h3>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.25rem' }}>{selectedErrorForModal.desc}</div>
              </div>
              <button onClick={() => setSelectedErrorForModal(null)} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div style={{ backgroundColor: '#090a0c', border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.5rem' }}>VÉRITÉ TERRAIN (SOLID BOX)</div>
                <div style={{ height: '200px', backgroundColor: '#1b1d22', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '220px', height: '120px', backgroundColor: '#373c44', borderRadius: '4px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '80px', height: '2px', backgroundColor: '#111', transform: 'rotate(-12deg)' }} />
                    <div style={{ position: 'absolute', inset: '25px 50px', border: '2px solid #22c55e', borderRadius: '2px' }} />
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#090a0c', border: `1px solid ${C.border}`, borderRadius: '6px', padding: '1rem' }}>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.5rem' }}>PRÉDICTION (DASHED BOX)</div>
                <div style={{ height: '200px', backgroundColor: '#1b1d22', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '220px', height: '120px', backgroundColor: '#373c44', borderRadius: '4px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '80px', height: '2px', backgroundColor: '#111', transform: 'rotate(-12deg)' }} />
                    <div style={{ position: 'absolute', inset: '30px 45px', border: '2px dashed #38bdf8', borderRadius: '2px' }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <button
                onClick={() => {
                  setNotification(`✓ ${selectedErrorForModal.image_id} envoyé à Active Learning (07)`);
                  setSelectedErrorForModal(null);
                }}
                style={{ backgroundColor: 'transparent', border: `1px solid ${C.borderLight}`, color: C.text, padding: '0.45rem 1rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Envoyer vers 07 Active Learning
              </button>
              <button
                onClick={() => {
                  setSelectedErrorForModal(null);
                  navigate('/labeling');
                }}
                style={{ backgroundColor: C.amber, color: '#000', fontWeight: 'bold', border: 'none', padding: '0.45rem 1rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                Corriger dans 05 Labeling →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
