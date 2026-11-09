import React, { useEffect, useState } from 'react';
import { X, Download, Database, FileSpreadsheet, Layers } from 'lucide-react';
import { api } from '../services/api';
import { DatasetVersion } from '../types';

interface DataPreviewModalProps {
  versionHash: string | null;
  onClose: () => void;
}

export const DataPreviewModal: React.FC<DataPreviewModalProps> = ({ versionHash, onClose }) => {
  const [version, setVersion] = useState<DatasetVersion | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!versionHash) return;
    setLoading(true);
    setError(null);
    api.getVersionDetail(versionHash)
      .then((data) => {
        setVersion(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Impossible de charger les données du fichier Parquet.");
        setLoading(false);
      });
  }, [versionHash]);

  if (!versionHash) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '900px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Database size={20} color="#10b981" />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Inspection du Fichier Parquet</h3>
              <p className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Hash: {versionHash}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <a
              href={api.getDownloadUrl(versionHash)}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
              download
            >
              <Download size={14} />
              Télécharger .parquet
            </a>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {loading && <p style={{ color: 'var(--text-muted)' }}>Chargement des métadonnées du fichier Parquet...</p>}
          {error && <p style={{ color: '#fca5a5' }}>{error}</p>}

          {version && (
            <div>
              {/* Stats badges */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: 1, minWidth: '150px', padding: '0.85rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lignes</span>
                  <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{version.row_count.toLocaleString()}</p>
                </div>
                <div className="card" style={{ flex: 1, minWidth: '150px', padding: '0.85rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Colonnes</span>
                  <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{version.schema_metadata?.num_columns ?? 0}</p>
                </div>
                <div className="card" style={{ flex: 1, minWidth: '150px', padding: '0.85rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Poids Parquet</span>
                  <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{(version.size_bytes / 1024).toFixed(1)} KB</p>
                </div>
              </div>

              {/* Schema Columns Table */}
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={16} color="#6366f1" />
                Schéma détecté (PyArrow)
              </h4>
              <div className="table-container" style={{ marginBottom: '1.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Colonne</th>
                      <th>Type de données</th>
                      <th>Null count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {version.schema_metadata?.columns.map((col, idx) => (
                      <tr key={idx}>
                        <td className="font-mono" style={{ fontWeight: 600 }}>{col.name}</td>
                        <td><span className="badge badge-blue">{col.type}</span></td>
                        <td>{col.null_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sample Rows */}
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileSpreadsheet size={16} color="#10b981" />
                Aperçu des premières lignes
              </h4>
              {version.sample_rows && version.sample_rows.length > 0 ? (
                <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(version.sample_rows[0]).map((colName) => (
                          <th key={colName}>{colName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {version.sample_rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {Object.values(row).map((val: any, cIdx) => (
                            <td key={cIdx} className="font-mono" style={{ fontSize: '0.8rem' }}>
                              {val === null ? <em style={{ color: 'var(--text-muted)' }}>null</em> : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Aucune ligne échantillon disponible.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

