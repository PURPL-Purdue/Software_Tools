import { useContext } from 'react';
import { ProjectsContext } from './projectsStore';

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within a ProjectsProvider');
  return ctx;
}
