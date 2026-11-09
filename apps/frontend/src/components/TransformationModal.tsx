import React, { useState } from 'react';
import { GitFork, X, Play, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { DatasetVersion } from '../types';

interface TransformationModalProps {
  version: DatasetVersion | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const TransformationModal: React.FC<TransformationModalProps> = ({
  version,
  onClose,
  onSuccess,
}) => {
  const [transformType, setTransformType] = useState<string>('FILTER_QUERY');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedColumns, setSelectedColumns] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!version) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let parameters: Record<string, any> = {};

    if (transformType === 'FILTER_QUERY') {
      if (!filterQuery.trim()) {
        setError('Veuillez saisir une condition de filtre (ex: feature_a > 10).');
        setLoading(false);
        return;
      }
      parameters = { query: filterQuery.trim() };
    } else if (transformType === 'SELECT_COLUMNS') {
      const cols = selectedColumns.split(',').map((c) => c.trim()).filter(Boolean);
      if (cols.length === 0) {
        setError('Veuillez indiquer au moins une colonne à conserver.');
        setLoading(false);
        return;
      }
      parameters = { columns: cols };
    } else if (transformType === 'DROP_NULLS') {
      parameters = { drop_all_nulls: true };
    }

    try {
      await api.applyTransformation(version.id, transformType, parameters);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de l'application de la transformation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <GitFork size={20} color="#8b5cf6" />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Appliquer une Transformation</h3>
              <p className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Depuis version parente: {version.version_hash.slice(0, 12)}...
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 8, color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label>Type d'opération</label>
            <select value={transformType} onChange={(e) => setTransformType(e.target.value)}>
              <option value="FILTER_QUERY">Filtrer par expression (Pandas / Query)</option>
              <option value="SELECT_COLUMNS">Sélectionner des colonnes spécifiques</option>
              <option value="DROP_NULLS">Supprimer les lignes contenant des valeurs nulles</option>
            </select>
          </div>

          {transformType === 'FILTER_QUERY' && (
            <div className="form-group">
              <label>Expression de filtrage</label>
              <input
                type="text"
                placeholder="ex: label == 1 ou feature_a > 10.5"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Syntaxe Pandas / NumExpr standard.
              </span>
            </div>
          )}

          {transformType === 'SELECT_COLUMNS' && (
            <div className="form-group">
              <label>Colonnes à conserver (séparées par une virgule)</label>
              <input
                type="text"
                placeholder="col1, col2, label"
                value={selectedColumns}
                onChange={(e) => setSelectedColumns(e.target.value)}
              />
              {version.schema_metadata?.columns && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {version.schema_metadata.columns.map((c) => (
                    <button
                      type="button"
                      key={c.name}
                      className="badge badge-blue"
                      style={{ cursor: 'pointer', border: 'none' }}
                      onClick={() => {
                        const current = selectedColumns ? selectedColumns.split(',').map(s => s.trim()) : [];
                        if (!current.includes(c.name)) {
                          setSelectedColumns(current.concat(c.name).join(', '));
                        }
                      }}
                    >
                      + {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {transformType === 'DROP_NULLS' && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Toutes les lignes contenant au moins un champ vide / NaN seront filtrées.
            </p>
          )}

          <div style={{ backgroundColor: '#090e18', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border)', marginBottom: '1.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            ℹ️ Cette opération générera un <strong>nouveau snapshot Parquet immuable</strong>. Un hash SHA-256 unique lui sera attribué. La version originale restera inchangée.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Play size={14} />
              {loading ? 'Calcul en cours...' : 'Exécuter & Créer la Version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

