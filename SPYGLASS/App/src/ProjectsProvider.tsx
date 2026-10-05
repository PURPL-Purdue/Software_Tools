import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchTestFires } from './projectsApi';
import { PROJECTS, ProjectsContext, type Project, type ProjectsContextValue, type TestFire } from './projectsStore';

// holds the current selected projects the corresponding test fires
export const ProjectsProvider = ({ children }: { children: ReactNode }) => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [testFires, setTestFires] = useState<TestFire[]>([]);
  const [testFiresLoading, setTestFiresLoading] = useState(false);
  const [testFiresError, setTestFiresError] = useState<string | null>(null);
  const [testFiresReloadToken, setTestFiresReloadToken] = useState(0);

  // re-fetch fires and project whenever it selected project changes
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedProject) {
        setTestFires([]);
        setTestFiresError(null);
        setTestFiresLoading(false);
        return;
      }

      setTestFiresLoading(true);
      setTestFiresError(null);
      try {
        const data = await fetchTestFires(selectedProject);
        if (!cancelled) setTestFires(data);
      } catch (err) {
        if (!cancelled) setTestFiresError(err instanceof Error ? err.message : 'Could not load test fires.');
      } finally {
        if (!cancelled) setTestFiresLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedProject, testFiresReloadToken]);

  const selectProject = useCallback((project: Project | null) => setSelectedProject(project), []);
  const reloadTestFires = useCallback(() => setTestFiresReloadToken((n) => n + 1), []);

  const value = useMemo<ProjectsContextValue>(
    () => ({
      projects: PROJECTS,
      selectedProject,
      selectProject,
      testFires,
      testFiresLoading,
      testFiresError,
      reloadTestFires,
    }),
    [
      selectedProject,
      selectProject,
      testFires,
      testFiresLoading,
      testFiresError,
      reloadTestFires,
    ]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
};
