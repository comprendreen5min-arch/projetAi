import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Dataset, DatasetVersion, VersionProfile, ColumnProfile } from '../types';
import { RefreshCw, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export const ProfilingPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [selectedVersionHash, setSelectedVersionHash] = useState<string>('');
  const [profile, setProfile] = useState<VersionProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'FLAGGED' | 'NUMERIC' | 'CATEGORY'>('ALL');

  // Load datasets on mount
  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await api.getDatasets();
      setDatasets(data);

      if (data.length > 0) {
        const firstDs = data[0];
        setSelectedDatasetId(firstDs.id);
        loadVersions(firstDs.id);
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
      setVersions(vers);

      if (vers.length > 0) {
        const latestHash = vers[0].version_hash;
        setSelectedVersionHash(latestHash);
        loadProfile(latestHash);
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

  const loadProfile = async (hash: string) => {
    try {
      setProfileLoading(true);
      const profileData = await api.getVersionProfile(hash);
      setProfile(profileData);
    } catch (err) {
      console.error('Erreur calcul profil:', err);
    } finally {
      setProfileLoading(false);
      setLoading(false);
    }
  };

  const handleDatasetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDatasetId(newId);
    loadVersions(newId);
  };

  const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newHash = e.target.value;
    setSelectedVersionHash(newHash);
    loadProfile(newHash);
  };

  // Filter columns based on active tab
  const getFilteredColumns = (): ColumnProfile[] => {
    if (!profile) return [];
    switch (activeFilter) {
      case 'FLAGGED':
        return profile.columns.filter((c) => c.is_flagged);
      case 'NUMERIC':
        return profile.columns.filter((c) => c.detected_type === 'nombre');
      case 'CATEGORY':
        return profile.columns.filter((c) => ['catégorie', 'cible', 'date'].includes(c.detected_type));
      case 'ALL':
      default:
        return profile.columns;
    }
  };

  const filteredColumns = getFilteredColumns();

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Helper to split filename into base and italic extension
  const renderFileName = (name?: string) => {
    if (!name) return <span>dataset</span>;
    if (name.includes('.')) {
      const parts = name.split('.');
      const ext = parts.pop();
      const base = parts.join('.');
      return (
        <>
          <span>{base}</span>
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>.{ext}</span>
        </>
      );
    }
    return (
      <>
        <span>{name}</span>
        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>.parquet</span>
      </>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-muted)' }}>
        <RefreshCw className="animate-spin" size={26} style={{ margin: '0 auto 1rem auto', color: 'var(--amber)' }} />
        <p className="font-mono" style={{ fontSize: '0.85rem' }}>Analyse et calcul du profil de données...</p>
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div style={{ padding: '3rem', maxWidth: '800px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
          <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--amber)', letterSpacing: '0.08em' }}>
            ÉTAPE 01 • PROFILAGE
          </span>
        </div>
        <h1 className="font-serif" style={{ fontSize: '2.4rem', fontWeight: 500, marginBottom: '0.8rem' }}>
          Profilage des Données
        </h1>
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', marginTop: '1.5rem' }}>
          <Database size={36} color="var(--border)" style={{ margin: '0 auto 1rem auto' }} />
          <h3 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500, marginBottom: '0.5rem' }}>
            Aucun jeu de données enregistré
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: '480px', margin: '0 auto 1.5rem auto' }}>
            Importez d'abord un fichier CSV dans l'étape <strong>Versioning</strong> pour que Datalift génère son profil statistique et d'intégrité.
          </p>
          <Link to="/versioning" className="btn btn-primary">
            Aller à l'étape Versioning
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem 3rem 4rem 3rem', maxWidth: '1400px', width: '100%' }}>
      {/* Top Selectors Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dataset :</span>
            <select
              value={selectedDatasetId}
              onChange={handleDatasetChange}
              style={{ minWidth: '180px', padding: '0.4rem 0.75rem', fontSize: '0.8rem', background: '#121214' }}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.version_count} v)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Version :</span>
            <select
              value={selectedVersionHash}
              onChange={handleVersionChange}
              disabled={versions.length === 0}
              style={{ minWidth: '220px', padding: '0.4rem 0.75rem', fontSize: '0.8rem', background: '#121214' }}
            >
              {versions.map((v, i) => (
                <option key={v.id} value={v.version_hash}>
                  #{v.version_hash.slice(0, 8)} {i === 0 ? '(Dernière)' : ''} — {v.row_count.toLocaleString()} lignes
                </option>
              ))}
            </select>
          </div>
        </div>

        {profileLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: 'var(--amber)' }}>
            <RefreshCw className="animate-spin" size={13} />
            <span className="font-mono">Calcul du profil en cours...</span>
          </div>
        )}
      </div>

      {profile && (
        <>
          {/* Header Metadata matching mock */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              DATASET • #{profile.version_hash.slice(0, 8)} RAW • STOCKAGE PARQUET
            </div>

            {/* Large File Title in Serif with italic extension */}
            <h1 className="font-serif" style={{ fontSize: '3rem', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '1.8rem', color: 'var(--text-main)' }}>
              {renderFileName(profile.dataset_name)}
            </h1>

            {/* 4 Summary KPIs matching mock */}
            <div style={{ display: 'flex', gap: '3.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '2rem' }}>
              <div>
                <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  ROWS
                </div>
                <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-main)' }}>
                  {profile.summary.total_rows.toLocaleString('fr-FR')}
                </div>
              </div>

              <div>
                <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  COLUMNS
                </div>
                <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-main)' }}>
                  {profile.summary.total_columns}
                </div>
              </div>

              <div>
                <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  SIZE
                </div>
                <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-main)' }}>
                  {formatFileSize(profile.summary.file_size_bytes)}
                </div>
              </div>

              <div>
                <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  TARGET
                </div>
                <div className="font-serif" style={{ fontSize: '1.5rem', fontWeight: 500, color: profile.summary.target_column ? 'var(--text-main)' : 'var(--text-faint)', fontStyle: profile.summary.target_column ? 'normal' : 'italic' }}>
                  {profile.summary.target_column || 'Non définie'}
                </div>
              </div>
            </div>
          </div>

          {/* Columns Section */}
          <div style={{ marginTop: '2rem' }}>
            {/* Columns Section Header with Filter Tabs */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
              <h2 className="font-serif" style={{ fontSize: '1.65rem', fontWeight: 500, color: 'var(--text-main)' }}>
                Columns
              </h2>

              {/* Filter Tabs matching mock */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <button
                  type="button"
                  className={`filter-tab font-mono ${activeFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('ALL')}
                >
                  <span>ALL</span>
                  <span className="tab-count">{profile.columns.length}</span>
                </button>

                <button
                  type="button"
                  className={`filter-tab font-mono ${activeFilter === 'FLAGGED' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('FLAGGED')}
                >
                  <span>FLAGGED</span>
                  <span className="tab-count">{profile.summary.flagged_columns_count}</span>
                </button>

                <button
                  type="button"
                  className={`filter-tab font-mono ${activeFilter === 'NUMERIC' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('NUMERIC')}
                >
                  <span>NUMERIC</span>
                  <span className="tab-count">{profile.summary.numeric_columns_count}</span>
                </button>

                <button
                  type="button"
                  className={`filter-tab font-mono ${activeFilter === 'CATEGORY' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('CATEGORY')}
                >
                  <span>CATEGORY</span>
                  <span className="tab-count">{profile.summary.category_columns_count}</span>
                </button>
              </div>
            </div>

            {/* Column Cards Grid */}
            <div className="columns-grid">
              {filteredColumns.map((col) => (
                <div key={col.name} className={`column-card ${col.is_flagged ? 'flagged' : ''}`}>
                  {/* Diagonal Orange Corner on flagged columns */}
                  {col.is_flagged && (
                    <div
                      className="column-card-corner"
                      title={col.flag_reasons.join(' • ')}
                    />
                  )}

                  {/* Card Header: column name & detected type */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span className="font-mono" style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col.name}>
                        {col.name}
                      </span>
                      <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {col.detected_type}
                      </span>
                    </div>

                    {/* Mini Histogram Bars */}
                    <div className="mini-histogram">
                      {col.histogram && col.histogram.length > 0 ? (
                        col.histogram.map((bar, bIdx) => (
                          <div
                            key={bIdx}
                            className="mini-bar"
                            style={{ height: `${Math.max(bar.height_percentage, 6)}%` }}
                            title={bar.label ? `${bar.label}: ${bar.count}` : `[${bar.bin_start} - ${bar.bin_end}]: ${bar.count}`}
                          />
                        ))
                      ) : (
                        <div style={{ width: '100%', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-faint)' }}>
                          Pas de distribution
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: missing % and unique % */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
                      <span className="font-mono">
                        missing {col.null_percentage}%
                      </span>
                      <span className="font-mono">
                        unique {col.unique_percentage < 100 ? `${col.unique_percentage}%` : col.unique_count.toLocaleString('fr-FR')}
                      </span>
                    </div>

                    {/* Problem Warning line or clean spacer */}
                    {col.is_flagged ? (
                      <div className="font-mono" style={{ fontSize: '0.7rem', color: '#fb7185', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col.flag_reasons.join(', ')}>
                        {col.flag_reasons[0]}
                      </div>
                    ) : (
                      <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-faint)' }}>
                        {col.stats ? `moy: ${col.stats.mean}` : 'Intégrité vérifiée'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredColumns.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <p className="font-mono" style={{ fontSize: '0.85rem' }}>Aucune colonne ne correspond au filtre sélectionné.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
