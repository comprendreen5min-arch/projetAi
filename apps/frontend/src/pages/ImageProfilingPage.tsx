import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { Dataset, ImageProfileResponse, ImageContactSheetItem } from '../types';
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

// ─── 20-Segment Bar Component ───────────────────────────────────────────────
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

// ─── Class Frequency Segmented Bar Component ────────────────────────────────
function ClassSegmentedBar({ pct, color }: { pct: number; color: string }) {
  const totalBlocks = 24;
  const filled = Math.min(totalBlocks, Math.max(1, Math.round((pct / 100) * totalBlocks)));

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', flex: 1 }}>
      {Array.from({ length: totalBlocks }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 12,
            borderRadius: 1,
            background: i < filled ? color : '#1c1d22',
          }}
        />
      ))}
    </div>
  );
}

// ─── Contact Sheet Visual Thumbnail ─────────────────────────────────────────
function ContactSheetThumbnail({ item }: { item: ImageContactSheetItem }) {
  if (item.thumbnail_url) {
    return (
      <div
        style={{
          width: '100%',
          height: 110,
          background: '#090a0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <img
          src={item.thumbnail_url}
          alt={item.type}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  const type = item.type;
  if (type === 'BLURRY') {
    return (
      <div
        style={{
          width: '100%',
          height: 110,
          background: '#27282b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: 70,
            height: 48,
            border: '2px solid rgba(255,255,255,0.25)',
            borderRadius: 3,
            filter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#34363b',
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#1c1d20', filter: 'blur(2px)' }} />
        </div>
      </div>
    );
  }

  if (type === 'TOO DARK') {
    return (
      <div
        style={{
          width: '100%',
          height: 110,
          background: '#131416',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 70,
            height: 48,
            border: '1px solid #1c1d20',
            borderRadius: 3,
            background: '#18191c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#090a0b' }} />
        </div>
      </div>
    );
  }

  if (type === 'OVEREXPOSED') {
    return (
      <div
        style={{
          width: '100%',
          height: 110,
          background: '#757873',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 70,
            height: 48,
            border: '1px solid #a1a59e',
            borderRadius: 3,
            background: '#b0b5ac',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#454743' }} />
        </div>
      </div>
    );
  }

  if (type === 'NEAR-DUPLICATE') {
    return (
      <div
        style={{
          width: '100%',
          height: 110,
          background: '#3a403d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 70,
            height: 48,
            border: '1px solid #5a635f',
            borderRadius: 3,
            background: '#4e5652',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#1c1f1d' }} />
        </div>
      </div>
    );
  }

  // Corrupted / default
  return (
    <div
      style={{
        width: '100%',
        height: 110,
        background: '#3d3e40',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        opacity: 0.8,
      }}
    >
      <div
        style={{
          width: 70,
          height: 48,
          border: '1px dashed #6b6e73',
          borderRadius: 3,
          background: '#494a4d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#2b2c2e' }} />
      </div>
    </div>
  );
}

export const ImageProfilingPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    () => localStorage.getItem('datalift_selected_dataset_id') || ''
  );
  const [selectedVersionHash, setSelectedVersionHash] = useState<string>('');
  const [profile, setProfile] = useState<ImageProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [notif, setNotif] = useState<{ msg: string; ok: boolean } | null>(null);

  const showNotif = useCallback((msg: string, ok = true) => setNotif({ msg, ok }), []);

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
          (matchStored && (matchStored.name.includes('defect') || matchStored.name.includes('image') || matchStored.name.includes('product')))
            ? matchStored
            : data.find((d) => d.name === 'product_defects/' || d.name.includes('defect')) ||
              data.find((d) => d.name.includes('image')) ||
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
      console.error('Erreur chargement datasets images:', err);
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
        loadProfile(datasetId);
      }
    } catch (err) {
      console.error('Erreur chargement versions:', err);
      loadProfile(datasetId);
    }
  };

  const loadProfile = async (datasetId: string, hash?: string) => {
    try {
      setLoading(true);
      const data = await api.getImageProfile(datasetId, hash);
      setProfile(data);
    } catch (err) {
      console.error('Erreur calcul profil image:', err);
      showNotif("Erreur lors de l'analyse du dataset d'images", false);
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (newId: string) => {
    setSelectedDatasetId(newId);
    localStorage.setItem('datalift_selected_dataset_id', newId);
    loadVersions(newId);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const newProfile = await api.uploadImageArchive(file);
      setProfile(newProfile);
      showNotif(`Dataset « ${file.name} » importé et analysé avec succès !`, true);
      const freshDs = await api.getDatasets();
      setDatasets(freshDs);
      setSelectedDatasetId(newProfile.dataset_id);
      localStorage.setItem('datalift_selected_dataset_id', newProfile.dataset_id);
    } catch (err) {
      console.error('Upload image failed:', err);
      showNotif("Échec de l'import du fichier d'images", false);
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
          CHARGEMENT DU PROFIL D'IMAGES…
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
          accept=".zip,.jpg,.jpeg,.png,.bmp,.webp"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>PROFILAGE D'IMAGES</div>
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
            <span>{uploading ? 'Importation…' : "Importer un dataset d'images (.zip)"}</span>
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
            Importer un dataset d'images
          </h3>
          <p style={{ color: C.muted, fontSize: 13, maxWidth: 440, margin: '0 auto 20px' }}>
            Glissez-déposez ou cliquez pour importer votre archive .zip (dossiers de classes ou images) pour lancer le profilage de qualité et détection.
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

      {/* Hidden file input for uploading image dataset (.zip or image) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.jpg,.jpeg,.png,.bmp,.webp"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {/* ── TOP ACTION BAR (Matching Mockup 1) ─────────────────────────── */}
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

        {/* Buttons right: Upload images + Download report + Continue to cleaning */}
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
            <span>{uploading ? 'Importation…' : "Importer un dataset d'images (.zip)"}</span>
          </button>

          <button
            onClick={() => showNotif("Rapport d'audit d'images téléchargé")}
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
            Download report
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
            <span>Continue to cleaning</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* ── BREADCRUMB + TITLE + 4 KPIS + HEALTH SCORE (Mockup 1) ──────── */}
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
              {profile.display_title}
            </h1>

            {/* 4 KPIs row */}
            <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  IMAGES
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.images}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  CLASSES
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.classes}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  FORMATS
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.formats}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.5, color: C.muted, marginBottom: 6 }}>
                  SIZE
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: C.text }}>
                  {profile.kpis.size}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Health Score 68 + 5 Segmented Bars (Mockup 1) */}
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
                HEALTH / 100
              </div>
            </div>

            {/* 5 Segmented Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 260 }}>
              {profile.health.bars.map((b) => (
                <div
                  key={b.label}
                  style={{ display: 'grid', gridTemplateColumns: '105px 1fr 34px', alignItems: 'center', gap: 10 }}
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

      {/* ── SECTION: WHAT NEEDS YOUR ATTENTION (Mockup 1) ───────────────── */}
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
            What needs your attention
          </h2>
          <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: C.muted }}>
            5 FINDINGS · BY IMPACT
          </span>
        </div>

        {/* 5 Findings Rows */}
        <div>
          {profile.findings.map((f) => (
            <div
              key={f.rank}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 140px',
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
                  onClick={() => showNotif(`Action: ${f.action_label}`)}
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

      {/* ── SECTION: CONTACT SHEET (Mockup 2) ─────────────────────────── */}
      <div style={{ marginBottom: 48 }}>
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
            Contact sheet
          </h2>
          <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: C.muted }}>
            FRAMES FLAGGED AUTOMATICALLY
          </span>
        </div>

        {/* 5 Thumbnails Reel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {profile.contact_sheet.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#121316',
                border: `1px solid ${item.id === 'corrupted' ? '#f87171' : item.id === 'duplicate' ? '#60a5fa' : C.borderLight}`,
                borderRadius: 4,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Visual frame preview */}
              <ContactSheetThumbnail item={item} />

              {/* Tag and Count Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: '#0e0f11',
                  borderTop: `1px solid ${C.border}`,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  letterSpacing: 0.5,
                }}
              >
                <span style={{ color: item.color, fontWeight: 600 }}>{item.type}</span>
                <span style={{ color: C.muted }}>× {item.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2-COLUMN SECTION: CLASSES & SIZES AND BOXES (Mockup 2) ─────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 36,
          alignItems: 'start',
        }}
      >
        {/* Column 1: Classes */}
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
              Classes
            </h3>
            <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted }}>
              IMAGES PER CLASS
            </span>
          </div>

          {/* Segmented frequency bars per class */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {profile.classes.bars.map((cls) => (
              <div
                key={cls.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 60px',
                  alignItems: 'center',
                  gap: 14,
                  fontSize: 12,
                }}
              >
                <span style={{ color: C.text, fontFamily: 'monospace' }}>{cls.name}</span>
                <ClassSegmentedBar pct={cls.pct} color={cls.color} />
                <span style={{ fontFamily: 'monospace', color: C.muted, textAlign: 'right' }}>
                  {cls.count_str}
                </span>
              </div>
            ))}
          </div>

          {/* Footnote */}
          {profile.classes.footnote && (
            <div style={{ fontSize: 11, color: C.red, marginTop: 14, fontFamily: 'sans-serif' }}>
              {profile.classes.footnote}
            </div>
          )}
        </div>

        {/* Column 2: Sizes and boxes */}
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
              Sizes and boxes
            </h3>
            <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1.5, color: C.muted }}>
              ANNOTATIONS
            </span>
          </div>

          {/* 2x2 KPIs Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            {/* Cell 1: Most common size */}
            <div style={{ padding: '16px 18px', borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginBottom: 8 }}>
                MOST COMMON SIZE
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: C.text }}>
                {profile.sizes_and_boxes.most_common_size}
              </div>
            </div>

            {/* Cell 2: Different sizes */}
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginBottom: 8 }}>
                DIFFERENT SIZES
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: C.text }}>
                {profile.sizes_and_boxes.different_sizes}
              </div>
            </div>

            {/* Cell 3: Boxes per image */}
            <div style={{ padding: '16px 18px', borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginBottom: 8 }}>
                BOXES PER IMAGE
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: C.text }}>
                {profile.sizes_and_boxes.boxes_per_image}
              </div>
            </div>

            {/* Cell 4: Unlabeled */}
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginBottom: 8 }}>
                UNLABELED
              </div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: C.red }}>
                {profile.sizes_and_boxes.unlabeled}
              </div>
            </div>
          </div>

          {/* Box size share breakdown */}
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginBottom: 10 }}>
              BOX SIZE · SHARE OF IMAGE AREA
            </div>

            {/* Horizontal stacked segments */}
            <div
              style={{
                display: 'flex',
                height: 28,
                borderRadius: 3,
                overflow: 'hidden',
                marginBottom: 10,
              }}
            >
              {profile.sizes_and_boxes.box_sizes.map((bs) => (
                <div
                  key={bs.label}
                  style={{
                    width: `${bs.pct}%`,
                    background: bs.color,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 8,
                    fontSize: 9,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: '#1a1b1e',
                  }}
                  title={`${bs.label} ${bs.pct}%`}
                >
                  {bs.label} {bs.pct}%
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

