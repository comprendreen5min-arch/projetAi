import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, X } from 'lucide-react';
import { api } from '../services/api';
import {
  Dataset,
  ImageLabelingDataResponse,
  ImageLabelingBoundingBox,
} from '../types';

const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardElevated: '#16171b',
  border: '#1e2025',
  borderLight: '#2a2d35',
  text: '#e1e4ea',
  textMuted: '#6b7280',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  amberBg: 'rgba(245, 158, 11, 0.08)',
  blue: '#3b82f6',
  blueBg: 'rgba(59, 130, 246, 0.15)',
  green: '#22c55e',
  red: '#ef4444',
};

export const ImageLabelingPage: React.FC = () => {
  const navigate = useNavigate();

  // Datasets
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [data, setData] = useState<ImageLabelingDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Queue and Filmstrip selection
  const [activeQueue, setActiveQueue] = useState<string>('unlabeled');
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(2);

  // Workspace interactive state
  const [activeTool, setActiveTool] = useState<'box' | 'polygon' | 'zoom'>('box');
  const [hideModelSuggestions, setHideModelSuggestions] = useState<boolean>(false);
  const [boxes, setBoxes] = useState<ImageLabelingBoundingBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('box_1');
  const [selectedClassId, setSelectedClassId] = useState<number>(6); // crack

  // Modals & Feedback
  const [notification, setNotification] = useState<string | null>(null);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState<boolean>(false);
  const [showFlagModal, setShowFlagModal] = useState<boolean>(false);
  const [flagReason, setFlagReason] = useState<string>('blurry');

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

  // Listen to TopBar events (e.g. Labeling guidelines)
  useEffect(() => {
    const handleGuidelines = () => setShowGuidelinesModal(true);
    window.addEventListener('datalift:labeling-guidelines', handleGuidelines);
    return () => window.removeEventListener('datalift:labeling-guidelines', handleGuidelines);
  }, []);

  // Fetch labeling data
  const fetchData = useCallback(
    async (datasetId: string, queue: string = 'unlabeled', index: number = 2) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getImageLabelingData(datasetId, queue, index);
        setData(res);
        setBoxes(res.workspace?.boxes || []);
        if (res.workspace?.boxes && res.workspace.boxes.length > 0) {
          setSelectedBoxId(res.workspace.boxes[0].id);
        }
      } catch (err: any) {
        setError("Erreur lors de la récupération des données d'étiquetage: " + (err.message || ''));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedDatasetId) {
      fetchData(selectedDatasetId, activeQueue, selectedImageIndex);
    }
  }, [selectedDatasetId, activeQueue, selectedImageIndex, fetchData]);

  // Handle dataset change
  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDatasetId(newId);
    setSelectedImageIndex(2);
    window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: { id: newId } }));
  };

  // Keyboard shortcuts (A, 1-6, Enter, Del)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'a' || e.key === 'A') {
        handleAcceptSuggestion();
      } else if (e.key >= '1' && e.key <= '6') {
        const classNum = parseInt(e.key, 10);
        setSelectedClassId(classNum);
        const cls = data?.workspace?.classes.find((c) => c.id === classNum);
        if (cls && selectedBoxId) {
          updateBoxLabel(selectedBoxId, cls.name);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBoxId) {
          handleDeleteBox(selectedBoxId);
        }
      } else if (e.key === 'Enter') {
        handleSaveAndNext();
      } else if (e.key === 'h' || e.key === 'H') {
        setHideModelSuggestions((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBoxId, data, selectedImageIndex]);

  // Box actions
  const updateBoxLabel = (boxId: string, newLabel: string) => {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.id === boxId) {
          return {
            ...b,
            label: newLabel,
            tag: `${newLabel} · drawn by you`,
            type: 'human',
            color: '#f59e0b',
          };
        }
        return b;
      })
    );
    setNotification(`Boîte étiquetée en "${newLabel}"`);
    setTimeout(() => setNotification(null), 2500);
  };

  const handleDeleteBox = (boxId: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== boxId));
    if (selectedBoxId === boxId) {
      setSelectedBoxId('');
    }
    setNotification('Boîte supprimée');
    setTimeout(() => setNotification(null), 2000);
  };

  const handleAcceptSuggestion = () => {
    const suggestion = data?.workspace?.model_suggestions?.[0];
    if (!suggestion) return;
    const newBox: ImageLabelingBoundingBox = {
      id: `box_${Date.now()}`,
      label: suggestion.label,
      tag: `${suggestion.label} · accepted AI`,
      type: 'human',
      x: 320,
      y: 145,
      width: 80,
      height: 80,
      color: '#f59e0b',
      selected: true,
    };
    setBoxes((prev) => [...prev.filter((b) => b.type !== 'model'), newBox]);
    setSelectedBoxId(newBox.id);
    setNotification(`Suggestion "${suggestion.label} (${suggestion.confidence})" acceptée`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRejectSuggestion = () => {
    setBoxes((prev) => prev.filter((b) => b.type !== 'model'));
    setNotification('Suggestions du modèle rejetées pour cette image');
    setTimeout(() => setNotification(null), 2500);
  };

  const handleSaveAndNext = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.submitImageLabelDecision(selectedDatasetId, {
        image_id: data?.workspace?.image_name || 'IMG_07734.JPG',
        boxes,
      });
      setNotification(`Annotations enregistrées pour ${data?.workspace?.image_name}. Image suivante...`);
      setTimeout(() => {
        setNotification(null);
        setSelectedImageIndex((prev) => (prev + 1) % (data?.workspace?.filmstrip.length || 6));
      }, 1000);
    } catch (err: any) {
      setNotification('Erreur enregistrement: ' + err.message);
    }
  };

  const handleSaveV4 = async () => {
    if (!selectedDatasetId) return;
    try {
      const outputV = data?.kpis?.output || 'v4';
      await api.saveImageLabelV4(selectedDatasetId, { version_name: outputV });
      setNotification(`Version ${outputV} créée avec succès avec journal d'audit complet ! Redirection vers le training...`);
      setTimeout(() => {
        setNotification(null);
        navigate('/training');
      }, 1800);
    } catch (err: any) {
      setNotification('Erreur création de version: ' + err.message);
    }
  };

  const handleFlagSubmit = () => {
    setShowFlagModal(false);
    setNotification(`Image ${data?.workspace?.image_name} signalée (${flagReason}). Retirée de la file.`);
    setTimeout(() => {
      setNotification(null);
      setSelectedImageIndex((prev) => (prev + 1) % 6);
    }, 2000);
  };

  if (loading && !data) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '2.5rem', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'monospace' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: C.amber, animation: 'ping 1s infinite' }} />
          Chargement de l'étiquetage image...
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {
    to_label: '1,120',
    to_label_sub: 'sent from 02 Cleaning',
    suspected_errors: '214',
    suspected_errors_sub: 'model disagrees ≥ 0.9',
    done_today: '386',
    done_today_sub: '3 annotators · 1 reviewer',
    output: 'v4',
    output_sub: 'v3 kept as is',
  };

  const gauge = data?.gauge || {
    coverage_before: 91,
    coverage_after: 100,
    label: 'LABEL COVERAGE / 100',
  };

  const ws = data?.workspace || {
    queue_name: 'UNLABELED',
    image_name: 'IMG_07734.JPG',
    image_position: '413 / 1,120',
    image_url: '',
    filmstrip: [],
    active_filmstrip_index: 2,
    boxes: [],
    model_suggestions: [],
    classes: [],
    image_meta: { why_in_queue: 'no boxes', split: 'train', scene_group: 'g-0188 · 3 frames', augmented_children: '0 · none yet' },
    guideline: { label: 'CRACK', desc: 'Thin line that breaks the surface. A line you can wipe off is a stain.' },
  };

  return (
    <div
      style={{
        backgroundColor: C.bg,
        minHeight: '100vh',
        color: C.text,
        padding: '1.5rem 3rem 6rem 3rem',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Toast Notification */}
      {error && (
        <div
          style={{
            backgroundColor: '#451a1a',
            border: `1px solid ${C.red}`,
            color: '#fca5a5',
            padding: '0.75rem 1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.8rem',
            fontFamily: 'monospace',
          }}
        >
          {error}
        </div>
      )}
      {notification && (
        <div
          style={{
            position: 'fixed',
            bottom: '5rem',
            right: '3rem',
            zIndex: 9999,
            backgroundColor: '#1c1917',
            border: `1px solid ${C.amber}`,
            color: '#fef3c7',
            padding: '0.85rem 1.4rem',
            borderRadius: '6px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <Check size={16} color={C.amber} />
          {notification}
        </div>
      )}

      {/* Dataset Selector Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
          paddingBottom: '0.85rem',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: '0.72rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace' }}>
          JEU DE DONNÉES :
        </span>
        <select
          value={selectedDatasetId}
          onChange={handleDatasetChange}
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.borderLight}`,
            color: C.text,
            padding: '0.35rem 0.85rem',
            borderRadius: '4px',
            fontSize: '0.8rem',
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

      {/* Header Breadcrumb & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <div
            style={{
              fontSize: '0.68rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: C.textMuted,
              fontFamily: 'monospace',
              marginBottom: '0.4rem',
            }}
          >
            {data?.breadcrumb || 'DATASET · V3 → V4 DRAFT · OBJECT DETECTION · 6 CLASSES'}
          </div>
          <h1
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '2.4rem',
              color: '#ffffff',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {data?.display_title || 'product_defects/'}
          </h1>
        </div>

        {/* Large Coverage Gauge (91 -> 100) */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.85rem' }}>
            <span style={{ fontSize: '3rem', fontWeight: 300, color: '#64748b', fontFamily: '"Playfair Display", Georgia, serif' }}>
              {gauge.coverage_before}
            </span>
            <span style={{ fontSize: '1.75rem', color: '#64748b' }}>→</span>
            <span
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: '4.2rem',
                lineHeight: 1,
                color: C.amber,
                fontWeight: 400,
              }}
            >
              {gauge.coverage_after}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.62rem', letterSpacing: '0.14em', color: C.textMuted, fontFamily: 'monospace', marginTop: '0.2rem' }}>
            <span>BEFORE</span>
            <span style={{ color: C.amber }}>{gauge.label}</span>
          </div>
        </div>
      </div>

      {/* 4 KPIs Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1.25rem',
          marginBottom: '2.5rem',
        }}
      >
        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            TO LABEL
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.to_label}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.to_label_sub}
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            SUSPECTED ERRORS
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.suspected_errors}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.suspected_errors_sub}
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            DONE TODAY
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.done_today}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.done_today_sub}
          </div>
        </div>

        <div style={{ borderLeft: `1px solid ${C.borderLight}`, paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            OUTPUT
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 500, color: '#ffffff', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {kpis.output}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted, marginTop: '0.2rem' }}>
            {kpis.output_sub}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1 · Queues Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.65rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            1·Queues
          </h2>
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            DATALIFT PICKS WHAT TO LABEL FIRST
          </span>
        </div>

        {/* 4 Queue Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          {data?.queues.map((q) => {
            const isActive = activeQueue === q.id;
            return (
              <div
                key={q.id}
                onClick={() => setActiveQueue(q.id)}
                style={{
                  backgroundColor: C.card,
                  border: isActive ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '1.15rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isActive ? `0 0 15px ${C.amberBg}` : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.65rem', letterSpacing: '0.08em', color: isActive ? C.amber : C.textMuted, fontFamily: 'monospace' }}>
                      {q.title}
                    </span>
                    {isActive && (
                      <span
                        style={{
                          fontSize: '0.55rem',
                          fontFamily: 'monospace',
                          border: `1px solid ${C.amber}`,
                          color: C.amber,
                          padding: '0.05rem 0.35rem',
                          borderRadius: '2px',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '1.85rem', fontWeight: 500, color: '#ffffff', fontFamily: 'monospace', marginBottom: '0.4rem' }}>
                    {q.count}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: C.textMuted, lineHeight: 1.45, minHeight: '2.5rem' }}>
                    {q.desc}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: '0.7rem', color: C.textMuted, fontFamily: 'monospace' }}>
                    {q.progress_text}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveQueue(q.id);
                    }}
                    style={{
                      backgroundColor: isActive ? C.amber : 'transparent',
                      border: isActive ? 'none' : `1px solid ${C.borderLight}`,
                      color: isActive ? '#000000' : '#ffffff',
                      fontWeight: isActive ? 600 : 400,
                      padding: '0.35rem 0.85rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    {q.action_label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Queue Dropdowns Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace', display: 'block', marginBottom: '0.3rem' }}>
              PRE-ANNOTATION
            </label>
            <select
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                color: '#ffffff',
                padding: '0.45rem 0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              <option>{data?.queue_settings?.pre_annotation || 'yolo-defects-v3 · min 0.30'}</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace', display: 'block', marginBottom: '0.3rem' }}>
              ORDER INSIDE A QUEUE
            </label>
            <select
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                color: '#ffffff',
                padding: '0.45rem 0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              <option>{data?.queue_settings?.order_inside_queue || 'Most uncertain first'}</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace', display: 'block', marginBottom: '0.3rem' }}>
              DOUBLE ANNOTATION
            </label>
            <select
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                color: '#ffffff',
                padding: '0.45rem 0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              <option>{data?.queue_settings?.double_annotation || '10% of items · for agreement'}</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace', display: 'block', marginBottom: '0.3rem' }}>
              ASSIGN
            </label>
            <select
              style={{
                width: '100%',
                backgroundColor: C.card,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '4px',
                color: '#ffffff',
                padding: '0.45rem 0.65rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              <option>{data?.queue_settings?.assign || 'Split between 3 annotators'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2 · Workspace Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <h2
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '1.65rem',
              color: '#ffffff',
              margin: 0,
            }}
          >
            2·Workspace
          </h2>
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
            {ws.queue_name} · {ws.image_name} · {ws.image_position}
          </span>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderBottom: 'none',
            borderRadius: '6px 6px 0 0',
            padding: '0.65rem 1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveTool('box')}
              style={{
                backgroundColor: activeTool === 'box' ? '#262626' : 'transparent',
                border: activeTool === 'box' ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                color: activeTool === 'box' ? C.amber : '#d1d5db',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Box <span style={{ color: C.textMuted }}>B</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('polygon')}
              style={{
                backgroundColor: activeTool === 'polygon' ? '#262626' : 'transparent',
                border: activeTool === 'polygon' ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                color: activeTool === 'polygon' ? C.amber : '#d1d5db',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Polygon <span style={{ color: C.textMuted }}>P</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNotification('Boîtes de la frame précédente copiées');
                setTimeout(() => setNotification(null), 2500);
              }}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${C.border}`,
                color: '#d1d5db',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Copy previous boxes <span style={{ color: C.textMuted }}>C</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBoxes([]);
                setNotification('Image marquée "No defect · ok"');
                setTimeout(() => setNotification(null), 2500);
              }}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${C.border}`,
                color: '#d1d5db',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              No defect · ok <span style={{ color: C.textMuted }}>0</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('zoom')}
              style={{
                backgroundColor: activeTool === 'zoom' ? '#262626' : 'transparent',
                border: activeTool === 'zoom' ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                color: activeTool === 'zoom' ? C.amber : '#d1d5db',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Zoom <span style={{ color: C.textMuted }}>Z</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedBoxId) handleDeleteBox(selectedBoxId);
              }}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${C.border}`,
                color: '#d1d5db',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Delete box <span style={{ color: C.textMuted }}>Del</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNotification('Action annulée');
                setTimeout(() => setNotification(null), 2000);
              }}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${C.border}`,
                color: '#d1d5db',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              Undo <span style={{ color: C.textMuted }}>^Z</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setHideModelSuggestions((prev) => !prev)}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: hideModelSuggestions ? C.amber : '#d1d5db',
              padding: '0.3rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {hideModelSuggestions ? 'Show model suggestions' : 'Hide model suggestions'} <span style={{ color: C.textMuted }}>H</span>
          </button>
        </div>

        {/* Main Workspace Grid (Canvas + Right Panel) */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Canvas & Filmstrip Container */}
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '0 0 6px 6px',
              padding: '1.25rem',
            }}
          >
            {/* Visual Canvas Area */}
            <div
              style={{
                width: '100%',
                height: '420px',
                backgroundColor: '#14161a',
                borderRadius: '4px',
                position: 'relative',
                overflow: 'hidden',
                border: `1px solid ${C.borderLight}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Product Background Image */}
              {ws.image_url ? (
                <img
                  src={ws.image_url}
                  alt={ws.image_name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', backgroundColor: '#202328' }} />
              )}

              {/* Interactive Bounding Boxes Overlay */}
              <svg
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  cursor: 'crosshair',
                }}
              >
                {boxes.map((box) => {
                  if (box.type === 'model' && hideModelSuggestions) return null;
                  const isSelected = selectedBoxId === box.id;
                  const isModel = box.type === 'model';
                  const isDrawing = box.type === 'drawing';

                  return (
                    <g key={box.id} onClick={() => setSelectedBoxId(box.id)} style={{ cursor: 'pointer' }}>
                      <rect
                        x={box.x}
                        y={box.y}
                        width={box.width}
                        height={box.height}
                        fill={isSelected ? 'rgba(245, 158, 11, 0.08)' : 'transparent'}
                        stroke={isModel ? '#3b82f6' : '#f59e0b'}
                        strokeWidth={isSelected ? '2' : '1.5'}
                        strokeDasharray={isModel || isDrawing ? '4 4' : 'none'}
                      />

                      {/* Tag / Label above box */}
                      <rect
                        x={box.x}
                        y={box.y - 18}
                        width={Math.max(80, box.tag.length * 6.5)}
                        height="18"
                        fill={isModel ? '#1e3a8a' : '#d97706'}
                      />
                      <text
                        x={box.x + 4}
                        y={box.y - 5}
                        fill="#ffffff"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="500"
                      >
                        {box.tag}
                      </text>

                      {/* Corner Handles if Selected */}
                      {isSelected && (
                        <>
                          <rect x={box.x - 3} y={box.y - 3} width="6" height="6" fill="#000000" stroke="#f59e0b" strokeWidth="1.5" />
                          <rect x={box.x + box.width - 3} y={box.y - 3} width="6" height="6" fill="#000000" stroke="#f59e0b" strokeWidth="1.5" />
                          <rect x={box.x - 3} y={box.y + box.height - 3} width="6" height="6" fill="#000000" stroke="#f59e0b" strokeWidth="1.5" />
                          <rect x={box.x + box.width - 3} y={box.y + box.height - 3} width="6" height="6" fill="#000000" stroke="#f59e0b" strokeWidth="1.5" />
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Legend inside canvas */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '0.85rem',
                  right: '0.85rem',
                  display: 'flex',
                  gap: '0.5rem',
                  fontSize: '0.62rem',
                  fontFamily: 'monospace',
                }}
              >
                <span
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    border: '1px dashed #3b82f6',
                    color: '#93c5fd',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '2px',
                  }}
                >
                  DASHED = MODEL SUGGESTION
                </span>
                <span
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    border: '1px solid #f59e0b',
                    color: '#fcd34d',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '2px',
                  }}
                >
                  SOLID = HUMAN
                </span>
              </div>
            </div>

            {/* Filmstrip / Carousel */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '0.65rem',
                marginTop: '1rem',
              }}
            >
              {ws.filmstrip.map((img, i) => {
                const isCurrent = selectedImageIndex === i;
                return (
                  <div
                    key={img.id}
                    onClick={() => setSelectedImageIndex(i)}
                    style={{
                      backgroundColor: '#1b1d22',
                      border: isCurrent ? `2px solid ${C.amber}` : `1px solid ${C.borderLight}`,
                      borderRadius: '4px',
                      height: '52px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isCurrent ? `0 0 10px ${C.amberBg}` : 'none',
                    }}
                  >
                    {img.thumb ? (
                      <img src={img.thumb} alt={img.id} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '0.6rem', color: C.textMuted, fontFamily: 'monospace' }}>
                        {img.id}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Keyboard Shortcuts Bar */}
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: `1px solid ${C.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.65rem',
                fontFamily: 'monospace',
                color: C.textMuted,
              }}
            >
              <span><strong style={{ color: '#ffffff' }}>[ A ]</strong> accept suggestion</span>
              <span><strong style={{ color: '#ffffff' }}>[ 1-6 ]</strong> class / change class</span>
              <span><strong style={{ color: '#ffffff' }}>[ Tab ]</strong> next box</span>
              <span><strong style={{ color: '#ffffff' }}>[ Del ]</strong> delete box</span>
              <span><strong style={{ color: '#ffffff' }}>[ U ]</strong> unsure</span>
              <span><strong style={{ color: '#ffffff' }}>[ S ]</strong> skip</span>
              <span><strong style={{ color: '#ffffff' }}>[ Enter ]</strong> save & next</span>
            </div>
          </div>

          {/* Right Workspace Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Model Suggestion Card */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1rem 1.15rem',
              }}
            >
              <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace', marginBottom: '0.65rem' }}>
                MODEL SUGGESTION
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
                {(ws.model_suggestions || []).map((s) => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                    <span style={{ color: '#ffffff' }}>{s.label}</span>
                    <span style={{ color: C.textMuted }}>{s.confidence}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleAcceptSuggestion}
                  style={{
                    backgroundColor: '#1e293b',
                    border: `1px solid #334155`,
                    color: '#ffffff',
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Accept <span style={{ color: C.amber }}>A</span>
                </button>
                <button
                  type="button"
                  onClick={handleRejectSuggestion}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.border}`,
                    color: C.textMuted,
                    padding: '0.45rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Reject
                </button>
              </div>
            </div>

            {/* Boxes on this Image Card */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1rem 1.15rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.65rem' }}>
                <span style={{ fontSize: '0.65rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace' }}>
                  BOXES ON THIS IMAGE · {boxes.length}
                </span>
                <span style={{ fontSize: '0.62rem', color: C.textMuted }}>edit any of them</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {boxes.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBoxId(b.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: selectedBoxId === b.id ? C.cardElevated : 'transparent',
                      border: `1px solid ${selectedBoxId === b.id ? C.amber : C.borderLight}`,
                      borderRadius: '4px',
                      padding: '0.35rem 0.5rem',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: b.type === 'model' ? '#93c5fd' : '#ffffff' }}>
                      {b.label} <span style={{ fontSize: '0.65rem', color: C.textMuted }}>· {b.type}</span>
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <select
                        value={b.label}
                        onChange={(e) => updateBoxLabel(b.id, e.target.value)}
                        style={{
                          backgroundColor: '#262626',
                          border: `1px solid ${C.borderLight}`,
                          color: '#ffffff',
                          borderRadius: '2px',
                          fontSize: '0.68rem',
                          padding: '0.15rem 0.35rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        {ws.classes.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBox(b.id);
                        }}
                        style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: '0.1rem' }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '0.65rem', color: C.textMuted, lineHeight: 1.4 }}>
                Drag a box to move it, drag a corner to resize. A model box you edit becomes yours.
              </div>
            </div>

            {/* Classes Card */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1rem 1.15rem',
              }}
            >
              <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace', marginBottom: '0.65rem' }}>
                CLASSES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {ws.classes.map((cls) => {
                  const isSelected = selectedClassId === cls.id;
                  return (
                    <div
                      key={cls.id}
                      onClick={() => {
                        setSelectedClassId(cls.id);
                        if (selectedBoxId) updateBoxLabel(selectedBoxId, cls.name);
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                        border: isSelected ? `1px solid ${C.amber}` : `1px solid transparent`,
                        borderRadius: '4px',
                        padding: '0.35rem 0.5rem',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: C.textMuted }}>[{cls.shortcut}]</span>
                        <span style={{ color: '#ffffff' }}>{cls.name}</span>
                      </div>
                      <div style={{ color: cls.is_rare ? C.amber : C.textMuted }}>
                        {cls.count} {cls.is_rare && '· rare'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* This Image Details */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '1rem 1.15rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
              }}
            >
              <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: C.textMuted, marginBottom: '0.5rem' }}>
                THIS IMAGE
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ color: C.textMuted }}>Why in queue</span>
                <span style={{ color: '#ffffff' }}>{ws.image_meta?.why_in_queue}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ color: C.textMuted }}>Split</span>
                <span style={{ color: '#ffffff' }}>{ws.image_meta?.split}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ color: C.textMuted }}>Scene group</span>
                <span style={{ color: '#ffffff' }}>{ws.image_meta?.scene_group}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.textMuted }}>Augmented children</span>
                <span style={{ color: '#ffffff' }}>{ws.image_meta?.augmented_children}</span>
              </div>
            </div>

            {/* Guideline Card */}
            <div
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '0.85rem 1.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '30px',
                  backgroundColor: '#1b1d22',
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '25px', height: '1.5px', backgroundColor: '#d1d5db', transform: 'rotate(-20deg)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: C.textMuted, fontFamily: 'monospace' }}>
                  GUIDELINE · {ws.guideline?.label}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#d1d5db', lineHeight: 1.35, marginTop: '0.2rem' }}>
                  {ws.guideline?.desc}
                </div>
              </div>
            </div>

            {/* Flag & Ask Reviewer Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowFlagModal(true)}
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.borderLight}`,
                  color: '#ffffff',
                  padding: '0.45rem',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Flag image...
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotification('Demande envoyée au relecteur');
                  setTimeout(() => setNotification(null), 2500);
                }}
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.borderLight}`,
                  color: '#ffffff',
                  padding: '0.45rem',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                Ask reviewer
              </button>
            </div>
            <div style={{ fontSize: '0.62rem', color: C.textMuted, lineHeight: 1.4 }}>
              Flag: blurry, wrong product or unclear rule. The image leaves the queue and goes back to Cleaning or to the guideline owner.
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3 · Label checks & Team Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '2.75rem', display: 'grid', gridTemplateColumns: '1.3fr 1.7fr', gap: '2rem' }}>
        {/* Label Checks */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
            <h2
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '1.65rem',
                color: '#ffffff',
                margin: 0,
              }}
            >
              3·Label checks
            </h2>
            <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
              RUN ON EVERY SAVE
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data?.label_checks.map((chk) => (
              <div
                key={chk.title}
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '6px',
                  padding: '0.85rem 1.15rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#ffffff' }}>{chk.title}</div>
                  <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{chk.sub}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600, color: C.amber }}>
                    {chk.count}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setNotification(`Filtre activé sur "${chk.title}"`);
                      setTimeout(() => setNotification(null), 2500);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: `1px solid ${C.borderLight}`,
                      color: '#ffffff',
                      padding: '0.3rem 0.65rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    Fix →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
            <h2
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '1.65rem',
                color: '#ffffff',
                margin: 0,
              }}
            >
              Team
            </h2>
            <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: C.textMuted, fontFamily: 'monospace' }}>
              TODAY
            </span>
          </div>

          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              padding: '1.15rem',
              marginBottom: '0.75rem',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textMuted, fontSize: '0.65rem' }}>
                  <th style={{ paddingBottom: '0.65rem' }}>ANNOTATOR</th>
                  <th style={{ paddingBottom: '0.65rem' }}>ITEMS / H</th>
                  <th style={{ paddingBottom: '0.65rem' }}>ACCEPTS AI</th>
                  <th style={{ paddingBottom: '0.65rem', textAlign: 'right' }}>AGREEMENT</th>
                </tr>
              </thead>
              <tbody>
                {data?.team.map((t) => (
                  <tr key={t.annotator} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '0.75rem 0', color: '#ffffff' }}>{t.annotator}</td>
                    <td style={{ padding: '0.75rem 0', color: '#d1d5db' }}>{t.items_per_h}</td>
                    <td style={{ padding: '0.75rem 0', color: t.is_flagged ? C.amber : '#d1d5db' }}>
                      {t.accepts_ai}
                    </td>
                    <td style={{ padding: '0.75rem 0', textAlign: 'right', color: '#ffffff' }}>{t.agreement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: '0.65rem', color: C.textMuted, lineHeight: 1.45 }}>
            Agreement (Cohen's kappa) is measured on the 10% annotated twice. Accepting almost every suggestion is flagged: it can mean the model is copied, not checked.
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Guardrails Section */}
      {/* ------------------------------------------------------------- */}
      <div style={{ marginBottom: '4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
          <h3
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: '1.25rem',
              fontWeight: 400,
              color: '#ffffff',
              margin: 0,
            }}
          >
            Guardrails
          </h3>
          <span style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: C.textMuted, fontFamily: 'monospace' }}>
            CHECKED BEFORE SAVING
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {data?.guardrails.map((g) => (
            <div
              key={g.title}
              style={{
                backgroundColor: C.card,
                border: g.is_warning ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
              }}
            >
              {g.is_warning ? (
                <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
              ) : (
                <Check size={16} color={C.green} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
              )}
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#ffffff', marginBottom: '0.15rem' }}>
                  {g.title}
                </div>
                <div style={{ fontSize: '0.68rem', color: C.textMuted }}>{g.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Bottom Sticky Action Banner */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#090a0b',
          borderTop: `1px solid ${C.border}`,
          padding: '1rem 3rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
            {data?.action_banner?.summary || '412 labeled · 87 corrected · 23 augmented children invalidated'}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.textMuted }}>
            {data?.action_banner?.detail || 'Saved as v4 with the label log attached; the augmentation recipe can replay on it'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => {
              setNotification('Re-run de l\'augmentation lancé');
              setTimeout(() => setNotification(null), 3000);
            }}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${C.borderLight}`,
              color: '#d1d5db',
              padding: '0.55rem 1.25rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {data?.action_banner?.secondary_action || 'Re-run augmentation on v4'}
          </button>

          <button
            type="button"
            onClick={handleSaveV4}
            style={{
              backgroundColor: C.amber,
              border: 'none',
              color: '#000000',
              padding: '0.55rem 1.4rem',
              borderRadius: '4px',
              fontSize: '0.82rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {data?.action_banner?.primary_action || 'Save as v4'}
          </button>
        </div>
      </div>

      {/* Flag Image Modal */}
      {showFlagModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: '8px',
              padding: '2rem',
              width: '420px',
              maxWidth: '90%',
            }}
          >
            <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '1.3rem', color: '#ffffff', margin: '0 0 0.5rem 0' }}>
              Flag image {ws.image_name}
            </h3>
            <p style={{ fontSize: '0.78rem', color: C.textMuted, marginBottom: '1.25rem' }}>
              Specify the issue with this image. It will leave the annotation queue.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
              {['blurry', 'wrong product', 'unclear rule', 'corrupted'].map((r) => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontSize: '0.8rem', color: '#ffffff' }}>
                  <input
                    type="radio"
                    name="flag_reason"
                    checked={flagReason === r}
                    onChange={() => setFlagReason(r)}
                    style={{ accentColor: C.amber }}
                  />
                  {r.toUpperCase()}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowFlagModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFlagSubmit}
                style={{
                  backgroundColor: C.red,
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.45rem 1.15rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Confirm Flag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guidelines Modal */}
      {showGuidelinesModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.borderLight}`,
              borderRadius: '8px',
              padding: '2rem',
              width: '560px',
              maxWidth: '90%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '1.3rem', color: '#ffffff', margin: 0 }}>
                Labeling Guidelines · Object Detection
              </h3>
              <button
                type="button"
                onClick={() => setShowGuidelinesModal(false)}
                style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#d1d5db', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div><strong>1. Tight bounding boxes:</strong> Ensure boxes closely bound the defect without excess background padding.</div>
              <div><strong>2. Crack vs Stain:</strong> A crack breaks the material surface. A surface smudge that could be cleaned is categorized as stain.</div>
              <div><strong>3. Multiple defects:</strong> When a part contains both a dent and a scratch, label each defect separately with its own bounding box.</div>
              <div><strong>4. Rare classes:</strong> Pay close attention to rare classes like crack and misaligned to prevent class imbalance.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageLabelingPage;
