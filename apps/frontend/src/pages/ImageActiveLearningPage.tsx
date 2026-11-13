import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  ImageActiveLearningDataResponse,
  ImageActiveLearningPick,
  ImageActiveLearningStrategy,
} from '../types';

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

export const ImageActiveLearningPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<ImageActiveLearningDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Strategy filter for Section 3 Picks
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Interactive slider shares and image counts
  const [strategies, setStrategies] = useState<ImageActiveLearningStrategy[]>([]);
  const [roundBudget, setRoundBudget] = useState<number>(500);

  // Picks list (with remove capability)
  const [picks, setPicks] = useState<ImageActiveLearningPick[]>([]);

  // Section 1 Upload Rule Form State
  const [uploadAbove, setUploadAbove] = useState<string>('0.30');
  const [uploadBelow, setUploadBelow] = useState<string>('0.60');
  const [uploadRandomRatio, setUploadRandomRatio] = useState<string>('200');
  const [alwaysUploadCrack, setAlwaysUploadCrack] = useState<boolean>(true);

  // Section 2 Round settings State
  const [line1Min, setLine1Min] = useState<string>('40%');
  const [line2Min, setLine2Min] = useState<string>('40%');
  const [oneFramePerScene, setOneFramePerScene] = useState<boolean>(true);
  const [sendDarkToCleaning, setSendDarkToCleaning] = useState<boolean>(true);
  const [preAnnotateWithModel, setPreAnnotateWithModel] = useState<boolean>(true);

  // Section 4 Stop rule & Pseudo-labels
  const [stopRuleText, setStopRuleText] = useState<string>('1 point · 2 rounds');
  const [pseudoLabelsActive, setPseudoLabelsActive] = useState<boolean>(false);

  // Section 5 Automation cards checkboxes
  const [automationRules, setAutomationRules] = useState<Record<string, boolean>>({
    start_new_images: true,
    drift_camera_flag: true,
    new_camera_random: true,
    retrain_after_round: true,
    ship_upload_rule: true,
    promote_auto: false,
  });

  // Modals & Feedback
  const [notification, setNotification] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showCollectionModal, setShowCollectionModal] = useState<boolean>(false);
  const [showPseudoModal, setShowPseudoModal] = useState<boolean>(false);
  const [selectedImageForInspector, setSelectedImageForInspector] = useState<ImageActiveLearningPick | null>(null);

  // Load datasets on mount
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

        const stored = localStorage.getItem('datalift_selected_dataset_id');
        const match = usableList.find((d) => d.id === stored);
        const preferred =
          match ||
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

  // Listen to dataset changed event from sidebar or other tabs
  useEffect(() => {
    const handleDatasetChanged = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setSelectedDatasetId(e.detail);
      }
    };
    window.addEventListener('datalift:dataset-changed', handleDatasetChanged);
    return () => {
      window.removeEventListener('datalift:dataset-changed', handleDatasetChanged);
    };
  }, []);

  // Listen to TopBar events (Round history)
  useEffect(() => {
    const handleRoundHistory = () => setShowHistoryModal(true);
    window.addEventListener('datalift:open-round-history', handleRoundHistory);
    return () => {
      window.removeEventListener('datalift:open-round-history', handleRoundHistory);
    };
  }, []);

  // Fetch active learning data when dataset changes
  const fetchData = useCallback(
    async (datasetId: string, filter: string = 'all') => {
      if (!datasetId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getImageActiveLearningData(datasetId, filter);
        setData(res);
        setStrategies(res.strategies || []);
        setPicks(res.picks || []);
        if (res.round_settings) {
          setRoundBudget(res.round_settings.images_this_round || 500);
          setLine1Min(`${res.round_settings.line1_min_pct}%`);
          setLine2Min(`${res.round_settings.line2_min_pct}%`);
          setOneFramePerScene(res.round_settings.one_frame_per_scene);
          setSendDarkToCleaning(res.round_settings.send_dark_to_cleaning);
        }
        if (res.upload_rule) {
          setUploadAbove(res.upload_rule.box_above.toFixed(2));
          setUploadBelow(res.upload_rule.box_below.toFixed(2));
          setUploadRandomRatio(String(res.upload_rule.random_frame_in));
          setAlwaysUploadCrack(res.upload_rule.always_upload_crack);
        }
        if (res.stop_rule) {
          setStopRuleText(res.stop_rule.rule_text);
        }
        if (res.automation_cards) {
          const autoMap: Record<string, boolean> = {};
          res.automation_cards.forEach((c) => {
            autoMap[c.id] = c.checked;
          });
          setAutomationRules(autoMap);
        }
      } catch (err: any) {
        setError("Erreur lors de la récupération des données d'apprentissage actif: " + (err.message || 'inconnu'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedDatasetId) {
      fetchData(selectedDatasetId, activeFilter);
    }
  }, [selectedDatasetId, activeFilter, fetchData]);

  // Handle Strategy slider updates
  const handleSliderChange = (idx: number, newShare: number) => {
    const updated = [...strategies];
    updated[idx] = {
      ...updated[idx],
      share_pct: newShare,
      images: Math.round((newShare / 100) * roundBudget),
    };
    setStrategies(updated);
  };

  // Remove pick
  const handleRemovePick = (imageId: string) => {
    setPicks((prev) => prev.filter((p) => p.image_id !== imageId));
    setNotification(`Image ${imageId} retirée de la sélection de ce round.`);
    setTimeout(() => setNotification(null), 3000);
  };

  // Save draft
  const handleSaveDraft = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.saveImageActiveLearningDraft(selectedDatasetId, {
        round: data?.round_badge ? `R${data.round_badge}` : 'R3',
        budget: roundBudget,
        strategies,
      });
      setNotification('✓ Brouillon du Round sauvegardé avec succès.');
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setError('Erreur lors de la sauvegarde: ' + (err.message || 'inconnu'));
    }
  };

  // Send to labeling
  const handleSendToLabeling = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.sendImageActiveLearningToLabeling(selectedDatasetId, {
        count: roundBudget,
        target_version: data?.metrics?.output || 'v5',
      });
      setNotification(`✓ ${roundBudget} images envoyées dans la file 05 Labeling.`);
      setTimeout(() => {
        setNotification(null);
        navigate('/labeling');
      }, 1500);
    } catch (err: any) {
      setError("Erreur lors de l'envoi vers 05 Labeling: " + (err.message || 'inconnu'));
    }
  };

  // Calculations for total share
  const totalShare = useMemo(() => {
    return strategies.reduce((acc, s) => acc + s.share_pct, 0);
  }, [strategies]);

  const totalImagesCalculated = useMemo(() => {
    return strategies.reduce((acc, s) => acc + s.images, 0);
  }, [strategies]);

  // Filtered picks for Section 3
  const filteredPicks = useMemo(() => {
    if (activeFilter === 'all') return picks;
    return picks.filter((p) => p.strategy_key === activeFilter);
  }, [picks, activeFilter]);

  // SVG Thumbnail Renderer
  const renderThumbnail = (pick: ImageActiveLearningPick) => {
    const isDark = pick.defect_type === 'dark_frame';
    const isClean = pick.defect_type === 'clean';
    const bgColor = isDark ? '#1a1b1e' : '#2d3036';
    const surfaceTexture = isDark ? '#23252a' : '#393c43';

    return (
      <svg
        viewBox="0 0 200 125"
        style={{ width: '100%', height: '100%', display: 'block', backgroundColor: bgColor }}
      >
        <defs>
          <pattern id={`grid-${pick.image_id}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="20" y2="20" stroke={surfaceTexture} strokeWidth="0.5" strokeOpacity="0.4" />
          </pattern>
        </defs>
        <rect width="200" height="125" fill={`url(#grid-${pick.image_id})`} />

        {/* Feature representation based on shape */}
        {pick.box.shape === 'dot' && (
          <>
            <circle cx="100" cy="62" r="5" fill="#111" opacity="0.8" />
            <rect
              x="75"
              y="42"
              width="50"
              height="40"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </>
        )}

        {pick.box.shape === 'slash' && (
          <>
            <line x1="60" y1="75" x2="140" y2="50" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
            <rect
              x="50"
              y="40"
              width="100"
              height="45"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </>
        )}

        {pick.box.shape === 'double_box' && (
          <>
            <rect
              x="80"
              y="45"
              width="55"
              height="45"
              fill="none"
              stroke="#4b5563"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <rect
              x="92"
              y="35"
              width="55"
              height="45"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </>
        )}

        {pick.box.shape === 'crack_red' && (
          <>
            <line x1="130" y1="35" x2="175" y2="58" stroke="#111" strokeWidth="2" strokeLinecap="round" />
            <rect
              x="120"
              y="25"
              width="65"
              height="45"
              fill="none"
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </>
        )}

        {pick.box.shape === 'empty_box' && (
          <rect
            x="65"
            y="45"
            width="60"
            height="40"
            fill="none"
            stroke="#6b7280"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {pick.box.shape === 'small_corner' && (
          <rect
            x="140"
            y="75"
            width="40"
            height="35"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {isClean && (
          <text x="100" y="65" textAnchor="middle" fill="#4b5563" fontSize="10" fontFamily="monospace">
            [No box predicted]
          </text>
        )}
      </svg>
    );
  };

  return (
    <div
      style={{
        backgroundColor: C.bg,
        minHeight: '100vh',
        color: C.text,
        padding: '1.5rem 2rem 5rem 2rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '2rem',
            backgroundColor: '#16171b',
            border: `1px solid ${C.amber}`,
            color: C.amberLight,
            padding: '0.85rem 1.5rem',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{notification}</span>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            padding: '0.85rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Dataset selector bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.75rem',
          paddingBottom: '1rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, textTransform: 'uppercase' }}>
          Jeu de données :
        </span>
        <select
          value={selectedDatasetId}
          onChange={(e) => {
            const newId = e.target.value;
            setSelectedDatasetId(newId);
            localStorage.setItem('datalift_selected_dataset_id', newId);
            window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: newId }));
          }}
          style={{
            backgroundColor: C.card,
            color: C.text,
            border: `1px solid ${C.borderLight}`,
            borderRadius: '4px',
            padding: '0.4rem 0.85rem',
            fontSize: '0.82rem',
            fontFamily: 'monospace',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}/
            </option>
          ))}
        </select>
        {loading && (
          <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: C.amber }}>
            Chargement des données...
          </span>
        )}
      </div>

      {/* Top Header & Breadcrumb */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            fontSize: '0.65rem',
            fontFamily: 'monospace',
            letterSpacing: '0.12em',
            color: C.textMuted,
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
          }}
        >
          {data?.subtitle ||
            'ACTIVE LEARNING · ROUND 3 · SCORED BY YOLO-DEFECTS-V4 · OBJECT DETECTION · 6 CLASSES'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1
              style={{
                fontFamily: 'Newsreader, Georgia, serif',
                fontStyle: 'italic',
                fontSize: '2.5rem',
                fontWeight: 400,
                color: '#f4f4f6',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              {data?.dataset_name ? `${data.dataset_name}/` : 'product_defects/'}
            </h1>
          </div>

          {/* Large dynamic round badge on top right */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '0.65rem',
                fontFamily: 'monospace',
                letterSpacing: '0.15em',
                color: C.amberLight,
                fontWeight: 'bold',
                textTransform: 'uppercase',
              }}
            >
              {data?.round_state || 'DRAFT'}
            </div>
            <div
              style={{
                fontFamily: 'Newsreader, Georgia, serif',
                fontStyle: 'italic',
                fontSize: '3.6rem',
                color: C.amber,
                lineHeight: 0.95,
                margin: '0.1rem 0',
              }}
            >
              {data?.round_badge || '03'}
            </div>
            <div
              style={{
                fontSize: '0.62rem',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
                color: C.textMuted,
                textTransform: 'uppercase',
              }}
            >
              {data?.round_state_label || 'NEXT ROUND'}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Key Metrics Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          marginBottom: '2rem',
          paddingBottom: '1.5rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {/* POOL */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            POOL
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.pool || '6,950'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.pool_sub || 'uploaded from 48,300 frames · 7 days'}
          </div>
        </div>

        {/* BUDGET */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            BUDGET
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.budget || '500 images'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.budget_sub || "≈ 1 h 20 at the team's pace"}
          </div>
        </div>

        {/* RARE CLASS */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            RARE CLASS
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.text, margin: '0.2rem 0' }}>
            {data?.metrics?.rare_class || 'crack'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.rare_class_sub || '272 real boxes'}
          </div>
        </div>

        {/* OUTPUT */}
        <div>
          <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
            OUTPUT
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 600, color: C.amber, margin: '0.2rem 0' }}>
            {data?.metrics?.output || 'v5'}
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
            {data?.metrics?.output_sub || 'v4 kept as is'}
          </div>
        </div>
      </div>

      {/* Explanatory Banner: HOW ACTIVE LEARNING WORKS FOR IMAGES */}
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '6px',
          padding: '1.25rem 1.5rem',
          marginBottom: '2.5rem',
        }}
      >
        <div
          style={{
            fontSize: '0.68rem',
            fontFamily: 'monospace',
            letterSpacing: '0.12em',
            color: C.amberLight,
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
            fontWeight: 'bold',
          }}
        >
          {data?.info_banner?.title || 'HOW ACTIVE LEARNING WORKS FOR IMAGES'}
        </div>
        <p
          style={{
            fontSize: '0.82rem',
            lineHeight: 1.6,
            color: '#c5c8d0',
            margin: 0,
            fontFamily: 'monospace',
          }}
        >
          {data?.info_banner?.text ||
            "The line cameras produce far more frames than anyone can label. The mini PCs already run the model, so they upload only the frames it is unsure about. Datalift then picks the most useful of those, one per scene, and sends them to 05 with the model's boxes drawn in."}
        </p>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: LOOP */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            1 · Loop
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            STARTS ON THE DEVICE, ENDS IN A NEW VERSION
          </span>
        </div>

        {/* Stepper bar (6 steps) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          {(data?.loop_steps || [
            { step: '0 · ON DEVICE', stat: '6,950 uploaded', note: '✓ 7 days', status: 'done' },
            { step: '1 · SCORE POOL', stat: '+ flips, scales', note: '✓ done · 18 min', status: 'done' },
            { step: '2 · PICK IMAGES', stat: '500 previewed', note: 'now', status: 'active' },
            { step: '3 · LABEL IN 05', stat: 'pre-annotated', note: 'waiting', status: 'pending' },
            { step: '4 · RETRAIN IN 06', stat: 'yolo11s.yaml', note: 'waiting', status: 'pending' },
            { step: '5 · MEASURE', stat: 'crack AP · test', note: 'waiting', status: 'pending' },
          ]).map((st, idx) => {
            const isActive = st.status === 'active';
            const isDone = st.status === 'done';
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: C.card,
                  border: isActive ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isActive ? '0 0 12px rgba(245, 158, 11, 0.15)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: isActive ? C.amberLight : C.textMuted,
                    fontWeight: isActive ? 'bold' : 'normal',
                    marginBottom: '0.35rem',
                  }}
                >
                  {st.step}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: C.text, marginBottom: '0.25rem' }}>
                  {st.stat}
                </div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontFamily: 'monospace',
                    color: isDone ? C.green : isActive ? C.amber : C.textFaint,
                  }}
                >
                  {st.note}
                </div>
              </div>
            );
          })}
        </div>

        {/* 2-Column row: Upload rule on mini PCs & Rounds list */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
          {/* Left card: Upload rule on the mini PCs */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.2rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                Upload rule on the mini PCs
              </h3>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>
                VERSIONED WITH THE ROUND
              </span>
            </div>

            {/* Inputs row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1.2fr',
                gap: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                  }}
                >
                  Upload if a box is above
                </label>
                <input
                  type="text"
                  value={uploadAbove}
                  onChange={(e) => setUploadAbove(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                  }}
                >
                  And below
                </label>
                <input
                  type="text"
                  value={uploadBelow}
                  onChange={(e) => setUploadBelow(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                  }}
                >
                  Or 1 random frame in
                </label>
                <input
                  type="text"
                  value={uploadRandomRatio}
                  onChange={(e) => setUploadRandomRatio(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Checkbox always upload crack */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  color: C.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={alwaysUploadCrack}
                  onChange={(e) => setAlwaysUploadCrack(e.target.checked)}
                  style={{ accentColor: C.amber }}
                />
                <span>Always upload when a crack is predicted</span>
              </label>
            </div>

            {/* Stat Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                borderTop: `1px solid ${C.border}`,
                paddingTop: '0.85rem',
                marginBottom: '0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              <div>
                <span style={{ color: C.textMuted, fontSize: '0.65rem' }}>FRAMES SEEN: </span>
                <span style={{ fontWeight: 600 }}>{data?.upload_rule?.frames_seen || '48,300'}</span>
              </div>
              <div>
                <span style={{ color: C.textMuted, fontSize: '0.65rem' }}>UPLOADED: </span>
                <span style={{ fontWeight: 600 }}>{data?.upload_rule?.uploaded || '6,950'}</span>
              </div>
              <div>
                <span style={{ color: C.textMuted, fontSize: '0.65rem' }}>NOT UPLOADED: </span>
                <span style={{ fontWeight: 600, color: C.amber }}>
                  {data?.upload_rule?.not_uploaded_pct || '86%'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
              The random 1-in-200 keeps an honest sample of what the line really looks like.
            </div>
          </div>

          {/* Right card: Round history status list */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {(data?.rounds_history || [
              { round: 'R1', name: 'ROUND 1 · COLD START', images: '1,000 random', strategy: 'cold start', target_version: 'v2', status: 'DONE' },
              { round: 'R2', name: 'ROUND 2 · DONE', images: '412 · uncertain boxes', strategy: 'uncertain boxes', target_version: 'v4', status: 'DONE' },
              { round: 'R3', name: 'ROUND 3 · DRAFT', images: '500 · 6 strategies', strategy: '6 strategies', target_version: 'v5', status: 'DRAFT' },
            ]).map((rnd, idx) => {
              const isDraft = rnd.status === 'DRAFT';
              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: isDraft ? '#17181c' : '#0e0f11',
                    border: isDraft ? `1.5px solid ${C.amber}` : `1px solid ${C.border}`,
                    borderRadius: '5px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '0.65rem',
                        fontFamily: 'monospace',
                        color: isDraft ? C.amberLight : C.textMuted,
                        fontWeight: 'bold',
                      }}
                    >
                      {rnd.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: C.text, marginTop: '0.2rem' }}>
                      {rnd.images} {rnd.strategy ? `· ${rnd.strategy}` : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      color: isDraft ? C.amber : C.textMuted,
                      fontWeight: 'bold',
                    }}
                  >
                    → {rnd.target_version}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: WHAT TO PICK */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            2 · What to pick
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            A MIX, NOT ONE RULE
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem' }}>
          {/* Left Column: Sliders Table */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    color: C.textMuted,
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '0.5rem 0.5rem 0.75rem 0.5rem' }}>STRATEGY</th>
                  <th style={{ padding: '0.5rem 0.5rem 0.75rem 0.5rem' }}>SHARE OF THE ROUND</th>
                  <th style={{ padding: '0.5rem 0.5rem 0.75rem 0.5rem', textAlign: 'right' }}>IMAGES</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((strat, idx) => (
                  <tr key={strat.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.85rem 0.5rem', verticalAlign: 'middle', width: '42%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, color: C.text }}>{strat.name}</span>
                        {strat.badge && (
                          <span
                            style={{
                              fontSize: '0.58rem',
                              border: `1px solid ${C.borderLight}`,
                              color: C.textMuted,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '2px',
                            }}
                          >
                            {strat.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: C.textMuted, marginTop: '0.2rem' }}>
                        {strat.description}
                      </div>
                    </td>

                    <td style={{ padding: '0.85rem 0.5rem', verticalAlign: 'middle' }}>
                      <input
                        type="range"
                        min="0"
                        max="60"
                        step="5"
                        value={strat.share_pct}
                        onChange={(e) => handleSliderChange(idx, parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: C.amber, cursor: 'pointer' }}
                      />
                    </td>

                    <td
                      style={{
                        padding: '0.85rem 0.5rem',
                        textAlign: 'right',
                        fontWeight: 'bold',
                        color: C.text,
                        fontSize: '0.85rem',
                        verticalAlign: 'middle',
                      }}
                    >
                      {strat.images}
                    </td>
                  </tr>
                ))}

                {/* TOTAL Row */}
                <tr>
                  <td style={{ padding: '0.85rem 0.5rem', fontWeight: 'bold', color: C.text }}>TOTAL</td>
                  <td style={{ padding: '0.85rem 0.5rem', color: C.textMuted, fontSize: '0.72rem' }}></td>
                  <td
                    style={{
                      padding: '0.85rem 0.5rem',
                      textAlign: 'right',
                      fontWeight: 'bold',
                      color: totalShare === 100 ? C.amber : C.text,
                    }}
                  >
                    ✓ {totalShare}% · {totalImagesCalculated} images
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right Column: Round Settings Card */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.25rem',
                  color: '#f4f4f6',
                  margin: '0 0 1rem 0',
                }}
              >
                Round settings
              </h3>

              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    marginBottom: '0.35rem',
                    textTransform: 'uppercase',
                  }}
                >
                  Images this round
                </label>
                <input
                  type="number"
                  value={roundBudget}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 100;
                    setRoundBudget(val);
                    setStrategies((prev) =>
                      prev.map((s) => ({
                        ...s,
                        images: Math.round((s.share_pct / 100) * val),
                      }))
                    );
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Line 1 & Line 2 inputs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      color: C.textMuted,
                      marginBottom: '0.35rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    Line 1 · at least
                  </label>
                  <input
                    type="text"
                    value={line1Min}
                    onChange={(e) => setLine1Min(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090a0c',
                      border: `1px solid ${C.borderLight}`,
                      color: C.text,
                      padding: '0.45rem 0.65rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      color: C.textMuted,
                      marginBottom: '0.35rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    Line 2 · at least
                  </label>
                  <input
                    type="text"
                    value={line2Min}
                    onChange={(e) => setLine2Min(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090a0c',
                      border: `1px solid ${C.borderLight}`,
                      color: C.text,
                      padding: '0.45rem 0.65rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={oneFramePerScene}
                    onChange={(e) => setOneFramePerScene(e.target.checked)}
                    style={{ accentColor: C.amber }}
                  />
                  <span>One frame per scene group · the sharpest</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sendDarkToCleaning}
                    onChange={(e) => setSendDarkToCleaning(e.target.checked)}
                    style={{ accentColor: C.amber }}
                  />
                  <span>Too dark → send to 02, not to labeling</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={preAnnotateWithModel}
                    onChange={(e) => setPreAnnotateWithModel(e.target.checked)}
                    style={{ accentColor: C.amber }}
                  />
                  <span>
                    Pre-annotate with {data?.round_settings?.pre_annotate_model || 'yolo-defects-v4 · min 0.30'}
                  </span>
                </label>
              </div>

              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.25rem' }}>
                Never picked: test images · copy-paste images (locked)
              </div>
            </div>

            {/* Red Alert Box: CRACK · 272 REAL BOXES */}
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '5px',
                padding: '0.85rem',
              }}
            >
              <div
                style={{
                  color: '#ef4444',
                  fontSize: '0.65rem',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  letterSpacing: '0.1em',
                  marginBottom: '0.35rem',
                }}
              >
                {data?.round_settings?.collection_alert?.class_name || 'CRACK'} ·{' '}
                {data?.round_settings?.collection_alert?.real_boxes || '272 REAL BOXES'}
              </div>
              <p
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  color: '#e5e7eb',
                  margin: '0 0 0.65rem 0',
                  lineHeight: 1.4,
                }}
              >
                {data?.round_settings?.collection_alert?.message ||
                  "Picking can't find cracks that were never filmed. Ask the line for more."}
              </p>
              <button
                type="button"
                onClick={() => setShowCollectionModal(true)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {data?.round_settings?.collection_alert?.action_label || 'Send a collection request...'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: PICKS */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            3 · Picks
          </h2>

          {/* Filter Pills */}
          <div
            style={{
              display: 'flex',
              gap: '0.35rem',
              backgroundColor: '#090a0c',
              border: `1px solid ${C.border}`,
              borderRadius: '4px',
              padding: '2px',
            }}
          >
            {[
              { id: 'all', label: `All · ${roundBudget}` },
              { id: 'uncertain', label: 'Uncertain · 150' },
              { id: 'crack_or_scratch', label: 'Crack or scratch · 100' },
              { id: 'flips', label: 'Flips · 75' },
              { id: 'rare', label: 'Rare · 75' },
              { id: 'diversity', label: 'Diversity · 50' },
              { id: 'random', label: 'Random · 50' },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setActiveFilter(pill.id)}
                style={{
                  backgroundColor: activeFilter === pill.id ? C.amber : 'transparent',
                  color: activeFilter === pill.id ? '#000' : C.textMuted,
                  fontWeight: activeFilter === pill.id ? 'bold' : 'normal',
                  border: 'none',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '3px',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4x2 Grid of 8 Image Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '0.75rem',
          }}
        >
          {filteredPicks.map((pick) => (
            <div
              key={pick.image_id}
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {/* Image Preview Canvas */}
              <div
                onClick={() => setSelectedImageForInspector(pick)}
                style={{
                  height: '115px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  marginBottom: '0.65rem',
                  border: `1px solid ${C.border}`,
                }}
                title="Click to open inspector"
              >
                {renderThumbnail(pick)}
              </div>

              {/* Bottom Metadata */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.35rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      fontWeight: 'bold',
                      color: C.text,
                    }}
                  >
                    {pick.image_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePick(pick.image_id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: C.textMuted,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      padding: 0,
                    }}
                    title="Remove from round"
                  >
                    ✕
                  </button>
                </div>

                <div style={{ marginBottom: '0.35rem' }}>
                  <span
                    style={{
                      fontSize: '0.6rem',
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '2px',
                      border: `1px solid ${
                        pick.tag_type === 'red'
                          ? '#ef4444'
                          : pick.tag_type === 'blue'
                          ? '#38bdf8'
                          : pick.tag_type === 'orange'
                          ? C.amber
                          : '#4b5563'
                      }`,
                      color:
                        pick.tag_type === 'red'
                          ? '#ef4444'
                          : pick.tag_type === 'blue'
                          ? '#38bdf8'
                          : pick.tag_type === 'orange'
                          ? C.amber
                          : '#9ca3af',
                    }}
                  >
                    {pick.tag}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '0.68rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pick.description}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
          Dashed = model box. Click an image to open it with all its predictions and the frames from the same scene that
          were skipped. Annotators never see why an image was picked.
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: IS IT WORTH IT? */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            4 · Is it worth it?
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            MEASURED ON THE LOCKED TEST SET
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '1.5rem' }}>
          {/* Left Column: Learning curve Card */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'Newsreader, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.25rem',
                    color: '#f4f4f6',
                    margin: 0,
                  }}
                >
                  Learning curve
                </h3>
                <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: C.textMuted }}>
                  {data?.learning_curve?.metric_label || 'CRACK AP@50 VS LABELED IMAGES'}
                </span>
              </div>

              {/* Metric Result Badge */}
              <div
                style={{
                  display: 'inline-block',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: `1px solid ${C.amberBorder}`,
                  padding: '0.35rem 0.65rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  marginBottom: '1.25rem',
                }}
                title={data?.learning_curve?.metric_tooltip || 'AP@50 crack: R1=42%, R2=52%, R3=58%'}
              >
                <span style={{ color: C.textMuted }}>CRACK AP@50 · </span>
                <span style={{ color: C.amber, fontWeight: 'bold' }}>[RESULT]</span>
              </div>

              {/* SVG Learning Curve Chart */}
              <div style={{ height: '140px', width: '100%', marginBottom: '1rem' }}>
                <svg viewBox="0 0 320 130" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  {/* Grid lines */}
                  <line x1="40" y1="20" x2="290" y2="20" stroke="#1f232b" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="40" y1="60" x2="290" y2="60" stroke="#1f232b" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="40" y1="100" x2="290" y2="100" stroke="#1f232b" strokeWidth="1" />

                  {/* Random baseline dashed line */}
                  <path d="M 60 95 L 170 82 L 270 70" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 4" />

                  {/* Active learning line */}
                  <path d="M 60 95 L 170 65 L 270 45" fill="none" stroke={C.amber} strokeWidth="2.5" />
                  <path d="M 270 45 L 305 37" fill="none" stroke={C.amber} strokeWidth="2" strokeDasharray="3 3" opacity="0.6" />

                  {/* Points */}
                  <circle cx="60" cy="95" r="4.5" fill={C.amber} />
                  <circle cx="170" cy="65" r="4.5" fill={C.amber} />
                  <circle cx="270" cy="45" r="4.5" fill={C.amber} />

                  {/* X labels */}
                  <text x="60" y="118" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                    R1
                  </text>
                  <text x="170" y="118" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                    R2
                  </text>
                  <text x="270" y="118" fill="#6b7280" fontSize="10" fontFamily="monospace" textAnchor="middle">
                    R3
                  </text>
                </svg>
              </div>

              {/* Legend */}
              <div
                style={{
                  display: 'flex',
                  gap: '1.25rem',
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  marginBottom: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: C.amber }}>
                  <span>—</span>
                  <span>active learning</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: C.textMuted }}>
                  <span>--</span>
                  <span>same number of random images</span>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>
              Shape is illustrative. Also shown per class and per camera.
            </div>
          </div>

          {/* Right Column: Rounds Table & Stop Rule / Pseudo Labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Table */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1rem',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      color: C.textMuted,
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: '0.5rem' }}>ROUND</th>
                    <th style={{ padding: '0.5rem' }}>IMAGES</th>
                    <th style={{ padding: '0.5rem' }}>STRATEGY</th>
                    <th style={{ padding: '0.5rem' }}>HOURS</th>
                    <th style={{ padding: '0.5rem' }}>DATA</th>
                    <th style={{ padding: '0.5rem' }}>MODEL</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>AP Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rounds_history || [
                    { round: 'R1', images: '1,000', strategy: 'random · cold start', hours: '3 h', data: 'v2', model: 'yolo-defects-v2', ap_gain: '—' },
                    { round: 'R2', images: '412', strategy: 'uncertain boxes', hours: '1 h 05', data: 'v4', model: 'yolo-defects-v4', ap_gain: '[RESULT]' },
                    { round: 'R3', images: '500', strategy: '6 strategies', hours: '≈ 1 h 20', data: 'v5', model: '—', ap_gain: '—' },
                  ]).map((rh, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '0.65rem 0.5rem', fontWeight: 'bold', color: C.text }}>{rh.round}</td>
                      <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>{rh.images}</td>
                      <td style={{ padding: '0.65rem 0.5rem', color: C.text }}>{rh.strategy}</td>
                      <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>{rh.hours}</td>
                      <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>{rh.data}</td>
                      <td style={{ padding: '0.65rem 0.5rem', color: C.textMuted }}>{rh.model}</td>
                      <td
                        style={{
                          padding: '0.65rem 0.5rem',
                          textAlign: 'right',
                          color: rh.ap_gain === '—' ? C.textMuted : C.amber,
                          fontWeight: 'bold',
                        }}
                        title={rh.ap_gain !== '—' ? '+3.4 points AP@50' : undefined}
                      >
                        {rh.ap_gain}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sub-cards Row: STOP RULE & PSEUDO-LABELS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr', gap: '1rem' }}>
              {/* STOP RULE */}
              <div
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: C.textMuted,
                    letterSpacing: '0.1em',
                    marginBottom: '0.5rem',
                  }}
                >
                  STOP RULE
                </div>
                <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                  STOP WHEN CRACK AP GAINS UNDER
                </div>
                <input
                  type="text"
                  value={stopRuleText}
                  onChange={(e) => setStopRuleText(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    marginBottom: '0.5rem',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted }}>
                  {data?.stop_rule?.note || 'Then rounds only start on a new camera or a drift alert.'}
                </div>
              </div>

              {/* PSEUDO-LABELS */}
              <div
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
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, letterSpacing: '0.1em' }}>
                      PSEUDO-LABELS · "OK" FRAMES
                    </span>
                    <span
                      style={{
                        fontSize: '0.58rem',
                        fontFamily: 'monospace',
                        color: pseudoLabelsActive ? C.green : C.textMuted,
                        border: `1px solid ${pseudoLabelsActive ? C.green : C.borderLight}`,
                        padding: '0.05rem 0.35rem',
                        borderRadius: '2px',
                        fontWeight: 'bold',
                      }}
                    >
                      {pseudoLabelsActive ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'monospace',
                      color: C.textMuted,
                      margin: '0 0 0.65rem 0',
                      lineHeight: 1.4,
                    }}
                  >
                    {data?.pseudo_labels?.description ||
                      'Accept "no defect" frames above 0.98 for train only. Marked origin = pseudo, 5% spot-checked, never in val or test.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPseudoModal(true)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.4rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  {pseudoLabelsActive ? 'Settings...' : 'Turn on...'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 5: AUTOMATION */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            5 · Automation
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            ROUNDS CAN START ON THEIR OWN; PROMOTION NEVER DOES
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
          }}
        >
          {(data?.automation_cards || [
            { id: 'start_new_images', label: 'Start when 2,000 new images arrive', sub: 'Uses the mix above', checked: true, disabled: false },
            { id: 'drift_camera_flag', label: 'Start when 08 Drift flags lighting or a camera', sub: 'Picks focus on the drifted camera', checked: true, disabled: false },
            { id: 'new_camera_random', label: 'New camera installed → 300 random frames first', sub: 'Cold start before uncertainty works', checked: true, disabled: false },
            { id: 'retrain_after_round', label: 'Retrain in 06 after each round', sub: 'Template yolo11s.yaml', checked: true, disabled: false },
            { id: 'ship_upload_rule', label: 'Ship the upload rule with the model', sub: 'Devices get both together', checked: true, disabled: false },
            { id: 'promote_auto', label: 'Promote automatically', sub: 'Not available · shadow mode first in 06', checked: false, disabled: true },
          ]).map((card) => {
            const isChecked = automationRules[card.id] ?? card.checked;
            return (
              <label
                key={card.id}
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  cursor: card.disabled ? 'not-allowed' : 'pointer',
                  opacity: card.disabled ? 0.45 : 1,
                }}
              >
                <input
                  type="checkbox"
                  disabled={card.disabled}
                  checked={isChecked}
                  onChange={(e) =>
                    setAutomationRules((prev) => ({
                      ...prev,
                      [card.id]: e.target.checked,
                    }))
                  }
                  style={{ accentColor: C.amber, marginTop: '0.2rem' }}
                />
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: C.text, marginBottom: '0.25rem' }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                    {card.sub}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION: GUARDRAILS */}
      {/* ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '1.25rem',
            paddingBottom: '0.5rem',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h2
            style={{
              fontFamily: 'Newsreader, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '1.65rem',
              color: '#f4f4f6',
              margin: 0,
            }}
          >
            Guardrails
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: C.textMuted,
              textTransform: 'uppercase',
            }}
          >
            CHECKED BEFORE A ROUND IS SENT
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
          }}
        >
          {(data?.guardrails || [
            { label: 'Test images never picked', description: 'The locked test set stays untouched', status: 'ok' },
            { label: '10% random control', description: 'Measures the real gain', status: 'ok' },
            { label: 'One frame per scene group', description: 'No near-duplicates in a round', status: 'ok' },
            { label: 'Generated images never picked', description: 'Copy-paste follows its parent', status: 'ok' },
            { label: 'Pseudo-labels train only', description: 'origin = pseudo · spot-checked', status: 'ok' },
            { label: 'Upload rule is recorded', description: 'You know what was never uploaded', status: 'ok' },
            { label: 'Every round makes a new version', description: 'v4 stays as is · round log attached', status: 'ok' },
            { label: 'line 2 at night has no labels', description: 'Diversity picks go there first', status: 'warning' },
          ]).map((g, idx) => {
            const isWarning = g.status === 'warning';
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: C.card,
                  border: isWarning ? '1px solid rgba(245, 158, 11, 0.4)' : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                }}
              >
                <div style={{ marginTop: '0.1rem' }}>
                  {isWarning ? (
                    <AlertTriangle size={15} color={C.amber} />
                  ) : (
                    <Check size={15} color={C.green} />
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: isWarning ? C.amberLight : C.text,
                      marginBottom: '0.2rem',
                    }}
                  >
                    {g.label}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted }}>
                    {g.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* BOTTOM ACTION BAR */}
      {/* ========================================================================= */}
      <div
        style={{
          position: 'sticky',
          bottom: '0',
          left: '0',
          right: '0',
          backgroundColor: '#0c0d0e',
          borderTop: `1px solid ${C.border}`,
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
        }}
      >
        <div>
          <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: C.text, fontWeight: 'bold' }}>
            {data?.bottom_bar?.text || `Round 3 · ${roundBudget} images · 6 strategies · creates v5`}
          </div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: C.textMuted, marginTop: '0.15rem' }}>
            {data?.bottom_bar?.subtext ||
              'Round log saved: model used, upload rule, score of every image, why each image was picked'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={handleSaveDraft}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: C.text,
              padding: '0.5rem 1.15rem',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Save draft
          </button>

          <button
            type="button"
            onClick={handleSendToLabeling}
            style={{
              backgroundColor: C.amber,
              border: 'none',
              color: '#000',
              padding: '0.5rem 1.25rem',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {data?.bottom_bar?.send_label || `Send ${roundBudget} images to labeling →`}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ROUND HISTORY */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.cardElevated,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '1.75rem',
              width: '650px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.35rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                Round history
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                marginBottom: '1.5rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem' }}>
                  <th style={{ padding: '0.5rem' }}>ROUND</th>
                  <th style={{ padding: '0.5rem' }}>IMAGES</th>
                  <th style={{ padding: '0.5rem' }}>STRATEGY</th>
                  <th style={{ padding: '0.5rem' }}>DATA</th>
                  <th style={{ padding: '0.5rem' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rounds_history || []).map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 'bold' }}>{r.round}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{r.images}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{r.strategy}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{r.data}</td>
                    <td
                      style={{
                        padding: '0.6rem 0.5rem',
                        color: r.status === 'DONE' ? C.green : C.amber,
                        fontWeight: 'bold',
                      }}
                    >
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SEND COLLECTION REQUEST */}
      {/* ========================================================================= */}
      {showCollectionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.cardElevated,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '1.75rem',
              width: '500px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.35rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                Send a collection request
              </h3>
              <button
                type="button"
                onClick={() => setShowCollectionModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.25rem' }}>
              Request targeted defect recording for rare class <strong>crack</strong> across camera lines.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                  TARGET CAMERAS
                </label>
                <select
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                  }}
                >
                  <option>All lines (Line 1 & Line 2)</option>
                  <option>Line 2 only (night shifts prioritized)</option>
                  <option>Line 1 only</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                  SAMPLES REQUESTED
                </label>
                <input
                  type="text"
                  defaultValue="200 dedicated defect frames"
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowCollectionModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem 0.85rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCollectionModal(false);
                  setNotification('✓ Demande de collecte envoyée aux opérateurs de ligne.');
                  setTimeout(() => setNotification(null), 3500);
                }}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Send request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PSEUDO-LABELS TOGGLE MODAL */}
      {/* ========================================================================= */}
      {showPseudoModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.cardElevated,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '1.75rem',
              width: '520px',
              maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3
                style={{
                  fontFamily: 'Newsreader, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '1.35rem',
                  color: '#f4f4f6',
                  margin: 0,
                }}
              >
                Pseudo-labels configuration
              </h3>
              <button
                type="button"
                onClick={() => setShowPseudoModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Automatically ingest pristine / "no defect" frames with model confidence &gt; 0.98. These frames will be
              tagged with <code>origin = pseudo</code> and only fed to the <strong>train</strong> split.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pseudoLabelsActive}
                  onChange={(e) => setPseudoLabelsActive(e.target.checked)}
                  style={{ accentColor: C.amber }}
                />
                <span>Enable automated pseudo-labeling for "OK" frames</span>
              </label>

              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMuted, marginBottom: '0.35rem' }}>
                  HUMAN SPOT-CHECK RATE
                </label>
                <input
                  type="text"
                  defaultValue="5% of accepted pseudo frames"
                  style={{
                    width: '100%',
                    backgroundColor: '#090a0c',
                    border: `1px solid ${C.borderLight}`,
                    color: C.text,
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowPseudoModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.borderLight}`,
                  color: C.text,
                  padding: '0.45rem 0.85rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPseudoModal(false);
                  setNotification(`✓ Pseudo-labels ${pseudoLabelsActive ? 'activés' : 'désactivés'}.`);
                  setTimeout(() => setNotification(null), 3000);
                }}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: IMAGE INSPECTOR */}
      {/* ========================================================================= */}
      {selectedImageForInspector && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.cardElevated,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '1.75rem',
              width: '680px',
              maxWidth: '92vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3
                  style={{
                    fontFamily: 'Newsreader, Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.35rem',
                    color: '#f4f4f6',
                    margin: 0,
                  }}
                >
                  Inspection · {selectedImageForInspector.image_id}
                </h3>
                <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: C.textMuted }}>
                  {selectedImageForInspector.line} · Defect: {selectedImageForInspector.defect_type} · Conf:{' '}
                  {selectedImageForInspector.confidence}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImageForInspector(null)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '1.1rem' }}
              >
                ✕
              </button>
            </div>

            {/* High-res simulated viewport */}
            <div
              style={{
                height: '280px',
                width: '100%',
                borderRadius: '6px',
                overflow: 'hidden',
                border: `1px solid ${C.border}`,
                marginBottom: '1rem',
              }}
            >
              {renderThumbnail(selectedImageForInspector)}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.75rem',
                backgroundColor: '#0e0f12',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '0.85rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                marginBottom: '1.25rem',
              }}
            >
              <div>
                <div style={{ color: C.textMuted }}>STRATEGY</div>
                <div style={{ fontWeight: 'bold', color: C.amber, marginTop: '0.2rem' }}>
                  {selectedImageForInspector.tag}
                </div>
              </div>
              <div>
                <div style={{ color: C.textMuted }}>WHY PICKED</div>
                <div style={{ color: C.text, marginTop: '0.2rem' }}>
                  {selectedImageForInspector.description}
                </div>
              </div>
              <div>
                <div style={{ color: C.textMuted }}>BOUNDING BOX</div>
                <div style={{ color: C.text, marginTop: '0.2rem' }}>
                  x={selectedImageForInspector.box.x} y={selectedImageForInspector.box.y} w={selectedImageForInspector.box.w} h={selectedImageForInspector.box.h}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedImageForInspector(null)}
                style={{
                  backgroundColor: C.amber,
                  color: '#000',
                  border: 'none',
                  padding: '0.45rem 1.25rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Close inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
