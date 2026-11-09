import React, { useEffect, useState } from 'react';
import { DatasetList } from '../components/DatasetList';
import { VersionHistory } from '../components/VersionHistory';
import { UploadModal } from '../components/UploadModal';
import { DataPreviewModal } from '../components/DataPreviewModal';
import { TransformationModal } from '../components/TransformationModal';
import { api } from '../services/api';
import { Dataset, DatasetVersion } from '../types';
import { Upload, Database, Layers, RefreshCw } from 'lucide-react';

export const VersioningPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [inspectVersionHash, setInspectVersionHash] = useState<string | null>(null);
  const [transformVersion, setTransformVersion] = useState<DatasetVersion | null>(null);

  const fetchDatasets = async (selectId?: string) => {
    try {
      setLoading(true);
      const data = await api.getDatasets();
      setDatasets(data);

      if (data.length > 0) {
        const target = selectId
          ? data.find((d) => d.id === selectId) || data[0]
          : selectedDataset
          ? data.find((d) => d.id === selectedDataset.id) || data[0]
          : data[0];
        setSelectedDataset(target);
        if (target) {
          fetchVersions(target.id);
        }
      } else {
        setSelectedDataset(null);
        setVersions([]);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des datasets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async (datasetId: string) => {
    try {
      const vers = await api.getVersions(datasetId);
      setVersions(vers);
    } catch (err) {
      console.error('Erreur lors du chargement des versions:', err);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const handleSelectDataset = (dataset: Dataset) => {
    setSelectedDataset(dataset);
    fetchVersions(dataset.id);
  };

  const handleDeleteDataset = async (id: string) => {
    try {
      await api.deleteDataset(id);
      fetchDatasets();
    } catch (err) {
      console.error('Erreur de suppression:', err);
    }
  };

  const handleOpenUpload = (datasetId?: string) => {
    setUploadTargetId(datasetId || null);
    setIsUploadOpen(true);
  };

  return (
    <div style={{ padding: '2.5rem 3rem', maxWidth: '1360px', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
          <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--amber)', letterSpacing: '0.08em' }}>
            ÉTAPE 04 • WORKFLOW
          </span>
          <span className="badge badge-amber font-mono">Actif</span>
        </div>
        <h1 className="font-serif" style={{ fontSize: '2.4rem', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '0.6rem' }}>
          Versioning des Données
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '700px' }}>
          Registre d'instantanés Parquet immuables et traçabilité cryptographique par hash SHA-256.
        </p>
      </div>

      {loading && datasets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <RefreshCw className="animate-spin" size={26} style={{ margin: '0 auto 1rem auto', color: 'var(--amber)' }} />
          <p className="font-mono" style={{ fontSize: '0.85rem' }}>Connexion à l'API Datalift...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: '2rem', alignItems: 'start' }}>
          {/* Left Column: Datasets Catalog */}
          <aside>
            <DatasetList
              datasets={datasets}
              selectedDataset={selectedDataset}
              onSelectDataset={handleSelectDataset}
              onOpenUpload={handleOpenUpload}
              onDeleteDataset={handleDeleteDataset}
            />
          </aside>

          {/* Right Column: Selected Dataset details & Version DAG */}
          <section>
            {selectedDataset ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Dataset header card */}
                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                      <Database size={20} color="var(--amber)" />
                      <h2 className="font-serif" style={{ fontSize: '1.55rem', fontWeight: 500 }}>
                        {selectedDataset.name}
                      </h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      {selectedDataset.description || 'Aucune description fournie.'}
                    </p>
                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>
                        ID: <code className="font-mono">{selectedDataset.id.slice(0, 8)}...</code>
                      </span>
                      <span>
                        Créé le : {new Date(selectedDataset.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => handleOpenUpload(selectedDataset.id)}
                  >
                    <Upload size={15} />
                    Uploader nouvelle version CSV
                  </button>
                </div>

                {/* Version lineage view */}
                <VersionHistory
                  versions={versions}
                  onInspect={(hash) => setInspectVersionHash(hash)}
                  onTransform={(ver) => setTransformVersion(ver)}
                />
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <Layers size={36} color="var(--border)" style={{ margin: '0 auto 1rem auto' }} />
                <h3 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500, marginBottom: '0.4rem' }}>
                  Sélectionnez un dataset
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Choisissez un jeu de données dans la colonne latérale pour explorer son historique de versions immuables.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        datasets={datasets}
        selectedDatasetId={uploadTargetId || selectedDataset?.id}
        onSuccess={(newId) => fetchDatasets(newId || uploadTargetId || selectedDataset?.id)}
      />

      {/* Parquet Inspection Modal */}
      <DataPreviewModal
        versionHash={inspectVersionHash}
        onClose={() => setInspectVersionHash(null)}
      />

      {/* Transformation Modal */}
      <TransformationModal
        version={transformVersion}
        onClose={() => setTransformVersion(null)}
        onSuccess={() => selectedDataset && fetchVersions(selectedDataset.id)}
      />
    </div>
  );
};

