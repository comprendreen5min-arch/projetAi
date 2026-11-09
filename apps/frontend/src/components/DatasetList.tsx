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
          <Database size={18} color="#3b82f6" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Datasets IA ({datasets.length})</h2>
        </div>
        <button
          className="btn btn-primary"
          style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem' }}
          onClick={() => onOpenUpload()}
        >
          <Plus size={16} />
          Nouveau Dataset
        </button>
      </div>

      {datasets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <Database size={36} color="var(--border)" style={{ margin: '0 auto 0.75rem auto' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Aucun dataset enregistré</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Commencez par importer un fichier CSV pour créer un dataset et générer son premier Parquet.
          </p>
          <button className="btn btn-primary" onClick={() => onOpenUpload()}>
            <Plus size={16} /> Importer un CSV
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {datasets.map((ds) => {
            const isSelected = selectedDataset?.id === ds.id;
            return (
              <div
                key={ds.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--border-highlight)' : 'var(--border)',
                  backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-surface)',
                  padding: '1rem 1.25rem',
                }}
                onClick={() => onSelectDataset(ds)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ds.name}</span>
                      <span className="badge badge-blue">
                        <Layers size={11} />
                        {ds.version_count} {ds.version_count > 1 ? 'versions' : 'version'}
                      </span>
                    </div>

                    {ds.description && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ds.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>
                        Mis à jour: {new Date(ds.updated_at).toLocaleDateString('fr-FR')}
                      </span>
                      {ds.latest_version && (
                        <span className="font-mono">
                          Dernier hash: {ds.latest_version.version_hash.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.75rem' }}>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '0.35rem 0.5rem', borderRadius: 6 }}
                      title="Supprimer le dataset"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Supprimer définitivement le dataset "${ds.name}" et toutes ses versions Parquet ?`)) {
                          onDeleteDataset(ds.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={18} color={isSelected ? 'var(--accent-blue)' : 'var(--text-muted)'} />
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

