import { createClient } from '@supabase/supabase-js';

// Supabase Connection URL provided
export const SUPABASE_URL = 'https://iadqpfkzuykgcsyfluft.supabase.co';

// TODO: Replace this with your actual Supabase Anon/Public API Key
// It usually starts with 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZHFwZmt6dXlrZ2NzeWZsdWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTQ2MzYsImV4cCI6MjA5Mzg5MDYzNn0.XzWKguRz2ON5f2dk42s50VSf0PU2sR7cDm-Gviua144';

export let supabase = null;

const isConfigured =
  SUPABASE_URL && !SUPABASE_URL.includes('YOUR_SUPABASE') &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

if (isConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }
}

/**
 * Utility to format table rows dynamically regardless of exact column casing.
 * Handles Genus/Species combinations and maps them to scientific name.
 */
function formatProductsData(data) {
  if (!data || !Array.isArray(data)) return [];

  return data.map(item => {
    // Find keys in a case-insensitive manner
    const genusKey = Object.keys(item).find(k => k.toLowerCase() === 'genus');
    const speciesKey = Object.keys(item).find(k => k.toLowerCase() === 'species');
    const commonNameKey = Object.keys(item).find(
      k => k.toLowerCase() === 'common_name' ||
        k.toLowerCase() === 'commonname' ||
        k.toLowerCase() === 'commonName'
    );
    const nameKey = Object.keys(item).find(k => k.toLowerCase() === 'name');

    const genusVal = genusKey ? item[genusKey] : '';
    const speciesVal = speciesKey ? item[speciesKey] : '';
    const commonNameVal = commonNameKey ? item[commonNameKey] : (nameKey ? item[nameKey] : '');

    // Combine Genus + Species for scientific name representation
    let scientificName = '';
    if (genusVal && speciesVal) {
      scientificName = `${genusVal} ${speciesVal}`;
    } else if (genusVal) {
      scientificName = genusVal;
    } else if (speciesVal) {
      scientificName = speciesVal;
    } else {
      scientificName = commonNameVal || 'Unknown Insect';
    }

    return {
      species: scientificName,
      commonName: commonNameVal || scientificName
    };
  });
}

/**
 * Fetch a single random specimen from the inventory table.
 * Used by YOLO Scan module.
 */
export async function fetchRandomSpecimen() {
  if (!supabase) {
    console.warn('Supabase is not configured. Cannot fetch random specimen.');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('genus, species, name')
      .limit(100);

    if (error) {
      console.error('Error fetching inventory for YOLO scan:', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    const formatted = formatProductsData(data);
    if (formatted.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * formatted.length);
    return formatted[randomIndex];
  } catch (err) {
    console.error('fetchRandomSpecimen exception:', err);
    return null;
  }
}

/**
 * Utility function to fetch products catalog from Supabase.
 * Queries the 'inventory' table which contains 'genus', 'species', and 'name'.
 */
export async function fetchProductsCatalog() {
  if (!supabase) {
    console.warn('Supabase is not configured yet. Add your anon key to enable sync.');
    return null;
  }

  try {
    // Query the inventory table
    const { data, error } = await supabase
      .from('inventory')
      .select('genus, species, name')
      .order('genus', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error fetching inventory from Supabase table:', error.message);
      return null;
    }

    return formatProductsData(data);
  } catch (err) {
    console.error('Supabase fetch exception:', err);
    return null;
  }
}
