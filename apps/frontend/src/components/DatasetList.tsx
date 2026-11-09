import React from 'react';
import { Database, Plus, Trash2, ChevronRight, Layers } from 'lucide-react';
import { Dataset } from '../types';

interface DatasetListProps {
  datasets: Dataset[];
  selectedDataset: Dataset | null;
  onSelectDataset: (dataset: Dataset) => void;
  onOpenUpload: (datasetId?: string) => void;
  onDeleteDataset: (id: string) => void;
}

export const DatasetList: React.FC<DatasetListProps> = ({
  datasets,
  selectedDataset,
  onSelectDataset,
  onOpenUpload,
  onDeleteDataset,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Database size={16} color="var(--amber)" />
          <h2 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
            Datasets IA ({datasets.length})
          </h2>
        </div>
        <button
          className="btn btn-primary"
          style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}
          onClick={() => onOpenUpload()}
        >
          <Plus size={14} />
          Nouveau Dataset
        </button>
      </div>

      {datasets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <Database size={32} color="var(--border)" style={{ margin: '0 auto 0.75rem auto' }} />
          <h3 className="font-serif" style={{ fontSize: '1.05rem', fontWeight: 500, marginBottom: '0.25rem' }}>
            Aucun dataset enregistré
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Importez un fichier CSV pour créer un dataset et générer son premier Parquet.
          </p>
          <button className="btn btn-primary" onClick={() => onOpenUpload()}>
            <Plus size={14} /> Importer un CSV
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {datasets.map((ds) => {
            const isSelected = selectedDataset?.id === ds.id;
            return (
              <div
                key={ds.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--amber)' : 'var(--border)',
                  backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.04)' : 'var(--bg-surface)',
                  padding: '1rem 1.15rem',
                }}
                onClick={() => onSelectDataset(ds)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ds.name}</span>
                      <span className="badge badge-amber font-mono">
                        <Layers size={11} />
                        {ds.version_count} {ds.version_count > 1 ? 'versions' : 'version'}
                      </span>
                    </div>

                    {ds.description && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ds.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>
                        {new Date(ds.updated_at).toLocaleDateString('fr-FR')}
                      </span>
                      {ds.latest_version && (
                        <span className="font-mono" style={{ color: 'var(--amber)' }}>
                          #{ds.latest_version.version_hash.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.75rem' }}>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '0.35rem 0.5rem', borderRadius: 4 }}
                      title="Supprimer le dataset"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Supprimer définitivement le dataset "${ds.name}" et toutes ses versions Parquet ?`)) {
                          onDeleteDataset(ds.id);
                        }
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                    <ChevronRight size={16} color={isSelected ? 'var(--amber)' : 'var(--text-muted)'} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
