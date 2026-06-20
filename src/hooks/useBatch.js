import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';

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

  const [currentSpecies, setCurrentSpecies] = useState({ species: 'Awaiting scan…', commonName: '' });
  const [activeBatch,    setActiveBatch]    = useState(null);
  const [recentBatches,  setRecentBatches]  = useState([]);

  // Load all persisted data on focus; consume any pending scan result
  useEffect(() => {
    if (!isFocused) return;

    const loadPersistedState = async () => {
      try {
        const storagePairs = await AsyncStorage.multiGet([
          'last_detected_species',
          'active_batch',
          'recent_batches',
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
              await AsyncStorage.setItem('active_batch', JSON.stringify(restoredBatch));
            }
          } catch {}
        }

        setActiveBatch(restoredBatch);
      } catch {}
    };

    loadPersistedState();
  }, [isFocused]);

  // Persist activeBatch whenever it changes
  useEffect(() => {
    if (activeBatch === null) {
      AsyncStorage.removeItem('active_batch').catch(() => {});
    } else {
      AsyncStorage.setItem('active_batch', JSON.stringify(activeBatch)).catch(() => {});
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
    const finalizedBatch = {
      ...submittedBatch,
      status:      'pending_approval',
      submittedAt: new Date().toISOString(),
    };
    const updatedHistory = [finalizedBatch, ...recentBatches].slice(0, 10);
    setRecentBatches(updatedHistory);
    setActiveBatch(null);
    await AsyncStorage.setItem('recent_batches', JSON.stringify(updatedHistory)).catch(() => {});
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
    applyDiscard,
    submitBatch,
  };
}
