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
} from 'lucide-react-native';
import { supabase } from '../src/supabaseClient';
import { COLORS, SHADOW_SM } from '../theme';

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
    color: COLORS.errorRed,
    bgColor: COLORS.errorBg,
    borderColor: COLORS.errorBorder,
    type: 'out',
  };
  if (stock >= 1 && stock <= 19) return {
    label: 'Low',
    color: COLORS.errorRed,
    bgColor: COLORS.errorBg,
    borderColor: COLORS.errorBorder,
    type: 'low',
  };
  if (stock >= 20 && stock <= 49) return {
    label: 'Medium Stock',
    color: COLORS.warningAmber,
    bgColor: COLORS.warningBg,
    borderColor: COLORS.warningBorder,
    type: 'medium',
  };
  return {
    label: 'In Stock',
    color: COLORS.successGreen,
    bgColor: COLORS.successBg,
    borderColor: COLORS.successBorder,
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
  const [dbStatus, setDbStatus] = useState('checking');
  const [expandedId, setExpandedId] = useState(null);
  const debounceRef = useRef(null);

  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 250);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  useEffect(() => {
    async function loadInventory() {
      if (!supabase) { setDbStatus('offline'); return; }
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('inventory')
          .select('*')
          .order('genus', { ascending: true });

        if (error) {
          console.error('Supabase query error:', error);
          setDbStatus('offline');
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
      } finally {
        setIsLoading(false);
      }
    }
    loadInventory();
  }, []);

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
        {/* ── Header — dark navy matches ICPI admin header ── */}
        {route?.name !== 'Inventory' && (
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <ArrowLeft size={20} color={COLORS.textOnDark} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Warehouse Inventory</Text>
              {dbStatus === 'connected_empty' && (
                <View style={[styles.statusPill, { backgroundColor: 'rgba(234,179,8,0.2)' }]}>
                  <Text style={styles.statusPillText}>Empty</Text>
                </View>
              )}
              {dbStatus === 'offline' && (
                <View style={[styles.statusPill, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
                  <Text style={styles.statusPillText}>Offline</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.filterMenuButton}>
              <SlidersHorizontal size={17} color={COLORS.textLight} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Search Bar ── */}
        <View style={styles.searchBarContainer}>
          <View style={styles.searchFieldWrapper}>
            <Search size={16} color={COLORS.textLight} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, ID, or species"
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
                <X size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          {route?.name === 'Inventory' && (
            <TouchableOpacity style={styles.filterMenuButtonInline} activeOpacity={0.7}>
              <SlidersHorizontal size={17} color={COLORS.textMid} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Summary strip — mirrors ICPI spreadsheet row header ── */}
        <View style={styles.dashboardSummary}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Specimens</Text>
            <Text style={styles.summaryValue}>{totalItems}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Low / Out Alert</Text>
            <Text style={[styles.summaryValue, lowStockCount > 0 && { color: COLORS.errorRed }]}>
              {lowStockCount}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Source</Text>
            <Text style={[styles.summaryValue, { fontSize: 11, marginTop: 2 }]}>
              {dbStatus === 'connected_live' ? '🟢 Supabase' : dbStatus === 'offline' ? '🔴 Offline' : '⏳ Checking'}
            </Text>
          </View>
        </View>

        {/* ── Filter tabs — same pill pattern as ICPI "All Families / All Statuses" ── */}
        <View style={styles.tabContainer}>
          {[
            { key: 'ALL', label: 'All Items' },
            { key: 'HIGH', label: 'High (50+)' },
            { key: 'MEDIUM', label: 'Med (20–49)' },
            { key: 'LOW_OUT', label: `Low / Out (${lowStockCount})` },
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 10 }} />
            <Text style={styles.loadingText}>Fetching inventory from Supabase…</Text>
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
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Search size={32} color={COLORS.borderMid} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>No Matching Inventory</Text>
                <Text style={styles.emptySubtitle}>Try refining your query or resetting the filter tabs.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <InventoryItem item={item} isExpanded={expandedId === item.id} onToggle={toggleExpand} />
            )}
          />
        )}
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ── Memoized inventory row — ICPI-style table/card hybrid ──────
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
            ? <ChevronUp size={13} color={COLORS.textMuted} />
            : <ChevronDown size={13} color={COLORS.textLight} />}
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
          <Package size={11} color={COLORS.textMuted} style={{ marginRight: 3 }} />
          <Text style={styles.locText}>Bin: {item.bin}</Text>
        </View>
        <View style={styles.locBadge}>
          <Info size={11} color={COLORS.textMuted} style={{ marginRight: 3 }} />
          <Text style={styles.locText}>Shelf: {item.shelf}</Text>
        </View>
      </View>

      {/* Expanded detail panel */}
      {isExpanded && (
        <View style={styles.detailPanel}>
          <View style={styles.detailPanelDivider} />
          <Text style={styles.detailPanelTitle}>Specimen Details</Text>

          <View style={styles.detailRow}>
            <Clock size={12} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>Last Updated</Text>
              <Text style={styles.detailValue}>{formatUpdatedAt(item.updatedAt)}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <MapPin size={12} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>Warehouse Location</Text>
              <Text style={styles.detailValue}>Bin {item.bin} — Shelf {item.shelf}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Hash size={12} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>Record ID</Text>
              <Text style={styles.detailValue}>{item.id}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Package size={12} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <View>
              <Text style={styles.detailLabel}>Current Stock Status</Text>
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
    backgroundColor: COLORS.pageBg,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.headerBg,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.headerBorder,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 7,
  },
  headerTitle: {
    color: COLORS.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    marginLeft: 4,
  },
  statusPillText: {
    color: COLORS.textOnDark,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  filterMenuButton: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 7,
  },

  // ── Search ───────────────────────────────────────────────────
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 8,
  },
  searchFieldWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: { marginRight: 6 },
  filterMenuButtonInline: {
    height: 40,
    width: 40,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textDark,
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
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  summaryLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textDark,
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
    borderRadius: 7,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
  },
  activeTab: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center' },
  activeTabText: { color: COLORS.white },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  loadingText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500' },

  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 32 },
  listContentEmpty: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 32 },

  // ── Item card — mirrors ICPI inventory card ────────────────────
  itemCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  itemCardExpanded: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
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
    color: COLORS.textDark,
    fontStyle: 'italic',
  },
  commonNameText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  stockLevelContainer: { marginBottom: 10 },
  stockTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  stockCountText: { fontSize: 12, color: COLORS.textMuted },
  boldStock: { fontWeight: '700', color: COLORS.textDark },
  thresholdText: { fontSize: 10, color: COLORS.textLight, fontWeight: '500' },
  progressBarBg: { height: 5, backgroundColor: COLORS.inputBg, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  cardFooter: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.pageBg,
    paddingTop: 10,
  },
  locBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  locText: { fontSize: 10, color: COLORS.textMid, fontWeight: '600' },

  // ── Detail panel ──────────────────────────────────────────────
  detailPanel: { marginTop: 4 },
  detailPanelDivider: {
    height: 1,
    backgroundColor: COLORS.pageBg,
    marginVertical: 10,
  },
  detailPanelTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 9,
    color: COLORS.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    color: COLORS.textMid,
    fontWeight: '600',
    lineHeight: 17,
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
});
