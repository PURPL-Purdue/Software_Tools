import { createContext } from 'react';

// Every propulsion project the app knows about, in dropdown order. This is
// the single source of truth for the Project dropdown - it's a hand-kept
// constant rather than fetched, since the list only changes when we
// decide it should. Add/remove/rename a project by editing this array.
//
// A project's name doubles as its identifier: it's what gets sent to the
// server when fetching that project's test fires (URL-encoded, see
// projectsApi.ts), so keep each entry exactly as the server knows it.
export const PROJECTS = [
  'E-Prop',
  'Pulsejet',
  'RDE',
  'Testbed',
  'Test Infrastructure',
  'TTP',
  'Turbojet',
  'Turbopump',
] as const;

export type Project = (typeof PROJECTS)[number];

// interface for each test fire returned from the server.
export interface TestFire {
  id: string;
  name: string;
  timestamp?: number; // epoch ms
}

export interface ProjectsContextValue {
  projects: readonly Project[];

  selectedProject: Project | null;
  selectProject: (project: Project | null) => void;

  testFires: TestFire[];
  testFiresLoading: boolean;
  testFiresError: string | null;
  reloadTestFires: () => void;
}

export const ProjectsContext = createContext<ProjectsContextValue | null>(null);
