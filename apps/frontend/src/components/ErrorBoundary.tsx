import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erreur interceptée par ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '4rem 2rem', maxWidth: '640px', margin: '2rem auto', textAlign: 'center' }}>
          <div className="font-mono" style={{ fontSize: '0.75rem', color: '#fb7185', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            ERREUR D'AFFICHAGE
          </div>
          <h2 className="font-serif" style={{ fontSize: '1.8rem', fontWeight: 500, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
            Une erreur inattendue est survenue
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {this.state.error?.message || 'Erreur interne de rendu du composant.'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Recharger l'application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
