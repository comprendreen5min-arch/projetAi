import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { VersioningPage } from './pages/VersioningPage';
import { ProfilingPage } from './pages/ProfilingPage';
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
          Tabular
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
          Text
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
            <Routes>
              <Route path="/" element={<Navigate to="/versioning" replace />} />
              
              {/* 01. Profiling (Phase A Functional Module) */}
              <Route path="/profiling" element={<ProfilingPage />} />

              {/* 02. Cleaning */}
              <Route
                path="/cleaning"
                element={
                  <PlaceholderStep
                    stepNumber="02"
                    title="Nettoyage & Correction"
                    description="Correction des incohérences syntaxiques, déduplication et imputation guidée des valeurs aberrantes."
                  />
                }
              />

              {/* 03. Augmentation */}
              <Route
                path="/augmentation"
                element={
                  <PlaceholderStep
                    stepNumber="03"
                    title="Augmentation de Données"
                    description="Génération d'échantillons synthétiques et enrichissement de caractéristiques pour renforcer la robustesse des modèles."
                  />
                }
              />

              {/* 04. Versioning (Functional Module) */}
              <Route path="/versioning" element={<VersioningPage />} />

              {/* 05. Labeling */}
              <Route
                path="/labeling"
                element={
                  <PlaceholderStep
                    stepNumber="05"
                    title="Labellisation Assistée"
                    description="Annotation assistée par modèles pré-entraînés et workflows de validation humaine pour les jeux d'apprentissage."
                  />
                }
              />

              {/* 06. Training */}
              <Route
                path="/training"
                element={
                  <PlaceholderStep
                    stepNumber="06"
                    title="Entraînement de Modèles"
                    description="Orchestration d'expérimentations d'apprentissage automatique, gestion des hyperparamètres et suivi des métriques."
                  />
                }
              />

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
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
