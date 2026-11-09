import React from 'react';
import { Database, GitBranch, Layers, ShieldCheck } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <header style={{ borderBottom: '1px solid var(--border)', background: 'rgba(19, 27, 46, 0.7)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 40 }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Layers size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Datalift</h1>
              <span className="badge badge-purple">AI Data Engine</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Plateforme de versioning immuable de données</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <GitBranch size={16} color="#8b5cf6" />
            <span>Lineage SHA-256</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Database size={16} color="#10b981" />
            <span>Format Parquet natif</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <ShieldCheck size={16} color="#3b82f6" />
            <span>Immuabilité garantie</span>
          </div>
        </div>
      </div>
    </header>
  );
};

