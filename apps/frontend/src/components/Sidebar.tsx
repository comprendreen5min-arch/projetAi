import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

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
  return (
    <aside className="sidebar">
      {/* Brand Logo in Serif with amber dot */}
      <div className="sidebar-logo">
        <span className="font-serif">Datalift</span>
        <span className="sidebar-logo-dot" />
      </div>

      {/* Project Selector (1 entry by default) */}
      <div className="sidebar-section">
        <div className="sidebar-label font-mono">PROJECT</div>
        <div className="project-selector">
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Mon projet
          </span>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
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

