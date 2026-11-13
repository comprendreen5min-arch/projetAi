import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { Dataset, TextProfileResponse, TextHistogramItem } from '../types';
import { RefreshCw, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ─── Theme Colors ───────────────────────────────────────────────────────────
const C = {
  bg: '#0c0d0e',
  card: '#121316',
  cardSub: '#16171b',
  border: '#23252a',
  borderLight: '#2e3036',
  amber: '#f59e0b',
  amberDark: '#78350f',
  red: '#f87171',
  redDark: '#7f1d1d',
  green: '#22c55e',
  blue: '#60a5fa',
  muted: '#71717a',
  text: '#e5e7eb',
  textMuted: '#9ca3af',
};

// ─── Segmented Bar Component ────────────────────────────────────────────────
function SegmentedBar({ pct, color }: { pct: number; color: 'amber' | 'red' }) {
  const totalBlocks = 20;
  const filled = Math.min(totalBlocks, Math.max(0, Math.round((pct / 100) * totalBlocks)));
  const fillColor = color === 'red' ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: totalBlocks }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 12,
            borderRadius: 1,
            background: i < filled ? fillColor : '#22242a',
          }}
        />
      ))}
    </div>
  );
}

export const TextProfilingPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    () => localStorage.getItem('datalift_selected_dataset_id') || ''
  );
  const [selectedVersionHash, setSelectedVersionHash] = useState<string>('');
  const [profile, setProfile] = useState<TextProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<TextHistogramItem | null>(null);

  const showNotif = useCallback((msg: string, ok = true) => setNotif({ msg, ok }), []);

  // Initial load & dataset events
  useEffect(() => {
    loadDatasets();

    const onDsChange = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setSelectedDatasetId(e.detail);
        loadVersions(e.detail);
      }
    };
    window.addEventListener('datalift:dataset-changed', onDsChange);
    return () => window.removeEventListener('datalift:dataset-changed', onDsChange);
  }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await api.getDatasets();
      setDatasets(data);

      if (data.length > 0) {
        const storedId = localStorage.getItem('datalift_selected_dataset_id');
        const matchStored = data.find((d) => d.id === storedId);

        const targetDs =
          matchStored ||
          data.find((d) => d.name === 'test_texte.txt') ||
          data.find((d) => d.name === 'support_tickets.jsonl') ||
          data.find((d) => d.name.includes('txt') || d.name.includes('jsonl') || d.name.includes('text') || d.name.includes('review')) ||
          data[0];

        if (targetDs) {
          setSelectedDatasetId(targetDs.id);
          localStorage.setItem('datalift_selected_dataset_id', targetDs.id);
          loadVersions(targetDs.id);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Erreur chargement datasets:', err);
      setLoading(false);
    }
  };

  const loadVersions = async (datasetId: string) => {
    try {
      const vers = await api.getVersions(datasetId);

      if (vers.length > 0) {
        const latestHash = vers[0].version_hash;
        setSelectedVersionHash(latestHash);
        loadProfile(datasetId, latestHash);
      } else {
        setSelectedVersionHash('');
        setProfile(null);
        setLoading(false);
      }
    } catch (err) {
      console.error('Erreur chargement versions:', err);
      setLoading(false);
    }
  };

  const loadProfile = async (datasetId: string, hash?: string) => {
    try {
      setLoading(true);
      const data = await api.getTextProfile(datasetId, hash);
      setProfile(data);
    } catch (err) {
      console.error('Erreur calcul profil texte:', err);
      showNotif('Erreur lors du calcul du profil texte', false);
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (newId: string) => {
    setSelectedDatasetId(newId);
    localStorage.setItem('datalift_selected_dataset_id', newId);
    loadVersions(newId);
  };

  // Upload handler for user text files (.jsonl, .csv, .txt)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const newProfile = await api.uploadTextFile(file);
      setProfile(newProfile);
      showNotif(`Fichier « ${file.name} » importé et analysé avec succès !`, true);
      // Reload datasets list
      const freshDs = await api.getDatasets();
      setDatasets(freshDs);
      setSelectedDatasetId(newProfile.dataset_id);
      localStorage.setItem('datalift_selected_dataset_id', newProfile.dataset_id);
    } catch (err) {
      console.error('Upload failed:', err);
      showNotif("Échec de l'import du fichier texte", false);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading && !profile) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
          color: C.muted,
        }}
      >
        <RefreshCw className="animate-spin" size={30} style={{ color: C.amber }} />
        <span style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: 1.5 }}>
          CHARGEMENT DU PROFIL TEXTUEL…
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', padding: '24px 48px', color: C.text, maxWidth: 1360, margin: '0 auto' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jsonl,.csv,.txt,.tsv"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>PROFILAGE DE TEXTE</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: C.amber,
              border: 'none',
              color: '#000',
              padding: '8px 18px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Upload size={14} />
            <span>{uploading ? 'Importation…' : 'Importer un fichier texte (.jsonl, .csv, .txt)'}</span>
          </button>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${C.borderLight}`,
            borderRadius: 8,
            padding: '4rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: '#121316',
            marginTop: 40,
          }}
        >
          <Upload size={36} style={{ color: C.amber, margin: '0 auto 16px' }} />
          <h3 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 24, margin: '0 0 8px', color: C.text }}>
            Importer un corpus de texte
          </h3>
          <p style={{ color: C.muted, fontSize: 13, maxWidth: 440, margin: '0 auto 20px' }}>
            Glissez-déposez ou cliquez pour importer votre fichier .txt, .jsonl ou .csv et lancer le profilage NLP complet.
          </p>
          <button
            style={{
              background: '#1a1b20',
              border: `1px solid ${C.amber}`,
              color: C.amber,
              padding: '8px 20px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Parcourir les fichiers
          </button>
        </div>
      </div>
    );
  }

  const histogramDetails = profile.length.histogram_details || [];

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
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

      {/* Invisible file input triggered by top button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jsonl,.csv,.txt,.tsv"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {/* ── TOP ACTION BAR ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
          paddingBottom: 16,
          borderBottom: `1px solid ${C.border}`,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        {/* Dataset Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted, letterSpacing: 1.5 }}>
            DATASET ACTIF :
          </span>
          <select
            value={selectedDatasetId}
            onChange={(e) => handleDatasetChange(e.target.value)}
            style={{
              background: '#16171b',
              border: `1px solid ${C.border}`,
              color: C.text,
              padding: '6px 14px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Buttons right: Upload text file + Download report + Continue to cleaning */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: '#1a1b20',
              border: `1px solid ${C.amber}`,
              color: C.amber,
              padding: '7px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s',
            }}
          >
            <Upload size={14} />
            <span>{uploading ? 'Importation…' : 'Importer un fichier texte (.jsonl, .csv, .txt)'}</span>
          </button>

          <button
            onClick={() => showNotif('Rapport de profilage textuel téléchargé')}
            style={{
              background: '#18191d',
              border: `1px solid ${C.border}`,
              color: C.text,
              padding: '7px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Télécharger le rapport
          </button>

          <button
            onClick={() => navigate(`/cleaning?dataset=${selectedDatasetId}&version=${selectedVersionHash}`)}
            style={{
              background: C.amber,
              border: 'none',
              color: '#000',
              padding: '8px 18px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>Passer au nettoyage</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* ── BREADCRUMB + TITLE + 4 KPIS + HEALTH SCORE ────────────────── */}
      <div style={{ marginBottom: 44 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: C.muted, marginBottom: 8 }}>
          {profile.breadcrumb}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          {/* Left: Title + 4 KPIs */}
          <div style={{ flex: 1, minWidth: 320 }}>
            <h1
              style={{
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: 48,
                fontWeight: 400,
                color: C.text,
                margin: '0 0 24px',
                lineHeight: 1.1,
              }}
            >
              {profile.original_filename}
            </h1>

            {/* 4 KPIs row */}
            <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  DOCUMENTS
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.documents}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  LANGUES
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.languages}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  ÉTIQUETTES
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.labels}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  TAILLE
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.size}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Health Score + Segmented Bars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'Georgia, serif',
                  fontSize: 64,
                  fontWeight: 400,
                  color: C.amber,
                  lineHeight: 1,
                  letterSpacing: -1,
                }}
              >
                {profile.health.score}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: C.muted, letterSpacing: 1.5, marginTop: 4 }}>
                SANTÉ / 100
              </div>
            </div>

            {/* Segmented Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 260 }}>
              {profile.health.bars.map((b) => (
                <div
                  key={b.label}
                  style={{ display: 'grid', gridTemplateColumns: '130px 1fr 34px', alignItems: 'center', gap: 10 }}
                >
                  <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{b.label}</span>
                  <SegmentedBar pct={b.pct} color={b.color as any} />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 10,
                      color: b.color === 'red' ? C.red : C.amber,
                      textAlign: 'right',
                    }}
                  >
                    {b.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION: CE QUI REQUIERT VOTRE ATTENTION ──────────────────── */}
      <div style={{ marginBottom: 48 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: 12,
            marginBottom: 4,
          }}
        >
          <h2 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 400, margin: 0 }}>
            Ce qui requiert votre attention
          </h2>
          <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: C.muted }}>
            {profile.findings.length} CONSTATS · PAR IMPACT
          </span>
        </div>

        {/* Findings Rows */}
        <div>
          {profile.findings.map((f) => (
            <div
              key={f.rank}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 130px',
                alignItems: 'center',
                padding: '16px 0',
                borderBottom: `1px solid #191a1f`,
              }}
            >
              {/* Rank & Severity */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>{f.rank}</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    fontWeight: 700,
                    color: f.severity === 'HIGH' ? '#f87171' : f.severity === 'MEDIUM' ? C.amber : C.muted,
                  }}
                >
                  {f.severity}
                </span>
              </div>

              {/* Title & Subtitle */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{f.subtitle}</div>
              </div>

              {/* Action Button */}
              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={() => showNotif(`Action exécutée : ${f.action_label}`)}
                  style={{
                    background: '#15161a',
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    padding: '5px 14px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  {f.action_label}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3-COLUMN VISUAL SECTION: LANGUES · LONGUEUR · ÉTIQUETTES ──── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 32,
          marginBottom: 48,
          alignItems: 'start',
        }}
      >
        {/* Column 1: Langues */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: 8,
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 24, fontWeight: 400, margin: 0 }}>
              Langues
            </h3>
            <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted }}>
              {profile.languages.detected_count} DÉTECTÉES
            </span>
          </div>

          {/* Horizontal stacked bar chart */}
          <div
            style={{
              display: 'flex',
              height: 28,
              borderRadius: 3,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            {profile.languages.slices.map((slice) => (
              <div
                key={slice.name}
                style={{
                  width: `${slice.pct}%`,
                  background: slice.color,
                  height: '100%',
                }}
                title={`${slice.name}: ${slice.pct}%`}
              />
            ))}
          </div>

          {/* Legend 2x2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 16px', marginBottom: 14 }}>
            {profile.languages.slices.map((slice) => (
              <div key={slice.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, background: slice.color, borderRadius: 1 }} />
                <span style={{ color: C.text, flex: 1 }}>{slice.name}</span>
                <span style={{ fontFamily: 'monospace', color: C.muted }}>{slice.pct}%</span>
              </div>
            ))}
          </div>

          {/* Footnote */}
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            {profile.languages.mixed_text}
          </div>
        </div>

        {/* Column 2: Longueur */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: 8,
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 24, fontWeight: 400, margin: 0 }}>
              Longueur
            </h3>
            <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted }}>
              MOTS PAR TEXTE
            </span>
          </div>

          {/* Histogram with vertical bars */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              height: 100,
              paddingBottom: 4,
              borderBottom: `1px solid ${C.border}`,
              marginBottom: 6,
              position: 'relative',
            }}
          >
            {(histogramDetails.length > 0 ? histogramDetails : profile.length.histogram.map((h, i) => ({
              label: `Classe ${i + 1}`,
              count: 0,
              pct: 0,
              height_pct: h,
            }))).map((item, idx, arr) => {
              const isLast = idx === arr.length - 1;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredBucket(item)}
                  onMouseLeave={() => setHoveredBucket(null)}
                  style={{
                    flex: 1,
                    height: `${Math.max(4, item.height_pct)}%`,
                    background: isLast ? '#f87171' : hoveredBucket?.label === item.label ? C.amber : '#4b4d54',
                    borderRadius: '1px 1px 0 0',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  title={`${item.label} : ${item.count} textes (${item.pct} %)`}
                />
              );
            })}
          </div>

          {/* X-axis labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 10, color: C.muted, marginBottom: 8 }}>
            <span>0</span>
            <span>MÉDIANE {profile.length.median}</span>
            <span>{profile.length.max_label}</span>
          </div>

          {/* Hovered class info */}
          {hoveredBucket ? (
            <div style={{ fontSize: 11, color: C.amber, fontFamily: 'monospace', marginBottom: 8 }}>
              ↳ {hoveredBucket.label} : {hoveredBucket.count} textes ({hoveredBucket.pct} %)
            </div>
          ) : (
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace', marginBottom: 8 }}>
              Survolez une barre pour voir le libellé exact
            </div>
          )}

          {/* Footnotes */}
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            <span style={{ color: '#f87171' }}>{profile.length.footnote_empty}</span> ·{' '}
            <span style={{ color: '#f87171' }}>{profile.length.footnote_long}</span>
          </div>
        </div>

        {/* Column 3: Étiquettes */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: 8,
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 24, fontWeight: 400, margin: 0 }}>
              Étiquettes
            </h3>
            <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted }}>
              {profile.labels.has_labels ? `${profile.labels.classes_count} CLASSES` : 'AUCUNE ÉTIQUETTE'}
            </span>
          </div>

          {profile.labels.has_labels && profile.labels.bars.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profile.labels.bars.map((bar) => (
                <div
                  key={bar.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 1fr 45px',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: C.text, fontFamily: 'monospace' }}>{bar.label}</span>
                  <div style={{ background: '#18191e', height: 10, borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${bar.pct}%`,
                        height: '100%',
                        background: bar.color,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <span style={{ fontFamily: 'monospace', color: C.muted, textAlign: 'right' }}>
                    {bar.count_str}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: '#141518',
                border: `1px dashed ${C.borderLight}`,
                borderRadius: 4,
                padding: '24px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 15, color: C.textMuted, marginBottom: 6 }}>
                Aucune étiquette
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                Ce corpus ne contient pas de colonne d'annotation cible (apprentissage non supervisé ou données brutes).
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION: DOUBLONS & RÈGLE DE NORMALISATION (Conditionnelle / Intégrée) ── */}
      {profile.duplicates && (
        <div
          style={{
            background: '#111215',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 24px',
            marginBottom: 48,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 20, margin: '0 0 4px', color: C.text }}>
                Analyse des doublons et quasi-doublons
              </h3>
              <div style={{ fontSize: 12, color: C.muted }}>
                <span style={{ color: C.amber, fontWeight: 500 }}>Règle de normalisation : </span>
                {profile.duplicates.normalization_rule}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20, fontFamily: 'monospace', fontSize: 12 }}>
              <div style={{ background: '#18191d', padding: '6px 14px', borderRadius: 4, border: `1px solid ${C.border}` }}>
                <span style={{ color: C.red, fontWeight: 700 }}>{profile.duplicates.exact_count}</span>{' '}
                <span style={{ color: C.muted }}>doublons exacts ({profile.duplicates.exact_groups_count} groupes)</span>
              </div>
              <div style={{ background: '#18191d', padding: '6px 14px', borderRadius: 4, border: `1px solid ${C.border}` }}>
                <span style={{ color: C.amber, fontWeight: 700 }}>{profile.duplicates.near_count}</span>{' '}
                <span style={{ color: C.muted }}>quasi-doublons ({profile.duplicates.near_groups_count} groupes)</span>
              </div>
            </div>
          </div>

          {/* Duplicate groups display */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 16 }}>
            {/* Exact duplicates */}
            <div style={{ background: '#0e0f11', padding: 14, borderRadius: 4, border: `1px solid #1c1d22` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, color: C.amber, marginBottom: 10 }}>
                DOUBLONS EXACTS ({profile.duplicates.exact_groups_count} GROUPES)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {profile.duplicates.exact_groups.map((g, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.text, borderBottom: '1px solid #16171b', paddingBottom: 6 }}>
                    <span style={{ fontFamily: 'monospace', color: C.red, marginRight: 6 }}>[{g.count}x]</span>
                    <span style={{ color: C.textMuted }}>« {g.text} »</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Near duplicates */}
            <div style={{ background: '#0e0f11', padding: 14, borderRadius: 4, border: `1px solid #1c1d22` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, color: C.blue, marginBottom: 10 }}>
                QUASI-DOUBLONS ({profile.duplicates.near_groups_count} GROUPES DÉTECTÉS)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {profile.duplicates.near_groups.map((g, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.text, borderBottom: '1px solid #16171b', paddingBottom: 6 }}>
                    <span style={{ fontFamily: 'monospace', color: C.amber, marginRight: 6 }}>[{g.count} variantes]</span>
                    <span style={{ color: C.textMuted }}>
                      {g.variants?.slice(0, 2).map((v) => `« ${v} »`).join(' ↔ ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION: EXTRAITS DU CORPUS · PROBLÈMES SIGNALÉS IN SITU ──── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: 10,
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 400, margin: 0 }}>
            Extraits du corpus
          </h2>
          <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: C.muted }}>
            PROBLÈMES SIGNALÉS IN SITU
          </span>
        </div>

        {/* Quotes list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {profile.quotes.map((q, idx) => (
            <div
              key={idx}
              style={{
                background: '#111215',
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                padding: '16px 20px',
                position: 'relative',
              }}
            >
              {/* Quote mark */}
              <div
                style={{
                  fontFamily: 'Georgia, serif',
                  fontSize: 28,
                  color: C.muted,
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                “
              </div>

              {/* Text content with marked wavy underline */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, flex: 1 }}>
                  <span>{q.prefix}</span>
                  {q.marked && (
                    <span
                      style={{
                        textDecoration: 'underline wavy',
                        textDecorationColor: q.mark_style === 'wavy-orange' ? '#f97316' : '#f59e0b',
                        color: q.mark_style === 'wavy-orange' ? '#fb923c' : '#f59e0b',
                        fontWeight: 500,
                      }}
                    >
                      {q.marked}
                    </span>
                  )}
                  <span>{q.suffix}</span>
                </div>

                {/* Tag on right */}
                <span
                  style={{
                    display: 'inline-block',
                    padding: '3px 8px',
                    borderRadius: 3,
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 1,
                    border: `1px solid ${q.tag_color}`,
                    color: q.tag_color,
                    background: 'transparent',
                    flexShrink: 0,
                  }}
                >
                  {q.tag}
                </span>
              </div>

              {/* Metadata in footer */}
              <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 10, color: C.muted }}>
                {q.meta}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
