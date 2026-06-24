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
//  Worker Auth — validates via server-side RPC (PIN never exposed)
// ─────────────────────────────────────────────────────────────────

export async function savePushToken(workerId, token) {
  if (!supabase || !workerId || !token) return;
  try {
    await supabase
      .from('workers')
      .update({ push_token: token })
      .eq('id', workerId);
  } catch (e) {
    console.error('savePushToken exception:', e);
  }
}

export async function loginWorker(employeeId, pin) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('login_worker', {
      p_employee_id: employeeId,
      p_pin: pin,
    });
    if (error) { console.error('loginWorker error:', error.message); return null; }
    if (!data || data.length === 0) return null;
    return data[0]; // { id, name, employee_id, role }
  } catch (e) {
    console.error('loginWorker exception:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Single-session enforcement — only the most recent login per worker
//  stays active; older devices get logged out. See
//  supabase/single_session_migration.sql for the server-side functions.
// ─────────────────────────────────────────────────────────────────

export async function claimWorkerSession(workerId) {
  if (!supabase || !workerId) return null;
  try {
    const { data, error } = await supabase.rpc('claim_worker_session', { p_worker_id: workerId });
    if (error) { console.error('claimWorkerSession error:', error.message); return null; }
    return data; // new session token (uuid)
  } catch (e) {
    console.error('claimWorkerSession exception:', e);
    return null;
  }
}

export async function isSessionActive(workerId, token) {
  if (!supabase || !workerId || !token) return true; // fail open -- don't lock workers out over a network blip
  try {
    const { data, error } = await supabase.rpc('is_session_active', { p_worker_id: workerId, p_token: token });
    if (error) { console.error('isSessionActive error:', error.message); return true; }
    return data === true;
  } catch (e) {
    console.error('isSessionActive exception:', e);
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Scan Batches — YoLo QC results saved for web dashboard approval
// ─────────────────────────────────────────────────────────────────

export async function fetchBatchStatuses(supabaseIds) {
  if (!supabase || !supabaseIds?.length) return [];
  try {
    const { data, error } = await supabase
      .from('scan_batches')
      .select('id, status, specimens')
      .in('id', supabaseIds);
    if (error) { console.error('fetchBatchStatuses error:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('fetchBatchStatuses exception:', e);
    return [];
  }
}

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

export async function createProductionBatch(batchName, species, orderId = null, quantityPlanned = 0) {
  if (!supabase) return null;
  try {
    const payload = { batch_name: batchName, species, current_stage: 1, status: 'in_progress', quantity_planned: quantityPlanned };
    if (orderId) payload.order_id = orderId;
    const { data, error } = await supabase
      .from('production_batches')
      .insert(payload)
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

export async function deleteProductionBatch(batchId) {
  if (!supabase || !batchId) return false;
  try {
    // Best-effort cleanup of this batch's logged entries first -- there's
    // no DB-level cascade configured, so leftover rows would otherwise
    // reference a batch that no longer exists.
    await supabase.from('stage_logs').delete().eq('batch_id', batchId);
    const { error } = await supabase.from('production_batches').delete().eq('id', batchId);
    if (error) { console.error('deleteProductionBatch error:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('deleteProductionBatch exception:', e);
    return false;
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

export async function updateStageLog(logId, newText) {
  if (!supabase || !logId) return false;
  try {
    const { error } = await supabase
      .from('stage_logs')
      .update({ log_text: newText })
      .eq('id', logId);
    if (error) { console.error('updateStageLog error:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('updateStageLog exception:', e);
    return false;
  }
}

export async function deleteStageLog(logId) {
  if (!supabase || !logId) return false;
  try {
    const { error } = await supabase
      .from('stage_logs')
      .delete()
      .eq('id', logId);
    if (error) { console.error('deleteStageLog error:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('deleteStageLog exception:', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Orders — B&B purchase orders driving production
// ─────────────────────────────────────────────────────────────────

export async function createOrder({ orderNumber, species, quantity, notes = null, clientName = 'Bits and Bugs' }) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert({ order_number: orderNumber, client_name: clientName, species, quantity, notes, status: 'pending' })
      .select()
      .single();
    if (error) { console.error('createOrder error:', error.message); return null; }
    return data;
  } catch (e) {
    console.error('createOrder exception:', e);
    return null;
  }
}

export async function fetchOrders() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, production_batches(id, batch_name, current_stage, status, quantity_planned, created_at)')
      .order('created_at', { ascending: false });
    if (error) { console.error('fetchOrders error:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('fetchOrders exception:', e);
    return [];
  }
}

export async function fetchOrderById(orderId) {
  if (!supabase || !orderId) return null;
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, production_batches(id, batch_name, current_stage, status, quantity_planned, created_at)')
      .eq('id', orderId)
      .single();
    if (error) { console.error('fetchOrderById error:', error.message); return null; }
    return data;
  } catch (e) {
    console.error('fetchOrderById exception:', e);
    return null;
  }
}

export async function updateOrderStatus(orderId, status) {
  if (!supabase || !orderId) return false;
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);
    if (error) { console.error('updateOrderStatus error:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('updateOrderStatus exception:', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Staff Alerts — manager-to-worker notifications
// ─────────────────────────────────────────────────────────────────

export async function fetchStaffAlerts() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('id, title, message, type, severity, created_at')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) { console.warn('fetchStaffAlerts:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.warn('fetchStaffAlerts exception:', e);
    return [];
  }
}

export async function dismissStaffAlert(alertId) {
  if (!supabase || !alertId) return false;
  try {
    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true })
      .eq('id', alertId);
    if (error) { console.warn('dismissStaffAlert:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('dismissStaffAlert exception:', e);
    return false;
  }
}

export async function dismissAllStaffAlerts(alertIds = []) {
  if (!supabase || alertIds.length === 0) return false;
  try {
    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true })
      .in('id', alertIds);
    if (error) { console.warn('dismissAllStaffAlerts:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('dismissAllStaffAlerts exception:', e);
    return false;
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
