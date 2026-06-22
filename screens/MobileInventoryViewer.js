import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  Package,
  Info,
  SlidersHorizontal,
  XCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Hash,
  Shield,
  WifiOff,
  RefreshCw,
} from 'lucide-react-native';
import { supabase } from '../src/services/supabaseService';

// ── Design tokens ──────────────────────────────────────────────
const B = {
  bg:           '#F5F5F7',
  bgEl:         '#FFFFFF',
  bgCard:       '#FFFFFF',
  border:       '#E5E7EB',
  borderActive: '#5B21D9',
  accent:       '#5B21D9',
  accentDim:    '#7C3AED',
  accentText:   '#FFFFFF',
  textPri:      '#111827',
  textMuted:    '#6B7280',
  error:        '#EF4444',
  errorBg:      'rgba(239,68,68,0.08)',
  success:      '#10B981',
  successBg:    'rgba(16,185,129,0.10)',
  warning:      '#F59E0B',
  warningBg:    'rgba(245,158,11,0.10)',
  white:        '#FFFFFF',
};

// ── Fallback data ──────────────────────────────────────────────
const initialInventory = [
  { id: '1', species: 'Actias selene', commonName: 'Indian Moon Moth', stock: 145, bin: 'A-12', shelf: '03', updatedAt: null },
  { id: '2', species: 'Attacus atlas', commonName: 'Atlas Moth', stock: 18, bin: 'B-04', shelf: '01', updatedAt: null },
  { id: '3', species: 'Morpho peleides', commonName: 'Blue Morpho', stock: 35, bin: 'A-08', shelf: '02', updatedAt: null },
  { id: '4', species: 'Heliconius charithonia', commonName: 'Zebra Longwing', stock: 0, bin: 'C-15', shelf: '04', updatedAt: null },
  { id: '5', species: 'Caligo eurilochus', commonName: 'Forest Giant Owl', stock: 67, bin: 'A-22', shelf: '01', updatedAt: null },
  { id: '6', species: 'Danaus plexippus', commonName: 'Monarch Butterfly', stock: 42, bin: 'B-10', shelf: '03', updatedAt: null },
  { id: '7', species: 'Graphium sarpedon', commonName: 'Common Bluebottle', stock: 3, bin: 'C-02', shelf: '02', updatedAt: null },
  { id: '8', species: 'Papilio palinurus', commonName: 'Emerald Swallowtail', stock: 84, bin: 'B-14', shelf: '05', updatedAt: null },
];

// ── Stock helpers — mirrors ICPI status badge logic ────────────
const getStockLevel = (stock) => {
  if (stock === 0) return {
    label: 'Out of Stock',
    color: B.error,
    bgColor: B.errorBg,
    borderColor: B.error,
    type: 'out',
  };
  if (stock >= 1 && stock <= 19) return {
    label: 'Low',
    color: B.error,
    bgColor: B.errorBg,
    borderColor: B.error,
    type: 'low',
  };
  if (stock >= 20 && stock <= 49) return {
    label: 'Medium Stock',
    color: B.warning,
    bgColor: B.warningBg,
    borderColor: B.warning,
    type: 'medium',
  };
  return {
    label: 'In Stock',
    color: B.success,
    bgColor: B.successBg,
    borderColor: B.success,
    type: 'high',
  };
};

const formatUpdatedAt = (isoString) => {
  if (!isoString) return 'Not available';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoString;
  }
};

// ── Levenshtein distance for "did you mean?" ──────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function findClosestSpecies(query, inventory) {
  if (!query || query.length < 4 || inventory.length === 0) return null;
  const q = query.toLowerCase();
  let best = null, bestDist = Infinity;
  for (const item of inventory) {
    const d = Math.min(
      levenshtein(q, item.species.toLowerCase()),
      levenshtein(q, item.commonName.toLowerCase())
    );
    if (d < bestDist) { bestDist = d; best = item; }
  }
  return bestDist <= 3 ? best : null;
}

// ── Skeleton card shown while loading ─────────────────────────
const SkeletonCard = () => {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  return (
    <Animated.View style={[skeletonStyles.card, { opacity: pulse }]}>
      <View style={skeletonStyles.row}>
        <View style={skeletonStyles.iconBox} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={skeletonStyles.lineWide} />
          <View style={skeletonStyles.lineNarrow} />
        </View>
        <View style={skeletonStyles.badge} />
      </View>
      <View style={skeletonStyles.bar} />
    </Animated.View>
  );
};

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 0, backgroundColor: B.border },
  lineWide: { height: 10, borderRadius: 0, backgroundColor: B.border, width: '70%' },
  lineNarrow: { height: 8, borderRadius: 0, backgroundColor: B.bgEl, width: '45%' },
  badge: { width: 52, height: 20, borderRadius: 0, backgroundColor: B.border },
  bar: { height: 3, borderRadius: 0, backgroundColor: B.border, width: '100%' },
});

export default function MobileInventoryViewer({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const screenFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFocused) {
      screenFadeAnim.setValue(0);
      Animated.timing(screenFadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      screenFadeAnim.setValue(0);
    }
  }, [isFocused, screenFadeAnim]);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [inventory, setInventory] = useState(initialInventory);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [dbStatus, setDbStatus] = useState('checking');
  const [expandedId, setExpandedId] = useState(null);
  const debounceRef = useRef(null);

  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 250);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const loadInventory = useCallback(async () => {
    if (!supabase) { setDbStatus('offline'); setFetchError(true); return; }
    setIsLoading(true);
    setFetchError(false);
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('genus', { ascending: true });

      if (error) {
        console.error('Supabase query error:', error);
        setDbStatus('offline');
        setFetchError(true);
      } else if (data && data.length > 0) {
          const formatted = data.map((item, index) => {
            const get = (key) => Object.keys(item).find(k => k.toLowerCase() === key.toLowerCase());
            const genusKey = get('genus');
            const speciesKey = get('species');
            const nameKey = get('name');
            const stockKey = get('quantity') || get('stock');
            const binKey = get('bin');
            const shelfKey = get('shelf');
            const updatedAtKey = get('updated_at') || get('updatedat') || get('last_updated');

            const genusVal = genusKey ? item[genusKey] : '';
            const speciesVal = speciesKey ? item[speciesKey] : '';
            const nameVal = nameKey ? item[nameKey] : '';

            let scientific = '';
            if (genusVal && speciesVal) scientific = `${genusVal} ${speciesVal}`;
            else if (genusVal) scientific = genusVal;
            else if (speciesVal) scientific = speciesVal;
            else scientific = nameVal || 'Unknown Specimen';

            const stockVal = stockKey && typeof item[stockKey] === 'number' ? item[stockKey] : 0;
            const binVal = binKey && item[binKey] ? item[binKey] : `A-${String(index + 1).padStart(2, '0')}`;
            const shelfVal = shelfKey && item[shelfKey] ? item[shelfKey] : `0${(index % 5) + 1}`;
            const updatedAtVal = updatedAtKey && item[updatedAtKey] ? item[updatedAtKey] : null;

            return {
              id: item.id ? String(item.id) : String(index + 1),
              species: scientific,
              commonName: nameVal || scientific,
              stock: stockVal,
              bin: binVal,
              shelf: shelfVal,
              updatedAt: updatedAtVal,
            };
          });
          setInventory(formatted);
          setDbStatus('connected_live');
        } else {
          setDbStatus('connected_empty');
        }
    } catch (err) {
      console.error('Exception loading inventory:', err);
      setDbStatus('offline');
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const totalItems = inventory.length;
  const lowStockCount = useMemo(() => inventory.filter(item => item.stock < 20).length, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const q = debouncedQuery.toLowerCase();
      const matchesSearch =
        item.species.toLowerCase().includes(q) ||
        item.commonName.toLowerCase().includes(q) ||
        item.bin.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (activeFilter === 'HIGH') return item.stock >= 50;
      if (activeFilter === 'MEDIUM') return item.stock >= 20 && item.stock <= 49;
      if (activeFilter === 'LOW_OUT') return item.stock < 20;
      return true;
    });
  }, [inventory, debouncedQuery, activeFilter]);

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity: screenFadeAnim }}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >

        {/* ── Header ── */}
        {route?.name !== 'Inventory' && (
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <ArrowLeft size={20} color={B.textPri} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>[ WAREHOUSE INVENTORY ]</Text>
              {dbStatus === 'connected_empty' && (
                <View style={[styles.statusPill, { backgroundColor: B.warningBg, borderColor: B.warning, borderWidth: 1 }]}>
                  <Text style={[styles.statusPillText, { color: B.warning }]}>EMPTY</Text>
                </View>
              )}
              {dbStatus === 'offline' && (
                <View style={[styles.statusPill, { backgroundColor: B.errorBg, borderColor: B.error, borderWidth: 1 }]}>
                  <Text style={[styles.statusPillText, { color: B.error }]}>OFFLINE</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.filterMenuButton}
              onPress={() => {
                const cycle = ['ALL', 'HIGH', 'MEDIUM', 'LOW_OUT'];
                const next = cycle[(cycle.indexOf(activeFilter) + 1) % cycle.length];
                setActiveFilter(next);
              }}
              activeOpacity={0.7}
            >
              <SlidersHorizontal size={17} color={B.accentDim} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Search Bar ── */}
        <View style={styles.searchBarContainer}>
          <View style={styles.searchFieldWrapper}>
            <Search size={16} color={B.accentDim} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, ID, or species"
              placeholderTextColor={B.textMuted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
                <X size={14} color={B.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          {route?.name === 'Inventory' && (
            <TouchableOpacity style={styles.filterMenuButtonInline} activeOpacity={0.7}>
              <SlidersHorizontal size={17} color={B.accentDim} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Summary strip ── */}
        <View style={styles.dashboardSummary}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>[ TOTAL SPECIMENS ]</Text>
            <Text style={styles.summaryValue}>{totalItems}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>[ LOW / OUT ALERT ]</Text>
            <Text style={[styles.summaryValue, lowStockCount > 0 && { color: B.error }]}>
              {lowStockCount}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>[ SOURCE ]</Text>
            <Text style={[styles.summaryValue, { fontSize: 11, marginTop: 2 }]}>
              {dbStatus === 'connected_live' ? 'Supabase' : dbStatus === 'offline' ? 'Offline' : 'Checking…'}
            </Text>
          </View>
        </View>

        {/* ── Filter tabs ── */}
        <View style={styles.tabContainer}>
          {[
            { key: 'ALL', label: 'ALL' },
            { key: 'HIGH', label: 'HIGH 50+' },
            { key: 'MEDIUM', label: 'MED 20-49' },
            { key: 'LOW_OUT', label: `LOW/OUT (${lowStockCount})` },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeFilter === tab.key && styles.activeTab]}
              onPress={() => setActiveFilter(tab.key)}
            >
              <Text style={[styles.tabText, activeFilter === tab.key && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Inventory List ── */}
        {isLoading ? (
          <View style={{ flex: 1, paddingTop: 12 }}>
            {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
          </View>
        ) : fetchError ? (
          <View style={styles.errorContainer}>
            <WifiOff size={44} color={B.error} style={{ marginBottom: 14 }} />
            <Text style={styles.errorTitle}>Couldn't Load Inventory</Text>
            <Text style={styles.errorSubtitle}>
              Unable to reach Supabase. Check your connection and try again.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadInventory} activeOpacity={0.8}>
              <RefreshCw size={14} color={B.bg} style={{ marginRight: 6 }} />
              <Text style={styles.retryButtonText}>RETRY</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            style={styles.listContainer}
            contentContainerStyle={filteredInventory.length === 0 ? styles.listContentEmpty : styles.listContent}
            data={filteredInventory}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews
            ListEmptyComponent={(() => {
              const suggestion = debouncedQuery
                ? findClosestSpecies(debouncedQuery, inventory)
                : null;
              return (
                <View style={styles.emptyContainer}>
                  <Search size={32} color={B.accentDim} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyTitle}>No Matching Inventory</Text>
                  {suggestion ? (
                    <>
                      <Text style={styles.emptySubtitle}>
                        No results for "{debouncedQuery}".
                      </Text>
                      <TouchableOpacity
                        style={styles.suggestionRow}
                        onPress={() => { setSearchQuery(suggestion.species); setDebouncedQuery(suggestion.species); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.suggestionText}>
                          Did you mean{' '}
                          <Text style={styles.suggestionLink}>{suggestion.species}</Text>
                          {'?'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={styles.emptySubtitle}>
                      Try refining your query or resetting the filter tabs.
                    </Text>
                  )}
                </View>
              );
            })()}
            renderItem={({ item }) => (
              <InventoryItem item={item} isExpanded={expandedId === item.id} onToggle={toggleExpand} />
            )}
            ListFooterComponent={
              <TouchableOpacity
                style={styles.privacyRow}
                onPress={() => WebBrowser.openBrowserAsync(
                  'https://app.termly.io/policy-viewer/policy.html?policyUUID=1c0a8365-0ccf-4ffc-8f40-ee580a479fb3'
                )}
                activeOpacity={0.6}
              >
                <Shield size={12} color={B.textMuted} />
                <Text style={styles.privacyText}>Privacy Policy</Text>
              </TouchableOpacity>
            }
          />
        )}
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ── Memoized inventory row ──────────────────────────────────────
const InventoryItem = memo(({ item, isExpanded, onToggle }) => {
  const level = getStockLevel(item.stock);
  const maxRange = 150;
  const progressPercent = Math.min((item.stock / maxRange) * 100, 100);

  let IconComponent = CheckCircle2;
  if (level.type === 'out') IconComponent = XCircle;
  else if (level.type === 'low') IconComponent = AlertTriangle;
  else if (level.type === 'medium') IconComponent = Info;

  return (
    <TouchableOpacity
      style={[styles.itemCard, isExpanded && styles.itemCardExpanded]}
      onPress={() => onToggle(item.id)}
      activeOpacity={0.85}
    >
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.titleWrapper}>
          <Text style={styles.speciesText}>{item.species}</Text>
          <Text style={styles.commonNameText}>{item.commonName}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[styles.badge, { backgroundColor: level.bgColor, borderColor: level.borderColor }]}>
            <IconComponent size={11} color={level.color} style={{ marginRight: 3 }} />
            <Text style={[styles.badgeText, { color: level.color }]}>{level.label}</Text>
          </View>
          {isExpanded
            ? <ChevronUp size={13} color={B.accent} />
            : <ChevronDown size={13} color={B.accentDim} />}
        </View>
      </View>

      {/* Stock progress bar */}
      <View style={styles.stockLevelContainer}>
        <View style={styles.stockTextRow}>
          <Text style={styles.stockCountText}>
            <Text style={styles.boldStock}>{item.stock}</Text> units
          </Text>
          <Text style={styles.thresholdText}>Reorder Level: 20</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%`, backgroundColor: level.color }]} />
        </View>
      </View>

      {/* Location row */}
      <View style={styles.cardFooter}>
        <View style={styles.locBadge}>
          <Package size={11} color={B.accentDim} style={{ marginRight: 3 }} />
          <Text style={styles.locText}>Bin: {item.bin}</Text>
        </View>
        <View style={styles.locBadge}>
          <Info size={11} color={B.accentDim} style={{ marginRight: 3 }} />
          <Text style={styles.locText}>Shelf: {item.shelf}</Text>
        </View>
      </View>

      {/* Expanded detail panel */}
      {isExpanded && (
        <View style={styles.detailPanel}>
          <View style={styles.detailPanelDivider} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Text style={{ fontSize: 9, color: B.accent, fontWeight: '700', letterSpacing: 2.5 }}>[ SPECIMEN DETAILS ]</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
          </View>

          <View style={styles.detailRow}>
            <Clock size={12} color={B.accentDim} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>[ LAST UPDATED ]</Text>
              <Text style={styles.detailValue}>{formatUpdatedAt(item.updatedAt)}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <MapPin size={12} color={B.accentDim} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>[ WAREHOUSE LOCATION ]</Text>
              <Text style={styles.detailValue}>Bin {item.bin} — Shelf {item.shelf}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Hash size={12} color={B.accentDim} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>[ RECORD ID ]</Text>
              <Text style={styles.detailValue}>{item.id}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Package size={12} color={B.accentDim} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>[ CURRENT STOCK STATUS ]</Text>
              <Text style={[styles.detailValue, { color: level.color, fontWeight: '700' }]}>
                {level.label} — {item.stock} units remaining
              </Text>
            </View>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: B.bg,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: B.bgEl,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 0,
    padding: 8,
  },
  headerTitle: {
    color: B.textPri,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 14,
    textTransform: 'uppercase',
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 0,
    marginLeft: 4,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  filterMenuButton: {
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    borderRadius: 0,
    padding: 8,
  },

  // ── Search ───────────────────────────────────────────────────
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: B.bgEl,
    borderBottomWidth: 1,
    borderBottomColor: B.border,
    gap: 8,
  },
  searchFieldWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: B.bg,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: { marginRight: 6 },
  filterMenuButtonInline: {
    height: 40,
    width: 40,
    backgroundColor: B.bg,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: B.border,
  },
  searchInput: {
    flex: 1,
    color: B.textPri,
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 0,
  },
  clearSearchButton: { padding: 3 },

  // ── Summary strip ─────────────────────────────────────────────
  dashboardSummary: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 10,
    borderWidth: 1,
    borderColor: B.border,
  },
  summaryLabel: {
    fontSize: 9,
    color: B.accentDim,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
    color: B.textPri,
  },

  // ── Filter tabs ───────────────────────────────────────────────
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 5,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 3,
    borderRadius: 0,
    backgroundColor: B.bgEl,
    borderWidth: 1,
    borderColor: B.border,
    alignItems: 'center',
  },
  activeTab: { backgroundColor: B.accent, borderColor: B.accent },
  tabText: { fontSize: 9, fontWeight: '700', color: B.textMuted, textAlign: 'center', letterSpacing: 1 },
  activeTabText: { color: B.bg },

  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 32 },
  listContentEmpty: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 32 },

  // ── Item card ────────────────────────────────────────────────
  itemCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: B.border,
  },
  itemCardExpanded: {
    borderColor: B.borderActive,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleWrapper: { flex: 1, paddingRight: 8 },
  speciesText: {
    fontSize: 14,
    fontWeight: '700',
    color: B.accentText,
    fontStyle: 'italic',
  },
  commonNameText: {
    fontSize: 11,
    color: B.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 0,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },

  stockLevelContainer: { marginBottom: 10 },
  stockTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  stockCountText: { fontSize: 12, color: B.textMuted },
  boldStock: { fontWeight: '700', color: B.textPri },
  thresholdText: { fontSize: 10, color: B.accentDim, fontWeight: '500' },
  progressBarBg: { height: 3, backgroundColor: B.border, borderRadius: 0, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 0 },

  cardFooter: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: B.border,
    paddingTop: 10,
  },
  locBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: B.bg,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: B.border,
  },
  locText: { fontSize: 10, color: B.accentDim, fontWeight: '600' },

  // ── Detail panel ──────────────────────────────────────────────
  detailPanel: { marginTop: 4 },
  detailPanelDivider: {
    height: 1,
    backgroundColor: B.border,
    marginVertical: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 9,
    color: B.accentDim,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    color: B.textPri,
    fontWeight: '600',
    lineHeight: 17,
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: B.textPri, marginBottom: 6 },
  emptySubtitle: { fontSize: 12, color: B.textMuted, textAlign: 'center' },
  suggestionRow: { marginTop: 10 },
  suggestionText: { fontSize: 13, color: B.textMuted, textAlign: 'center' },
  suggestionLink: { color: B.accent, fontWeight: '700', textDecorationLine: 'underline' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: B.textPri, marginBottom: 8, textAlign: 'center' },
  errorSubtitle: { fontSize: 13, color: B.textMuted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: B.accent,
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 0,
    justifyContent: 'center',
  },
  retryButtonText: { color: B.bg, fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 20,
  },
  privacyText: {
    fontSize: 11,
    color: B.textMuted,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
