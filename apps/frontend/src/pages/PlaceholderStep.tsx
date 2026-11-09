import React from 'react';

interface PlaceholderStepProps {
  stepNumber: string;
  title: string;
  description: string;
}

export const PlaceholderStep: React.FC<PlaceholderStepProps> = ({
  stepNumber,
  title,
  description,
}) => {
  return (
    <div style={{ padding: '2.5rem 3rem', maxWidth: '1000px' }}>
      {/* Step tag */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--amber)', letterSpacing: '0.08em' }}>
          ÉTAPE {stepNumber}
        </span>
        <span className="badge badge-amber font-mono">Bientôt</span>
      </div>

      {/* Heading in Serif */}
      <h1 className="font-serif" style={{ fontSize: '2.4rem', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '1rem', color: 'var(--text-main)' }}>
        {title}
      </h1>

      {/* Description in Sans-serif */}
      <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', maxWidth: '640px', marginBottom: '2.5rem' }}>
        {description}
      </p>

      {/* Empty State Container (no fake data) */}
      <div
        className="card"
        style={{
          border: '1px dashed var(--border)',
          backgroundColor: 'transparent',
          padding: '3.5rem 2rem',
          textAlign: 'center',
          borderRadius: 8,
        }}
      >
        <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Module en cours de développement pour le workflow de données IA.
        </div>
      </div>
    </div>
  );
};

