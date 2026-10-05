import { useContext } from 'react';
import { DataContext } from './dataStore';

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
