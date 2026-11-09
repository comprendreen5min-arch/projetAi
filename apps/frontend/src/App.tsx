import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { DatasetList } from './components/DatasetList';
import { VersionHistory } from './components/VersionHistory';
import { UploadModal } from './components/UploadModal';
import { DataPreviewModal } from './components/DataPreviewModal';
import { TransformationModal } from './components/TransformationModal';
import { api } from './services/api';
import { Dataset, DatasetVersion } from './types';
import { Upload, Database, Layers, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
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
        const target = selectId ? data.find((d) => d.id === selectId) || data[0] : (selectedDataset ? data.find((d) => d.id === selectedDataset.id) || data[0] : data[0]);
        setSelectedDataset(target);
        if (target) {
          fetchVersions(target.id);
        }
      } else {
        setSelectedDataset(null);
        setVersions([]);
      }
    } catch (err) {
      console.error('Failed to fetch datasets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async (datasetId: string) => {
    try {
      const vers = await api.getVersions(datasetId);
      setVersions(vers);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
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
      console.error('Delete failed:', err);
    }
  };

  const handleOpenUpload = (datasetId?: string) => {
    setUploadTargetId(datasetId || null);
    setIsUploadOpen(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main className="container" style={{ flex: 1 }}>
        {loading && datasets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 1rem auto' }} />
            <p>Connexion à l'API Datalift...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '2rem', alignItems: 'start' }}>
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
                        <Database size={22} color="#3b82f6" />
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{selectedDataset.name}</h2>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                        {selectedDataset.description || 'Aucune description fournie.'}
                      </p>
                      <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <span>ID: <code className="font-mono">{selectedDataset.id.slice(0, 8)}...</code></span>
                        <span>Créé le: {new Date(selectedDataset.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => handleOpenUpload(selectedDataset.id)}
                    >
                      <Upload size={16} />
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
                  <Layers size={40} color="var(--border)" style={{ margin: '0 auto 1rem auto' }} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Sélectionnez un dataset
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Choisissez un dataset dans la barre latérale pour visualiser son historique de versions et son lignage de données.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

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

export default App;

