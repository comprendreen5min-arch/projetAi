import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { VersioningPage } from './pages/VersioningPage';
import { ProfilingPage } from './pages/ProfilingPage';
import { CleaningPage } from './pages/CleaningPage';
import { AugmentationPage } from './pages/AugmentationPage';
import { LabelingPage } from './pages/LabelingPage';
import { TrainingPage } from './pages/TrainingPage';
import { ActiveLearningPage } from './pages/ActiveLearningPage';
import { DriftPage } from './pages/DriftPage';
import { ExportApiPage } from './pages/ExportApiPage';
import { TextProfilingPage } from './pages/TextProfilingPage';
import { TextCleaningPage } from './pages/TextCleaningPage';
import { TextAugmentationPage } from './pages/TextAugmentationPage';
import { ImageProfilingPage } from './pages/ImageProfilingPage';
import { ImageCleaningPage } from './pages/ImageCleaningPage';
import { ArrowRight, Download } from 'lucide-react';
import { api } from './services/api';

// Top bar matching the target mockup
const TopBar: React.FC<{ modality: 'tabular' | 'text' | 'image'; onModalityChange: (m: 'tabular' | 'text' | 'image') => void }> = ({
  modality,
  onModalityChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNextStep = () => {
    if (location.pathname === '/profiling') navigate('/cleaning');
    else if (location.pathname === '/cleaning') navigate('/augmentation');
    else if (location.pathname === '/augmentation') navigate('/versioning');
    else if (location.pathname === '/versioning') navigate('/labeling');
    else navigate('/versioning');
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 3rem',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-main)',
      }}
    >
      {/* Modality Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', fontSize: '0.82rem' }}>
        <button
          type="button"
          onClick={() => onModalityChange('tabular')}
          style={{
            background: 'none',
            border: 'none',
            color: modality === 'tabular' ? 'var(--text-main)' : 'var(--text-muted)',
            fontWeight: modality === 'tabular' ? 600 : 400,
            cursor: 'pointer',
            paddingBottom: '0.25rem',
            borderBottom: modality === 'tabular' ? '2px solid var(--amber)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          Tabulaire
        </button>
        <button
          type="button"
          onClick={() => onModalityChange('text')}
          style={{
            background: 'none',
            border: 'none',
            color: modality === 'text' ? 'var(--text-main)' : 'var(--text-muted)',
            fontWeight: modality === 'text' ? 600 : 400,
            cursor: 'pointer',
            paddingBottom: '0.25rem',
            borderBottom: modality === 'text' ? '2px solid var(--amber)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          Texte
        </button>
        <button
          type="button"
          onClick={() => onModalityChange('image')}
          style={{
            background: 'none',
            border: 'none',
            color: modality === 'image' ? 'var(--text-main)' : 'var(--text-muted)',
            fontWeight: modality === 'image' ? 600 : 400,
            cursor: 'pointer',
            paddingBottom: '0.25rem',
            borderBottom: modality === 'image' ? '2px solid var(--amber)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          Images
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {location.pathname === '/cleaning' && modality === 'image' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-image-recipe'))}
            >
              Export recipe
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/augmentation')}
            >
              <span>Continue to augmentation →</span>
            </button>
          </>
        ) : location.pathname === '/cleaning' && modality === 'text' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-text-recipe'))}
            >
              Export recipe
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/augmentation')}
            >
              <span>Continue to augmentation →</span>
            </button>
          </>
        ) : location.pathname === '/cleaning' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-recipe'))}
            >
              Exporter la recette
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/augmentation')}
            >
              <span>Continuer vers l'augmentation</span>
              <ArrowRight size={14} />
            </button>
          </>
        ) : location.pathname === '/augmentation' && modality === 'text' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-text-augmentation-recipe'))}
            >
              Export recipe
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/versioning')}
            >
              <span>Continue to versioning →</span>
            </button>
          </>
        ) : location.pathname === '/augmentation' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-augmentation-recipe'))}
            >
              Exporter la recette
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/versioning')}
            >
              <span>Continuer vers le versioning</span>
              <ArrowRight size={14} />
            </button>
          </>
        ) : location.pathname === '/versioning' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:export-dataset-card'))}
            >
              Exporter la carte du dataset
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/labeling')}
            >
              <span>Continuer vers le labeling</span>
              <ArrowRight size={14} />
            </button>
          </>
        ) : location.pathname === '/labeling' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:target-definition'))}
            >
              Définition de la cible
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/training')}
            >
              <span>Continuer vers le training</span>
              <ArrowRight size={14} />
            </button>
          </>
        ) : location.pathname === '/training' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:compare-runs'))}
            >
              Comparer les runs
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/active-learning')}
            >
              <span>Continuer vers l'apprentissage actif</span>
              <ArrowRight size={14} />
            </button>
          </>
        ) : location.pathname === '/active-learning' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:open-round-history'))}
            >
              Historique des cycles
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/drift')}
            >
              <span>Continuer vers la dérive</span>
              <ArrowRight size={14} />
            </button>
          </>
        ) : location.pathname === '/drift' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:open-drift-history'))}
            >
              Historique de dérive
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => navigate('/export-api')}
            >
              <span>Continuer vers l'export</span>
              <ArrowRight size={14} />
            </button>
          </>
        ) : location.pathname === '/export-api' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:open-version-history'))}
            >
              Version history
            </button>
            <button
              type="button"
              className="btn btn-primary font-mono"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={() => window.dispatchEvent(new CustomEvent('datalift:deploy-to-staging'))}
            >
              <span>Deploy to staging →</span>
            </button>
          </>
        ) : (

          <>
            <button
              type="button"
              className="btn btn-secondary font-mono"
              style={{ fontSize: '0.75rem', padding: '0.45rem 0.95rem' }}
              onClick={() => alert("Génération du rapport d'audit (bientôt disponible).")}
            >
              <Download size={13} />
              Rapport d'audit
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
              onClick={handleNextStep}
            >
              <span>Étape suivante</span>
              <ArrowRight size={14} />
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export const App: React.FC = () => {
  const [modality, setModality] = useState<'tabular' | 'text' | 'image'>(() => {
    return (localStorage.getItem('datalift_modality') as 'tabular' | 'text' | 'image') || 'tabular';
  });

  const handleModalityChange = (m: 'tabular' | 'text' | 'image') => {
    setModality(m);
    localStorage.setItem('datalift_modality', m);
    window.dispatchEvent(new CustomEvent('datalift:modality-changed', { detail: m }));

    if (m === 'text') {
      api.getDatasets().then(list => {
        const textDs = list.find(d => d.name === 'test_texte.txt' || d.name === 'support_tickets.jsonl' || d.name.includes('nlp') || d.name.includes('review') || d.name.includes('text'));
        if (textDs) {
          localStorage.setItem('datalift_selected_dataset_id', textDs.id);
          window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: textDs.id }));
        }
      }).catch(() => {});
    } else if (m === 'image') {
      api.getDatasets().then(list => {
        const imgDs = list.find(d => d.name === 'product_defects/' || d.name.includes('defect') || d.name.includes('image'));
        if (imgDs) {
          localStorage.setItem('datalift_selected_dataset_id', imgDs.id);
          window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: imgDs.id }));
        }
      }).catch(() => {});
    } else if (m === 'tabular') {
      api.getDatasets().then(list => {
        const tabDs = list.find(d => !d.name.includes('defect') && !d.name.endsWith('.txt') && !d.name.endsWith('.jsonl') && (d.name.includes('churn') || d.name === 'data' || d.name === 'test'));
        if (tabDs) {
          localStorage.setItem('datalift_selected_dataset_id', tabDs.id);
          window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: tabDs.id }));
        }
      }).catch(() => {});
    }
  };

  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="main-content">
          <TopBar modality={modality} onModalityChange={handleModalityChange} />
          
          <main style={{ flex: 1, overflowY: 'auto' }}>
            <ErrorBoundary>
              <Routes>
              <Route path="/" element={<Navigate to="/versioning" replace />} />
              
              {/* 01. Profiling (Tabular, Text or Image depending on active modality) */}
              <Route
                path="/profiling"
                element={
                  modality === 'image' ? <ImageProfilingPage /> :
                  modality === 'text' ? <TextProfilingPage /> :
                  <ProfilingPage />
                }
              />
              <Route path="/text-profiling" element={<TextProfilingPage />} />
              <Route path="/image-profiling" element={<ImageProfilingPage />} />

              {/* 02. Cleaning */}
              <Route
                path="/cleaning"
                element={
                  modality === 'image' ? <ImageCleaningPage /> :
                  modality === 'text' ? <TextCleaningPage /> :
                  <CleaningPage />
                }
              />
              <Route path="/text-cleaning" element={<TextCleaningPage />} />
              <Route path="/image-cleaning" element={<ImageCleaningPage />} />

              {/* 03. Augmentation */}
              <Route
                path="/augmentation"
                element={
                  modality === 'text' ? <TextAugmentationPage /> :
                  <AugmentationPage />
                }
              />
              <Route path="/text-augmentation" element={<TextAugmentationPage />} />

              {/* 04. Versioning (Functional Module) */}
              <Route path="/versioning" element={<VersioningPage />} />

              {/* 05. Labeling */}
              <Route path="/labeling" element={<LabelingPage />} />

              {/* 06. Training */}
              <Route path="/training" element={<TrainingPage />} />

              {/* 07. Active learning */}
              <Route path="/active-learning" element={<ActiveLearningPage />} />

              {/* 08. Drift */}
              <Route path="/drift" element={<DriftPage />} />

              {/* 09. Export / API */}
              <Route path="/export-api" element={<ExportApiPage />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/versioning" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
