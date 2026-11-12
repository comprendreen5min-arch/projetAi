import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { VersioningPage } from './pages/VersioningPage';
import { ProfilingPage } from './pages/ProfilingPage';
import { CleaningPage } from './pages/CleaningPage';
import { AugmentationPage } from './pages/AugmentationPage';
import { LabelingPage } from './pages/LabelingPage';
import { TrainingPage } from './pages/TrainingPage';
import { PlaceholderStep } from './pages/PlaceholderStep';
import { ArrowRight, Download } from 'lucide-react';

// Top bar matching the target mockup
const TopBar: React.FC = () => {
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
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-main)',
            fontWeight: 500,
            cursor: 'pointer',
            paddingBottom: '0.25rem',
            borderBottom: '2px solid var(--amber)',
          }}
        >
          Tabulaire
        </button>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'not-allowed',
            paddingBottom: '0.25rem',
          }}
          title="Bientôt disponible"
        >
          Texte
        </button>
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'not-allowed',
            paddingBottom: '0.25rem',
          }}
          title="Bientôt disponible"
        >
          Images
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {location.pathname === '/cleaning' ? (
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
  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="main-content">
          <TopBar />
          
          <main style={{ flex: 1, overflowY: 'auto' }}>
            <ErrorBoundary>
              <Routes>
              <Route path="/" element={<Navigate to="/versioning" replace />} />
              
              {/* 01. Profiling (Phase A Functional Module) */}
              <Route path="/profiling" element={<ProfilingPage />} />

              {/* 02. Cleaning */}
              <Route path="/cleaning" element={<CleaningPage />} />

              {/* 03. Augmentation */}
              <Route path="/augmentation" element={<AugmentationPage />} />

              {/* 04. Versioning (Functional Module) */}
              <Route path="/versioning" element={<VersioningPage />} />

              {/* 05. Labeling */}
              <Route path="/labeling" element={<LabelingPage />} />

              {/* 06. Training */}
              <Route path="/training" element={<TrainingPage />} />

              {/* 07. Active learning */}
              <Route
                path="/active-learning"
                element={
                  <PlaceholderStep
                    stepNumber="07"
                    title="Apprentissage Actif"
                    description="Sélection intelligente des échantillons les plus incertains à annoter en priorité pour maximiser le gain de performance."
                  />
                }
              />

              {/* 08. Drift */}
              <Route
                path="/drift"
                element={
                  <PlaceholderStep
                    stepNumber="08"
                    title="Surveillance de Dérive"
                    description="Détection en continu de la dérive des données (data drift) et de la dérive de concept (concept drift) en production."
                  />
                }
              />

              {/* 09. Export / API */}
              <Route
                path="/export-api"
                element={
                  <PlaceholderStep
                    stepNumber="09"
                    title="Export & Déploiement API"
                    description="Exportation des artefacts et exposition d'endpoints d'inférence sécurisés pour les applications clientes."
                  />
                }
              />

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
