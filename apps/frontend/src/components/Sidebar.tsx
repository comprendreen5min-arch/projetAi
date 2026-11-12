import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { api } from '../services/api';
import { Dataset } from '../types';

interface WorkflowStep {
  number: string;
  name: string;
  path: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { number: '01', name: 'Profiling', path: '/profiling' },
  { number: '02', name: 'Cleaning', path: '/cleaning' },
  { number: '03', name: 'Augmentation', path: '/augmentation' },
  { number: '04', name: 'Versioning', path: '/versioning' },
  { number: '05', name: 'Labeling', path: '/labeling' },
  { number: '06', name: 'Training', path: '/training' },
  { number: '07', name: 'Active learning', path: '/active-learning' },
  { number: '08', name: 'Drift', path: '/drift' },
  { number: '09', name: 'Export / API', path: '/export-api' },
];

export const Sidebar: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string>(() => localStorage.getItem('datalift_selected_dataset_id') || '');

  useEffect(() => {
    api.getDatasets().then(list => {
      setDatasets(list);
      if (list.length > 0) {
        const stored = localStorage.getItem('datalift_selected_dataset_id');
        const match = list.find(d => d.id === stored);
        const current = match ? match.id : list[0].id;
        setSelectedId(current);
        localStorage.setItem('datalift_selected_dataset_id', current);
      }
    }).catch(() => {});

    const onDatasetChange = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setSelectedId(e.detail);
      }
    };
    window.addEventListener('datalift:dataset-changed', onDatasetChange);
    return () => window.removeEventListener('datalift:dataset-changed', onDatasetChange);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    localStorage.setItem('datalift_selected_dataset_id', id);
    window.dispatchEvent(new CustomEvent('datalift:dataset-changed', { detail: id }));
  };


  return (
    <aside className="sidebar">
      {/* Brand Logo in Serif with amber dot */}
      <div className="sidebar-logo">
        <span className="font-serif">Datalift</span>
        <span className="sidebar-logo-dot" />
      </div>

      {/* Project Selector */}
      <div className="sidebar-section">
        <div className="sidebar-label font-mono">PROJECT</div>
        <div style={{ position: 'relative' }}>
          <select
            value={selectedId}
            onChange={e => handleSelect(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 1.8rem 0.55rem 0.75rem',
              backgroundColor: '#121316',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              fontSize: '0.82rem',
              fontWeight: 500,
              appearance: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {datasets.map(d => (
              <option key={d.id} value={d.id} style={{ background: '#121316', color: '#e5e7eb' }}>
                {d.name === 'data' ? 'Churn prediction' : d.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Workflow Navigation */}
      <div>
        <div className="sidebar-section" style={{ marginBottom: '0.6rem' }}>
          <div className="sidebar-label font-mono">WORKFLOW</div>
        </div>
        <nav className="workflow-nav">
          {WORKFLOW_STEPS.map((step) => (
            <NavLink
              key={step.path}
              to={step.path}
              className={({ isActive }) => `workflow-item ${isActive ? 'active' : ''}`}
            >
              <span className="workflow-num font-mono">{step.number}</span>
              <span>{step.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
};

