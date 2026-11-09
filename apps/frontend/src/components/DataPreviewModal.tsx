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
      <div className="modal-content" style={{ maxWidth: '920px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Database size={18} color="var(--amber)" />
            <div>
              <h3 className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                Inspection du Fichier Parquet
              </h3>
              <p className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Hash: {versionHash}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <a
              href={api.getDownloadUrl(versionHash)}
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
              download
            >
              <Download size={13} />
              Télécharger .parquet
            </a>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {loading && <p className="font-mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Chargement des métadonnées du fichier Parquet...</p>}
          {error && <p style={{ color: '#fca5a5', fontSize: '0.85rem' }}>{error}</p>}

          {version && (
            <div>
              {/* Stats badges */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div className="card" style={{ flex: 1, minWidth: '140px', padding: '0.85rem 1rem' }}>
                  <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lignes</span>
                  <p className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 2 }}>{version.row_count.toLocaleString()}</p>
                </div>
                <div className="card" style={{ flex: 1, minWidth: '140px', padding: '0.85rem 1rem' }}>
                  <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Colonnes</span>
                  <p className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 2 }}>{version.schema_metadata?.num_columns ?? 0}</p>
                </div>
                <div className="card" style={{ flex: 1, minWidth: '140px', padding: '0.85rem 1rem' }}>
                  <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Poids Parquet</span>
                  <p className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 2 }}>{(version.size_bytes / 1024).toFixed(1)} KB</p>
                </div>
              </div>

              {/* Schema Columns Table */}
              <h4 className="font-serif" style={{ fontSize: '1.05rem', fontWeight: 500, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={15} color="var(--amber)" />
                Schéma détecté (PyArrow)
              </h4>
              <div className="table-container" style={{ marginBottom: '1.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th className="font-mono">COLONNE</th>
                      <th className="font-mono">TYPE</th>
                      <th className="font-mono">VALEURS NULLES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {version.schema_metadata?.columns.map((col, idx) => (
                      <tr key={idx}>
                        <td className="font-mono" style={{ fontWeight: 500 }}>{col.name}</td>
                        <td><span className="badge badge-amber font-mono">{col.type}</span></td>
                        <td className="font-mono">{col.null_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sample Rows */}
              <h4 className="font-serif" style={{ fontSize: '1.05rem', fontWeight: 500, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileSpreadsheet size={15} color="var(--amber)" />
                Aperçu des premières lignes
              </h4>
              {version.sample_rows && version.sample_rows.length > 0 ? (
                <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(version.sample_rows[0]).map((colName) => (
                          <th key={colName} className="font-mono">{colName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {version.sample_rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {Object.values(row).map((val: any, cIdx) => (
                            <td key={cIdx} className="font-mono" style={{ fontSize: '0.78rem' }}>
                              {val === null ? <em style={{ color: 'var(--text-faint)' }}>null</em> : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucune ligne échantillon disponible.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
