import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  ScrollView, 
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
  Animated,
} from 'react-native';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Fallback data (used when Supabase is offline) ──
const initialInventory = [
  { id: '1', species: 'Actias selene',          commonName: 'Indian Moon Moth',     stock: 145, bin: 'A-12', shelf: '03', updatedAt: null },
  { id: '2', species: 'Attacus atlas',           commonName: 'Atlas Moth',           stock: 18,  bin: 'B-04', shelf: '01', updatedAt: null },
  { id: '3', species: 'Morpho peleides',         commonName: 'Blue Morpho',          stock: 35,  bin: 'A-08', shelf: '02', updatedAt: null },
  { id: '4', species: 'Heliconius charithonia',  commonName: 'Zebra Longwing',       stock: 0,   bin: 'C-15', shelf: '04', updatedAt: null },
  { id: '5', species: 'Caligo eurilochus',       commonName: 'Forest Giant Owl',     stock: 67,  bin: 'A-22', shelf: '01', updatedAt: null },
  { id: '6', species: 'Danaus plexippus',        commonName: 'Monarch Butterfly',    stock: 42,  bin: 'B-10', shelf: '03', updatedAt: null },
  { id: '7', species: 'Graphium sarpedon',       commonName: 'Common Bluebottle',    stock: 3,   bin: 'C-02', shelf: '02', updatedAt: null },
  { id: '8', species: 'Papilio palinurus',       commonName: 'Emerald Swallowtail',  stock: 84,  bin: 'B-14', shelf: '05', updatedAt: null },
];

const getStockLevel = (stock) => {
  if (stock === 0)                  return { label: 'Out of Stock', color: '#ef4444', bgColor: '#fef2f2', borderColor: '#fecaca', type: 'out'    };
  if (stock >= 1 && stock <= 19)   return { label: 'Low Stock',    color: '#f97316', bgColor: '#fff7ed', borderColor: '#ffedd5', type: 'low'    };
  if (stock >= 20 && stock <= 49)  return { label: 'Medium Stock', color: '#eab308', bgColor: '#fef9c3', borderColor: '#fef08a', type: 'medium' };
  return                                   { label: 'High Stock',  color: '#10b981', bgColor: '#ecfdf5', borderColor: '#a7f3d0', type: 'high'   };
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

export default function MobileInventoryViewer({ navigation }) {
  const [searchQuery, setSearchQuery]   = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [inventory, setInventory]       = useState(initialInventory);
  const [isLoading, setIsLoading]       = useState(false);
  const [dbStatus, setDbStatus]         = useState('checking');
  const [expandedId, setExpandedId]     = useState(null);

  // ── Load full inventory from Supabase (no limit) ──
  useEffect(() => {
    async function loadInventory() {
      if (!supabase) {
        setDbStatus('offline');
        return;
      }
      setIsLoading(true);
      try {
        // Fetch all rows — select all columns including updated_at
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

            const genusKey        = get('genus');
            const speciesKey      = get('species');
            const nameKey         = get('name');
            const stockKey        = get('quantity') || get('stock');
            const binKey          = get('bin');
            const shelfKey        = get('shelf');
            const updatedAtKey    = get('updated_at') || get('updatedat') || get('last_updated');

            const genusVal    = genusKey  ? item[genusKey]   : '';
            const speciesVal  = speciesKey ? item[speciesKey] : '';
            const nameVal     = nameKey   ? item[nameKey]    : '';

            let scientific = '';
            if (genusVal && speciesVal) scientific = `${genusVal} ${speciesVal}`;
            else if (genusVal)          scientific = genusVal;
            else if (speciesVal)        scientific = speciesVal;
            else                        scientific = nameVal || 'Unknown Specimen';

            const stockVal     = stockKey    && typeof item[stockKey] === 'number' ? item[stockKey] : 0;
            const binVal       = binKey      && item[binKey]   ? item[binKey]   : `A-${String(index + 1).padStart(2, '0')}`;
            const shelfVal     = shelfKey    && item[shelfKey] ? item[shelfKey] : `0${(index % 5) + 1}`;
            const updatedAtVal = updatedAtKey && item[updatedAtKey] ? item[updatedAtKey] : null;

            return {
              id: item.id ? String(item.id) : String(index + 1),
              species: scientific,
              commonName: nameVal || scientific,
              stock: stockVal,
              bin: binVal,
              shelf: shelfVal,
              updatedAt: updatedAtVal,
              // Keep raw data for detail view
              raw: item,
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

  const totalItems    = inventory.length;
  const lowStockCount = inventory.filter(item => item.stock < 20).length;

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        item.species.toLowerCase().includes(q) ||
        item.commonName.toLowerCase().includes(q) ||
        item.bin.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (activeFilter === 'HIGH')    return item.stock >= 50;
      if (activeFilter === 'MEDIUM')  return item.stock >= 20 && item.stock <= 49;
      if (activeFilter === 'LOW_OUT') return item.stock < 20;
      return true;
    });
  }, [inventory, searchQuery, activeFilter]);

  // ── Toggle drill-down expand ──
  const toggleExpand = (id) => {
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.8 },
    });
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Slate Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color="#f8fafc" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Warehouse Inventory</Text>
          {dbStatus === 'connected_live' && (
            <View style={[styles.statusBadgeHeader, styles.statusBadgeHeaderLive]}>
              <Text style={styles.statusBadgeHeaderText}>Live</Text>
            </View>
          )}
          {dbStatus === 'connected_empty' && (
            <View style={[styles.statusBadgeHeader, styles.statusBadgeHeaderEmpty]}>
              <Text style={styles.statusBadgeHeaderText}>Empty</Text>
            </View>
          )}
          {dbStatus === 'offline' && (
            <View style={[styles.statusBadgeHeader, styles.statusBadgeHeaderOffline]}>
              <Text style={styles.statusBadgeHeaderText}>Offline</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.filterMenuButton}>
          <SlidersHorizontal size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchFieldWrapper}>
          <Search size={18} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search species, common name or bin..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
              <X size={16} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Dashboard Summary */}
      <View style={styles.dashboardSummary}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Specimens</Text>
          <Text style={styles.summaryValue}>{totalItems}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Low / Out Alert</Text>
          <Text style={[styles.summaryValue, lowStockCount > 0 && { color: '#ef4444' }]}>
            {lowStockCount}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Source</Text>
          <Text style={[styles.summaryValue, { fontSize: 12, marginTop: 2 }]}>
            {dbStatus === 'connected_live' ? '🟢 Supabase' : dbStatus === 'offline' ? '🔴 Offline' : '⏳ Checking'}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabContainer}>
        {[
          { key: 'ALL',     label: 'All Items' },
          { key: 'HIGH',    label: 'High (50+)' },
          { key: 'MEDIUM',  label: 'Med (20–49)' },
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

      {/* Inventory List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2B3441" style={{ marginBottom: 12 }} />
          <Text style={styles.loadingText}>Fetching inventory from Supabase…</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {filteredInventory.length > 0 ? (
            filteredInventory.map((item) => {
              const level = getStockLevel(item.stock);
              const isExpanded = expandedId === item.id;
              const maxRange = 150;
              const progressPercent = Math.min((item.stock / maxRange) * 100, 100);

              let IconComponent = CheckCircle2;
              if (level.type === 'out')    IconComponent = XCircle;
              else if (level.type === 'low')    IconComponent = AlertTriangle;
              else if (level.type === 'medium') IconComponent = Info;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemCard, isExpanded && styles.itemCardExpanded]}
                  onPress={() => toggleExpand(item.id)}
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
                        <IconComponent size={12} color={level.color} style={{ marginRight: 4 }} />
                        <Text style={[styles.badgeText, { color: level.color }]}>{level.label}</Text>
                      </View>
                      {isExpanded
                        ? <ChevronUp size={14} color="#64748b" />
                        : <ChevronDown size={14} color="#94a3b8" />
                      }
                    </View>
                  </View>

                  {/* Stock Bar */}
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

                  {/* Location Row */}
                  <View style={styles.cardFooter}>
                    <View style={styles.locBadge}>
                      <Package size={12} color="#64748b" style={{ marginRight: 4 }} />
                      <Text style={styles.locText}>Bin: {item.bin}</Text>
                    </View>
                    <View style={styles.locBadge}>
                      <Info size={12} color="#64748b" style={{ marginRight: 4 }} />
                      <Text style={styles.locText}>Shelf: {item.shelf}</Text>
                    </View>
                  </View>

                  {/* ── Drill-Down Detail Panel ── */}
                  {isExpanded && (
                    <View style={styles.detailPanel}>
                      <View style={styles.detailPanelDivider} />

                      <Text style={styles.detailPanelTitle}>Specimen Details</Text>

                      <View style={styles.detailRow}>
                        <Clock size={13} color="#64748b" style={{ marginRight: 8 }} />
                        <View>
                          <Text style={styles.detailLabel}>Last Updated</Text>
                          <Text style={styles.detailValue}>
                            {formatUpdatedAt(item.updatedAt)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.detailRow}>
                        <MapPin size={13} color="#64748b" style={{ marginRight: 8 }} />
                        <View>
                          <Text style={styles.detailLabel}>Warehouse Location</Text>
                          <Text style={styles.detailValue}>Bin {item.bin} — Shelf {item.shelf}</Text>
                        </View>
                      </View>

                      <View style={styles.detailRow}>
                        <Hash size={13} color="#64748b" style={{ marginRight: 8 }} />
                        <View>
                          <Text style={styles.detailLabel}>Record ID</Text>
                          <Text style={styles.detailValue}>{item.id}</Text>
                        </View>
                      </View>

                      <View style={styles.detailRow}>
                        <Package size={13} color="#64748b" style={{ marginRight: 8 }} />
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
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Search size={36} color="#cbd5e1" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No Matching Inventory</Text>
              <Text style={styles.emptySubtitle}>Try refining your query or resetting the filter tabs.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  statusBadgeHeader: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  statusBadgeHeaderLive:    { backgroundColor: 'rgba(16,185,129,0.2)' },
  statusBadgeHeaderEmpty:   { backgroundColor: 'rgba(234,179,8,0.2)' },
  statusBadgeHeaderOffline: { backgroundColor: 'rgba(239,68,68,0.2)' },
  statusBadgeHeaderText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  filterMenuButton: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchFieldWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  clearSearchButton: { padding: 4 },

  dashboardSummary: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },

  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
  },
  activeTab: { backgroundColor: '#2B3441' },
  tabText: { fontSize: 10, fontWeight: '600', color: '#475569', textAlign: 'center' },
  activeTabText: { color: '#B8D4E8' },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  loadingText: { color: '#64748b', fontSize: 14, fontWeight: '500' },

  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },

  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  itemCardExpanded: {
    borderColor: '#B8D4E8',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleWrapper: { flex: 1, paddingRight: 8 },
  speciesText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    fontStyle: 'italic',
  },
  commonNameText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  stockLevelContainer: { marginBottom: 12 },
  stockTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stockCountText: { fontSize: 13, color: '#475569' },
  boldStock: { fontWeight: '700', color: '#0f172a' },
  thresholdText: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  progressBarBg: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  cardFooter: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  locBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  locText: { fontSize: 11, color: '#475569', fontWeight: '600' },

  // ── Drill-Down Detail Panel ──
  detailPanel: {
    marginTop: 4,
  },
  detailPanelDivider: {
    height: 1,
    backgroundColor: '#EFF6FB',
    marginVertical: 12,
  },
  detailPanelTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2B3441',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
    lineHeight: 18,
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: '#64748b', textAlign: 'center' },
});
