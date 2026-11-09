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
        <p style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
          Aucune version enregistrée pour ce dataset.
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>
          Uploadez un fichier CSV pour initialiser la première version immuable.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="font-serif" style={{ fontSize: '1.25rem', fontWeight: 500 }}>
          Historique des Versions & Lineage ({versions.length})
        </h3>
        <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Ordre antichronologique • Versions immuables
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {versions.map((ver, idx) => {
          const isLatest = idx === 0;
          const isRoot = !ver.parent_version_id;

          return (
            <div
              key={ver.id}
              className="card"
              style={{
                position: 'relative',
                borderLeft: isLatest ? '2px solid var(--amber)' : '1px solid var(--border)',
                padding: '1.15rem 1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: isLatest ? 'var(--amber-bg)' : '#18181b',
                      border: `1px solid ${isLatest ? 'var(--amber-border)' : 'var(--border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isLatest ? 'var(--amber)' : 'var(--text-muted)',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <GitCommit size={15} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      <span className="font-mono" style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        {ver.version_hash.slice(0, 10)}...{ver.version_hash.slice(-6)}
                      </span>
                      {isLatest && <span className="badge badge-amber font-mono">Dernier snapshot</span>}
                      {isRoot ? (
                        <span className="badge badge-neutral font-mono">Initiale (CSV)</span>
                      ) : (
                        <span className="badge badge-neutral font-mono">Dérivée</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={12} />
                        {new Date(ver.created_at).toLocaleString('fr-FR')}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <HardDrive size={12} />
                        {(ver.size_bytes / 1024).toFixed(1)} KB
                      </span>
                      <span>
                        <strong style={{ color: 'var(--text-main)' }}>{ver.row_count.toLocaleString()}</strong> lignes
                      </span>
                      {ver.transformation_produced && (
                        <span>
                          Opération: <strong className="font-mono" style={{ color: 'var(--amber)' }}>{ver.transformation_produced.name}</strong>
                        </span>
                      )}
                    </div>

                    {ver.transformation_produced?.parameters && Object.keys(ver.transformation_produced.parameters).length > 0 && (
                      <div
                        className="font-mono"
                        style={{
                          marginTop: '0.55rem',
                          background: '#0d0d0f',
                          border: '1px solid var(--border)',
                          padding: '0.35rem 0.55rem',
                          borderRadius: 4,
                          fontSize: '0.72rem',
                          color: 'var(--text-secondary)',
                          maxWidth: '600px',
                          overflowX: 'auto',
                        }}
                      >
                        Paramètres : {JSON.stringify(ver.transformation_produced.parameters)}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '0.35rem 0.65rem' }}
                    onClick={() => onInspect(ver.version_hash)}
                    title="Inspecter le schéma et les lignes"
                  >
                    <Eye size={13} />
                    Inspecter
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '0.35rem 0.65rem' }}
                    onClick={() => onTransform(ver)}
                    title="Créer une nouvelle version dérivée"
                  >
                    <Play size={13} />
                    Transformer
                  </button>

                  <a
                    href={api.getDownloadUrl(ver.version_hash)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '0.35rem 0.55rem' }}
                    download
                    title="Télécharger Parquet"
                  >
                    <Download size={13} />
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
