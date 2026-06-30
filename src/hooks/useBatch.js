import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { submitScanBatch, fetchBatchStatuses } from '../services/supabaseService';
import { getWorkerSession, workerLabel } from '../services/workerSession';

// ===== AI GENERATED: useBatch =====
// Purpose: Encapsulates all batch lifecycle state and AsyncStorage persistence
// Inputs: none (self-contained hook)
// Returns: { activeBatch, recentBatches, currentSpecies, stats, startNewBatch, applyDiscard, submitBatch }
// Flow:
// 1. On focus: load species, active batch, history, and any pending scan result from AsyncStorage
// 2. Apply pending scan result to active batch via applyResultToBatch (pure)
// 3. Persist activeBatch to AsyncStorage on every change
// 4. Expose action functions for components to call

export const MAX_RESCANS = 2;

/**
 * @function submitBatchToStorage
 * @description Standalone (no React state) — finalizes a batch, persists to AsyncStorage
 * and fires Supabase sync. Safe to call from any screen without instantiating the hook.
 */
export async function submitBatchToStorage(batch) {
  const session    = await getWorkerSession();
  const workerName = session ? workerLabel(session) : 'Worker';
  const prefix     = session?.employee_id || 'default';

  const finalized = {
    ...batch,
    status:      'pending_approval',
    submittedAt: new Date().toISOString(),
    workerName,
  };

  const raw      = await AsyncStorage.getItem(`${prefix}_recent_batches`).catch(() => null);
  const existing = raw ? JSON.parse(raw) : [];
  const updated  = [finalized, ...existing].slice(0, 10);

  await AsyncStorage.setItem(`${prefix}_recent_batches`, JSON.stringify(updated));
  await AsyncStorage.removeItem(`${prefix}_active_batch`);

  submitScanBatch({
    species:         finalized.species,
    species_display: finalized.commonName || finalized.species,
    stage_number:    finalized.stageNumber || 9,
    stage_name:      finalized.stageName   || 'Quality Control',
    specimens:       finalized.specimens,
    total_scanned:   finalized.specimens.length,
    pass_count:      finalized.specimens.filter(s => s.status === 'pass').length,
    flagged_count:   finalized.specimens.filter(s => s.status === 'flagged' || s.status === 'escalated').length,
    worker_name:     workerName,
  }).catch(() => {});
}

/**
 * @function generateId
 * @description Generate a random short ID for specimens and batches.
 * @returns {string}
 */
function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * @function applyResultToBatch
 * @description Pure function — merges a scan result into a batch without mutating.
 * @param {Object} currentBatch
 * @param {Object} scanResult
 * @returns {Object} Updated batch
 */
export function applyResultToBatch(currentBatch, scanResult) {
  if (scanResult.isRescan && scanResult.specimenId) {
    const updatedSpecimens = currentBatch.specimens.map(specimen => {
      if (specimen.id !== scanResult.specimenId) return specimen;
      const newRescanCount = specimen.rescan_count + 1;
      const shouldEscalate = scanResult.status === 'flagged' && newRescanCount >= MAX_RESCANS;
      return {
        ...specimen,
        status:          shouldEscalate ? 'escalated' : scanResult.status,
        rescan_count:    newRescanCount,
        last_scanned_at: new Date().toISOString(),
      };
    });
    return { ...currentBatch, specimens: updatedSpecimens };
  }

  const newSpecimen = {
    id:               generateId(),
    status:           scanResult.status,
    species:          scanResult.speciesDisplay || scanResult.species,
    confidence:       scanResult.confidence || 0,
    parts_found:      scanResult.partsFound   || {},
    parts_required:   scanResult.partsRequired || {},
    species_mismatch: scanResult.species_mismatch || false,
    rescan_count:     0,
    discard_reason:   null,
    discard_notes:    null,
    scanned_at:       scanResult.timestamp || new Date().toISOString(),
    last_scanned_at:  scanResult.timestamp || new Date().toISOString(),
  };
  return { ...currentBatch, specimens: [...currentBatch.specimens, newSpecimen] };
}

/**
 * @function useBatch
 * @description Hook managing the full batch lifecycle: state, persistence, and actions.
 * @returns {{ activeBatch: Object|null, recentBatches: Array, currentSpecies: Object, stats: Object|null, startNewBatch: Function, applyDiscard: Function, submitBatch: Function }}
 */
export default function useBatch() {
  const isFocused = useIsFocused();
  const workerPrefixRef = useRef('default');

  const [currentSpecies, setCurrentSpecies] = useState({ species: 'Awaiting scan…', commonName: '' });
  const [activeBatch,    setActiveBatch]    = useState(null);
  const [recentBatches,  setRecentBatches]  = useState([]);

  // Load all persisted data on focus; consume any pending scan result
  useEffect(() => {
    if (!isFocused) return;

    const loadPersistedState = async () => {
      try {
        const session = await getWorkerSession();
        const prefix = session?.employee_id || 'default';
        workerPrefixRef.current = prefix;

        const storagePairs = await AsyncStorage.multiGet([
          'last_detected_species',
          `${prefix}_active_batch`,
          `${prefix}_recent_batches`,
          'pending_specimen_result',
        ]);
        const [speciesRaw, batchRaw, historyRaw, pendingRaw] = storagePairs.map(pair => pair[1]);

        if (speciesRaw) { try { setCurrentSpecies(JSON.parse(speciesRaw)); } catch {} }
        if (historyRaw) { try { setRecentBatches(JSON.parse(historyRaw)); }  catch {} }

        let restoredBatch = null;
        try { restoredBatch = batchRaw ? JSON.parse(batchRaw) : null; } catch {}

        if (pendingRaw) {
          await AsyncStorage.removeItem('pending_specimen_result');
          try {
            const pendingResult = JSON.parse(pendingRaw);
            if (restoredBatch && pendingResult.batchId === restoredBatch.id) {
              restoredBatch = applyResultToBatch(restoredBatch, pendingResult);
              await AsyncStorage.setItem(`${prefix}_active_batch`, JSON.stringify(restoredBatch));
            }
          } catch {}
        }

        setActiveBatch(restoredBatch);

        // Sync approval statuses from Supabase for pending batches
        let localBatches = historyRaw ? JSON.parse(historyRaw) : [];
        const pendingBatches = localBatches.filter(b => b.status === 'pending_approval' && b.supabaseId);
        if (pendingBatches.length > 0) {
          const updated = await fetchBatchStatuses(pendingBatches.map(b => b.supabaseId));
          let changed = false;
          let newRescanTasks = [];

          localBatches = localBatches.map(batch => {
            const remote = updated.find(r => r.id === batch.supabaseId);
            if (!remote || remote.status === batch.status) return batch;

            changed = true;
            const updatedBatch = { ...batch, status: remote.status };

            // On approval: flagged specimens → new rescan task
            if (remote.status === 'approved') {
              const flagged = (remote.specimens || batch.specimens || [])
                .filter(s => s.status === 'flagged' || s.status === 'escalated');
              if (flagged.length > 0) {
                newRescanTasks.push({
                  id: generateId(),
                  species: batch.species,
                  commonName: batch.commonName,
                  specimens: flagged.map(s => ({ ...s, status: 'flagged', rescan_count: (s.rescan_count || 0) })),
                  status: 'needs_rescan',
                  createdAt: new Date().toISOString(),
                  submittedAt: null,
                  originalBatchId: batch.id,
                });
              }
            }
            return updatedBatch;
          });

          if (changed || newRescanTasks.length > 0) {
            const merged = [...newRescanTasks, ...localBatches].slice(0, 20);
            setRecentBatches(merged);
            await AsyncStorage.setItem(`${prefix}_recent_batches`, JSON.stringify(merged)).catch(() => {});
          }
        }
      } catch {}
    };

    loadPersistedState();
  }, [isFocused]);

  // Persist activeBatch whenever it changes (keyed by worker)
  useEffect(() => {
    const key = `${workerPrefixRef.current}_active_batch`;
    if (activeBatch === null) {
      AsyncStorage.removeItem(key).catch(() => {});
    } else {
      AsyncStorage.setItem(key, JSON.stringify(activeBatch)).catch(() => {});
    }
  }, [activeBatch]);

  /**
   * @function startNewBatch
   * @description Create a new batch for the current species.
   * @returns {void}
   */
  function startNewBatch() {
    setActiveBatch({
      id:        generateId(),
      createdAt: new Date().toISOString(),
      species:   currentSpecies.species,
      commonName: currentSpecies.commonName,
      specimens: [],
    });
  }

  function startBatchForSpecies(speciesName, commonName) {
    const newId = generateId();
    setActiveBatch({
      id:        newId,
      createdAt: new Date().toISOString(),
      species:   speciesName,
      commonName: commonName || speciesName,
      specimens: [],
    });
    return newId;
  }

  /**
   * @function applyDiscard
   * @description Mark a specimen as discarded with a reason.
   * @param {Object} specimen
   * @param {string} discardReason
   * @returns {void}
   */
  function applyDiscard(specimen, discardReason) {
    setActiveBatch(prev => ({
      ...prev,
      specimens: prev.specimens.map(s =>
        s.id === specimen.id ? { ...s, status: 'discarded', discard_reason: discardReason } : s
      ),
    }));
  }

  /**
   * @function submitBatch
   * @description Finalize a batch as pending_approval, add to history, clear active.
   * @param {Object} submittedBatch
   * @returns {Promise<void>}
   */
  async function submitBatch(submittedBatch) {
    const session = await getWorkerSession();
    const workerName = session ? workerLabel(session) : 'Worker';
    const prefix = session?.employee_id || 'default';

    const finalizedBatch = {
      ...submittedBatch,
      status:      'pending_approval',
      submittedAt: new Date().toISOString(),
      workerName,
    };
    const updatedHistory = [finalizedBatch, ...recentBatches].slice(0, 10);
    setRecentBatches(updatedHistory);
    setActiveBatch(null);
    await AsyncStorage.setItem(`${prefix}_recent_batches`, JSON.stringify(updatedHistory)).catch(() => {});

    // Sync to Supabase and store returned ID for status polling
    const passCount    = finalizedBatch.specimens.filter(s => s.status === 'pass').length;
    const flaggedCount = finalizedBatch.specimens.filter(s => s.status === 'flagged' || s.status === 'escalated').length;
    submitScanBatch({
      species:         finalizedBatch.species,
      species_display: finalizedBatch.commonName || finalizedBatch.species,
      stage_number:    finalizedBatch.stageNumber || 9,
      stage_name:      finalizedBatch.stageName   || 'Quality Control',
      specimens:       finalizedBatch.specimens,
      total_scanned:   finalizedBatch.specimens.length,
      pass_count:      passCount,
      flagged_count:   flaggedCount,
      worker_name:     workerName,
    }).then(result => {
      if (result?.id) {
        // Attach the Supabase row ID so we can poll for approval status later
        setRecentBatches(prev => {
          const patched = prev.map(b =>
            b.id === finalizedBatch.id ? { ...b, supabaseId: result.id } : b
          );
          AsyncStorage.setItem(`${prefix}_recent_batches`, JSON.stringify(patched)).catch(() => {});
          return patched;
        });
      }
    }).catch(() => {});
  }

  function clearActiveBatch() {
    setActiveBatch(null);
    // Also wipe the detected species -- otherwise the next "Start New
    // Batch" silently reuses the previous specimen's species instead of
    // requiring a fresh scan, which is what made "Clear Batch" look broken.
    setCurrentSpecies({ species: 'Awaiting scan…', commonName: '' });
    AsyncStorage.removeItem('last_detected_species').catch(() => {});
  }

  const stats = activeBatch ? {
    pass:      activeBatch.specimens.filter(s => s.status === 'pass').length,
    flagged:   activeBatch.specimens.filter(s => s.status === 'flagged').length,
    escalated: activeBatch.specimens.filter(s => s.status === 'escalated').length,
    discarded: activeBatch.specimens.filter(s => s.status === 'discarded').length,
  } : null;

  return {
    activeBatch,
    recentBatches,
    currentSpecies,
    stats,
    startNewBatch,
    startBatchForSpecies,
    applyDiscard,
    submitBatch,
    clearActiveBatch,
  };
}
