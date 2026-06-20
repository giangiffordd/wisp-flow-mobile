import { createClient } from '@supabase/supabase-js';

// ===== AI GENERATED: supabaseService =====
// Purpose: Supabase client initialization and inventory data access
// Inputs: none (uses hardcoded credentials); fetchRandomSpecimen / fetchProductsCatalog take no args
// Returns: formatted specimen objects { species, commonName }
// Flow:
// 1. Initialize supabase client once if credentials are present
// 2. formatProductsData normalizes raw rows (handles mixed casing)
// 3. fetchRandomSpecimen picks one random row for YOLO scan mode
// 4. fetchProductsCatalog returns full sorted inventory list

export const SUPABASE_URL = 'https://iadqpfkzuykgcsyfluft.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZHFwZmt6dXlrZ2NzeWZsdWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTQ2MzYsImV4cCI6MjA5Mzg5MDYzNn0.XzWKguRz2ON5f2dk42s50VSf0PU2sR7cDm-Gviua144';

export let supabase = null;

const isConfigured =
  SUPABASE_URL && !SUPABASE_URL.includes('YOUR_SUPABASE') &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

if (isConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (initError) {
    console.error('Failed to initialize Supabase client:', initError);
  }
}

/**
 * @function formatProductsData
 * @description Normalize raw Supabase inventory rows into { species, commonName } shape.
 * @param {Array<Object>} rawRows
 * @returns {Array<{ species: string, commonName: string }>}
 */
function formatProductsData(rawRows) {
  if (!rawRows || !Array.isArray(rawRows)) return [];
  return rawRows.map(inventoryRow => {
    const genusKey      = Object.keys(inventoryRow).find(k => k.toLowerCase() === 'genus');
    const speciesKey    = Object.keys(inventoryRow).find(k => k.toLowerCase() === 'species');
    const commonNameKey = Object.keys(inventoryRow).find(k =>
      ['common_name', 'commonname', 'commonname'].includes(k.toLowerCase())
    );
    const nameKey = Object.keys(inventoryRow).find(k => k.toLowerCase() === 'name');

    const genusVal      = genusKey      ? inventoryRow[genusKey]      : '';
    const speciesVal    = speciesKey    ? inventoryRow[speciesKey]    : '';
    const commonNameVal = commonNameKey ? inventoryRow[commonNameKey] : (nameKey ? inventoryRow[nameKey] : '');

    let scientificName = '';
    if (genusVal && speciesVal)   scientificName = `${genusVal} ${speciesVal}`;
    else if (genusVal)            scientificName = genusVal;
    else if (speciesVal)          scientificName = speciesVal;
    else                          scientificName = commonNameVal || 'Unknown Insect';

    return { species: scientificName, commonName: commonNameVal || scientificName };
  });
}

/**
 * @function fetchRandomSpecimen
 * @description Fetch one random specimen from the inventory table for YOLO scan mode.
 * @returns {Promise<{ species: string, commonName: string }|null>}
 */
export async function fetchRandomSpecimen() {
  if (!supabase) {
    console.warn('Supabase not configured — cannot fetch random specimen.');
    return null;
  }
  try {
    const { data: inventoryRows, error: fetchError } = await supabase
      .from('inventory').select('genus, species, name').limit(100);
    if (fetchError) { console.error('fetchRandomSpecimen error:', fetchError.message); return null; }
    if (!inventoryRows || inventoryRows.length === 0) return null;
    const formattedRows = formatProductsData(inventoryRows);
    if (formattedRows.length === 0) return null;
    return formattedRows[Math.floor(Math.random() * formattedRows.length)];
  } catch (unexpectedError) {
    console.error('fetchRandomSpecimen exception:', unexpectedError);
    return null;
  }
}

/**
 * @function fetchProductsCatalog
 * @description Fetch the full inventory catalog sorted by genus.
 * @returns {Promise<Array<{ species: string, commonName: string }>|null>}
 */
export async function fetchProductsCatalog() {
  if (!supabase) {
    console.warn('Supabase not configured — add anon key to enable sync.');
    return null;
  }
  try {
    const { data: catalogRows, error: fetchError } = await supabase
      .from('inventory').select('genus, species, name').order('genus', { ascending: true }).limit(100);
    if (fetchError) { console.error('fetchProductsCatalog error:', fetchError.message); return null; }
    return formatProductsData(catalogRows);
  } catch (unexpectedError) {
    console.error('fetchProductsCatalog exception:', unexpectedError);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Scan Batches — YoLo QC results saved for web dashboard approval
// ─────────────────────────────────────────────────────────────────

export async function submitScanBatch(batchData) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('scan_batches')
      .insert({
        species:         batchData.species,
        species_display: batchData.species_display || batchData.species,
        stage_number:    batchData.stage_number || 9,
        stage_name:      batchData.stage_name || 'Quality Control',
        status:          'pending_approval',
        specimens:       batchData.specimens || [],
        total_scanned:   batchData.total_scanned || 0,
        pass_count:      batchData.pass_count || 0,
        flagged_count:   batchData.flagged_count || 0,
        notes:           batchData.notes || null,
        worker_name:     batchData.worker_name || 'Worker',
      })
      .select()
      .single();
    if (error) { console.error('submitScanBatch error:', error.message); return null; }
    return data;
  } catch (e) {
    console.error('submitScanBatch exception:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Production Batches — 12-stage lifecycle tracking
// ─────────────────────────────────────────────────────────────────

export async function createProductionBatch(batchName, species) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('production_batches')
      .insert({ batch_name: batchName, species, current_stage: 1, status: 'in_progress' })
      .select()
      .single();
    if (error) { console.error('createProductionBatch error:', error.message); return null; }
    return data;
  } catch (e) {
    console.error('createProductionBatch exception:', e);
    return null;
  }
}

export async function getProductionBatches() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('production_batches')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('getProductionBatches error:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('getProductionBatches exception:', e);
    return [];
  }
}

export async function advanceBatchStage(batchId, newStage) {
  if (!supabase) return false;
  try {
    const status = newStage > 12 ? 'completed' : 'in_progress';
    const { error } = await supabase
      .from('production_batches')
      .update({ current_stage: newStage, status, updated_at: new Date().toISOString() })
      .eq('id', batchId);
    if (error) { console.error('advanceBatchStage error:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('advanceBatchStage exception:', e);
    return false;
  }
}

export async function addStageLog(batchId, stageNumber, stageName, logText, workerName = 'Worker') {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('stage_logs')
      .insert({ batch_id: batchId, stage_number: stageNumber, stage_name: stageName, log_text: logText, worker_name: workerName })
      .select()
      .single();
    if (error) { console.error('addStageLog error:', error.message); return null; }
    return data;
  } catch (e) {
    console.error('addStageLog exception:', e);
    return null;
  }
}

export async function getStageLogsForBatch(batchId) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('stage_logs')
      .select('*')
      .eq('batch_id', batchId)
      .order('logged_at', { ascending: true });
    if (error) { console.error('getStageLogsForBatch error:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('getStageLogsForBatch exception:', e);
    return [];
  }
}
