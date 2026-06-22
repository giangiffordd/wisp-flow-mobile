import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Plus, ShoppingBag, ChevronRight, X } from 'lucide-react-native';
import { fetchOrders, createOrder } from '../src/services/supabaseService';

const B = {
  bg: '#F5F5F7', bgEl: '#FFFFFF', bgCard: '#FFFFFF',
  border: '#E5E7EB', borderActive: '#5B21D9',
  accent: '#5B21D9', accentDim: '#7C3AED', accentText: '#FFFFFF',
  textPri: '#111827', textMuted: '#6B7280',
  error: '#EF4444', success: '#10B981', warning: '#F59E0B',
};

const STAGES = [
  'Deep Freezing', 'Initial Drying', 'Pinning & Setting', 'Secondary Drying',
  'Unpinning', 'Board Mounting', 'Curing', 'Framing',
  'Initial QC', 'Finishing', 'Final QC', 'Packaging & Barcoding',
];

const STATUS_CONFIG = {
  pending:     { label: 'PENDING',     bg: 'rgba(143,164,184,0.12)', border: '#5B21D9', text: '#5B21D9' },
  in_progress: { label: 'IN PROGRESS', bg: 'rgba(245,158,11,0.12)',  border: '#F59E0B', text: '#F59E0B' },
  completed:   { label: 'COMPLETED',   bg: 'rgba(16,185,129,0.12)',  border: '#10B981', text: '#10B981' },
  cancelled:   { label: 'CANCELLED',   bg: 'rgba(239,68,68,0.12)',   border: '#EF4444', text: '#EF4444' },
};

const FILTERS = ['ALL', 'PENDING', 'IN PROGRESS', 'COMPLETED'];

function deriveOrderProgress(order) {
  const batches = order.production_batches || [];
  if (batches.length === 0) return { avgStage: 0, batchCount: 0, completedBatches: 0 };
  const avgStage = Math.round(batches.reduce((sum, b) => sum + (b.current_stage || 1), 0) / batches.length);
  const completedBatches = batches.filter(b => b.status === 'completed').length;
  return { avgStage, batchCount: batches.length, completedBatches };
}

function generateOrderNumber() {
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `BB-${yy}-${mm}${seq}`;
}

export default function ManagerOrdersDashboard({ navigation }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [orders, setOrders]         = useState([]);
  const [filter, setFilter]         = useState('ALL');
  const [isLoading, setIsLoading]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showModal, setShowModal]       = useState(false);
  const [orderNum, setOrderNum]         = useState('');
  const [species, setSpecies]           = useState('');
  const [quantity, setQuantity]         = useState('');
  const [notes, setNotes]               = useState('');
  const [isCreating, setIsCreating]     = useState(false);

  const loadOrders = useCallback(async () => {
    const data = await fetchOrders();
    setOrders(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    loadOrders();
  }, [isFocused, loadOrders]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders();
    setIsRefreshing(false);
  };

  const openCreateModal = () => {
    setOrderNum(generateOrderNumber());
    setSpecies('');
    setQuantity('');
    setNotes('');
    setShowModal(true);
  };

  const handleCreateOrder = async () => {
    const trimNum     = orderNum.trim();
    const trimSpecies = species.trim();
    const qty         = parseInt(quantity, 10);
    if (!trimNum)              { Alert.alert('Required', 'Order number is required.'); return; }
    if (!trimSpecies)          { Alert.alert('Required', 'Species is required.'); return; }
    if (!qty || qty < 1)       { Alert.alert('Required', 'Enter a valid quantity.'); return; }
    setIsCreating(true);
    const created = await createOrder({ orderNumber: trimNum, species: trimSpecies, quantity: qty, notes: notes.trim() || null });
    setIsCreating(false);
    if (!created) { Alert.alert('Error', 'Could not create order. Check your connection.'); return; }
    setShowModal(false);
    await loadOrders();
  };

  const filtered = orders.filter(o => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING') return o.status === 'pending';
    if (filter === 'IN PROGRESS') return o.status === 'in_progress';
    if (filter === 'COMPLETED') return o.status === 'completed';
    return true;
  });

  const renderOrder = ({ item }) => {
    const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const { avgStage, batchCount, completedBatches } = deriveOrderProgress(item);
    const stageName = avgStage > 0 ? STAGES[avgStage - 1] : '—';
    const date = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
        activeOpacity={0.75}
      >
        <View style={[styles.orderCardAccent, { backgroundColor: sc.border }]} />
        <View style={styles.orderCardBody}>
          <View style={styles.orderCardTop}>
            <Text style={styles.orderNumber}>{item.order_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
              <Text style={[styles.statusBadgeText, { color: sc.text }]}>{sc.label}</Text>
            </View>
          </View>

          <Text style={styles.orderSpecies}>{item.species}</Text>
          <Text style={styles.orderClient}>{item.client_name}</Text>

          <View style={styles.orderMeta}>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>QTY</Text>
              <Text style={styles.metaValue}>{item.quantity}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>BATCHES</Text>
              <Text style={styles.metaValue}>{batchCount}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>AVG STAGE</Text>
              <Text style={styles.metaValue}>{avgStage > 0 ? `${avgStage}/12` : '—'}</Text>
            </View>
            {completedBatches > 0 && (
              <View style={styles.metaChip}>
                <Text style={styles.metaLabel}>DONE</Text>
                <Text style={[styles.metaValue, { color: B.success }]}>{completedBatches}</Text>
              </View>
            )}
          </View>

          {avgStage > 0 && (
            <View style={styles.stageRow}>
              <View style={styles.stageMiniBar}>
                {STAGES.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.stageSeg,
                      i < avgStage && { backgroundColor: B.accent },
                      i === avgStage - 1 && { backgroundColor: B.accentText },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.stageLabel}>{stageName}</Text>
            </View>
          )}

          <View style={styles.orderFooter}>
            <Text style={styles.orderDate}>{date}</Text>
            <ChevronRight size={13} color={B.accentDim} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ShoppingBag size={16} color={B.accent} />
          <View>
            <Text style={styles.headerTitle}>ORDERS</Text>
            <Text style={styles.headerSub}>// B&B FULFILLMENT TRACKING</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={openCreateModal} activeOpacity={0.8}>
          <Plus size={14} color={B.bg} />
          <Text style={styles.newBtnText}>NEW</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.tab, filter === f && styles.tabActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={B.accent} />
          <Text style={styles.loadingText}>[ LOADING ORDERS ]</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={B.accent} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ShoppingBag size={36} color={B.accentDim} />
              <Text style={styles.emptyTitle}>NO ORDERS</Text>
              <Text style={styles.emptySub}>
                {filter === 'ALL' ? 'Create a new order to start tracking fulfillment.' : `No ${filter.toLowerCase()} orders.`}
              </Text>
              {filter === 'ALL' && (
                <TouchableOpacity style={styles.emptyBtn} onPress={openCreateModal} activeOpacity={0.8}>
                  <Text style={styles.emptyBtnText}>+ CREATE ORDER</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Create order modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>[ NEW ORDER ]</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.modalClose}>
                <X size={16} color={B.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>[ ORDER NUMBER ]</Text>
              <TextInput
                style={styles.input}
                value={orderNum}
                onChangeText={setOrderNum}
                placeholderTextColor={B.accentDim}
                placeholder="BB-2025-001"
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>[ SPECIES ]</Text>
              <TextInput
                style={styles.input}
                value={species}
                onChangeText={setSpecies}
                placeholderTextColor={B.accentDim}
                placeholder="e.g. papilio_blumei"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>[ QUANTITY ]</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                placeholderTextColor={B.accentDim}
                placeholder="50"
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>[ NOTES (OPTIONAL) ]</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={notes}
                onChangeText={setNotes}
                placeholderTextColor={B.accentDim}
                placeholder="Any special requirements..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.createBtn, isCreating && { opacity: 0.5 }]}
              onPress={handleCreateOrder}
              disabled={isCreating}
              activeOpacity={0.85}
            >
              {isCreating
                ? <ActivityIndicator color={B.bg} />
                : <Text style={styles.createBtnText}>CREATE ORDER</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: B.bg },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: B.bgEl, borderBottomWidth: 1, borderBottomColor: B.border, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 14, fontWeight: '800', color: B.textPri, letterSpacing: 2, textTransform: 'uppercase' },
  headerSub:   { fontSize: 9, color: B.accentDim, fontWeight: '600', letterSpacing: 1.5, marginTop: 1 },
  newBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: B.accent, paddingVertical: 8, paddingHorizontal: 12, gap: 5, borderRadius: 0 },
  newBtnText:  { color: B.bg, fontWeight: '800', fontSize: 11, letterSpacing: 2 },

  // Tabs
  tabs:        { flexDirection: 'row', backgroundColor: B.bgEl, borderBottomWidth: 1, borderBottomColor: B.border, paddingHorizontal: 12, gap: 6, paddingVertical: 8 },
  tab:         { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 0, borderWidth: 1, borderColor: B.border, backgroundColor: B.bg },
  tabActive:   { backgroundColor: B.accent, borderColor: B.accent },
  tabText:     { fontSize: 9, fontWeight: '700', color: B.textMuted, letterSpacing: 1.5 },
  tabTextActive: { color: B.bg },

  // List
  listContent: { padding: 14, gap: 10, paddingBottom: 32 },

  // Order card
  orderCard:       { flexDirection: 'row', backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border, borderRadius: 0 },
  orderCardAccent: { width: 4 },
  orderCardBody:   { flex: 1, padding: 14 },
  orderCardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderNumber:     { fontSize: 13, fontWeight: '800', color: B.accentText, letterSpacing: 1 },
  statusBadge:     { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 0, borderWidth: 1 },
  statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  orderSpecies:    { fontSize: 13, fontWeight: '600', color: B.textPri, marginBottom: 2 },
  orderClient:     { fontSize: 11, color: B.textMuted, marginBottom: 10 },

  // Meta chips
  orderMeta:  { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  metaChip:   { backgroundColor: B.bgEl, borderWidth: 1, borderColor: B.border, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 0 },
  metaLabel:  { fontSize: 8, color: B.accentDim, fontWeight: '700', letterSpacing: 1.5 },
  metaValue:  { fontSize: 12, fontWeight: '700', color: B.textPri, marginTop: 1 },

  // Stage bar
  stageRow:   { marginBottom: 10 },
  stageMiniBar: { flexDirection: 'row', gap: 2, marginBottom: 4 },
  stageSeg:   { flex: 1, height: 3, backgroundColor: B.border, borderRadius: 0 },
  stageLabel: { fontSize: 9, color: B.accentDim, fontWeight: '600', letterSpacing: 1 },

  // Footer
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: B.border, paddingTop: 8, marginTop: 2 },
  orderDate:   { fontSize: 10, color: B.textMuted, letterSpacing: 0.5 },

  // States
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 10, color: B.accentDim, letterSpacing: 2, fontWeight: '700' },
  emptyState:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle:  { fontSize: 13, fontWeight: '800', color: B.textMuted, letterSpacing: 3 },
  emptySub:    { fontSize: 12, color: B.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
  emptyBtn:    { marginTop: 8, backgroundColor: B.accent, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 0 },
  emptyBtnText: { color: B.bg, fontWeight: '800', fontSize: 12, letterSpacing: 3 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: B.bgEl, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: B.border, borderRadius: 0, padding: 20, paddingBottom: 36 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 12, fontWeight: '800', color: B.accent, letterSpacing: 2.5 },
  modalClose:   { backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border, padding: 6, borderRadius: 0 },
  modalDivider: { height: 1, backgroundColor: B.border, marginBottom: 16 },
  fieldGroup:   { marginBottom: 14 },
  fieldLabel:   { fontSize: 9, fontWeight: '700', color: B.accentDim, letterSpacing: 2.5, marginBottom: 6 },
  input:        { backgroundColor: B.bg, borderWidth: 1, borderColor: B.border, borderRadius: 0, color: B.textPri, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  inputMulti:   { height: 80, paddingTop: 10 },
  createBtn:    { backgroundColor: B.accent, paddingVertical: 15, alignItems: 'center', borderRadius: 0, marginTop: 4 },
  createBtnText: { color: B.bg, fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },
});
