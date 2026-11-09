import React from 'react';
import { GitCommit, Eye, Play, Download, Clock, HardDrive } from 'lucide-react';
import { DatasetVersion } from '../types';
import { api } from '../services/api';

interface VersionHistoryProps {
  versions: DatasetVersion[];
  onInspect: (versionHash: string) => void;
  onTransform: (version: DatasetVersion) => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  versions,
  onInspect,
  onTransform,
}) => {
  if (versions.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          Aucune version enregistrée pour ce dataset.
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Uploadez un fichier CSV pour initialiser la première version immuable.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
          Historique des Versions & Lineage ({versions.length})
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Ordre antichronologique • Versions immuables
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {versions.map((ver, idx) => {
          const isLatest = idx === 0;
          const isRoot = !ver.parent_version_id;

          return (
            <div
              key={ver.id}
              className="card"
              style={{
                position: 'relative',
                borderLeft: isLatest ? '3px solid #6366f1' : '1px solid var(--border)',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: isLatest ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isLatest ? '#818cf8' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    <GitCommit size={18} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      <span className="font-mono" style={{ fontWeight: 600, fontSize: '0.9rem', color: '#60a5fa' }}>
                        {ver.version_hash.slice(0, 10)}...{ver.version_hash.slice(-6)}
                      </span>
                      {isLatest && <span className="badge badge-purple">Latest snapshot</span>}
                      {isRoot ? (
                        <span className="badge badge-blue">Root (CSV Upload)</span>
                      ) : (
                        <span className="badge badge-green">Dérivée</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={13} />
                        {new Date(ver.created_at).toLocaleString('fr-FR')}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <HardDrive size={13} />
                        {(ver.size_bytes / 1024).toFixed(1)} KB
                      </span>
                      <span>
                        <strong>{ver.row_count.toLocaleString()}</strong> lignes
                      </span>
                      {ver.transformation_produced && (
                        <span>
                          Opération: <strong style={{ color: '#c4b5fd' }}>{ver.transformation_produced.name}</strong>
                        </span>
                      )}
                    </div>

                    {ver.transformation_produced?.parameters && Object.keys(ver.transformation_produced.parameters).length > 0 && (
                      <div
                        className="font-mono"
                        style={{
                          marginTop: '0.6rem',
                          background: '#090e19',
                          padding: '0.4rem 0.6rem',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          color: '#94a3b8',
                          maxWidth: '600px',
                          overflowX: 'auto',
                        }}
                      >
                        Paramètres: {JSON.stringify(ver.transformation_produced.parameters)}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                    onClick={() => onInspect(ver.version_hash)}
                    title="Inspecter le schéma et les lignes"
                  >
                    <Eye size={14} />
                    Inspecter
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                    onClick={() => onTransform(ver)}
                    title="Créer une nouvelle version dérivée"
                  >
                    <Play size={14} />
                    Transformer
                  </button>

                  <a
                    href={api.getDownloadUrl(ver.version_hash)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                    download
                    title="Télécharger Parquet"
                  >
                    <Download size={14} />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

