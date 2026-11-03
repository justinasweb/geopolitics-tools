// A dossier's facts from the data loaded now, or null when there is no data (a session without a snapshot).
import { dossierFacts } from './dossier-facts.ts';
import type { FactsFile } from './facts.ts';

export function tryLoadDossierFacts(id: string): FactsFile | null {
  try {
    return dossierFacts(id);
  } catch {
    return null;
  }
}
