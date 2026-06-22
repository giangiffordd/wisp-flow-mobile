import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Plus, X, Package, ChevronRight } from 'lucide-react-native';
import { fetchOrderById, createProductionBatch, updateOrderStatus } from '../src/services/supabaseService';

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

const BATCH_STATUS_CONFIG = {
  in_progress: { label: 'IN PROGRESS', color: '#F59E0B' },
  completed:   { label: 'COMPLETED',   color: '#10B981' },
};

function StageMiniBar({ currentStage }) {
  return (
    <View style={styles.stageMiniBar}>
      {STAGES.map((_, i) => (
        <View
          key={i}
          style={[
            styles.stageSeg,
            i < currentStage && { backgroundColor: B.accent },
            i === currentStage - 1 && { backgroundColor: B.accentText },
          ]}
        />
      ))}
    </View>
  );
}

export default function OrderDetailScreen({ navigation, route }) {
  const insets  = useSafeAreaInsets();
  const orderId = route?.params?.orderId;

  const [order, setOrder]           = useState(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showModal, setShowModal]       = useState(false);
  const [batchName, setBatchName]       = useState('');
  const [batchQty, setBatchQty]         = useState('');
  const [isCreating, setIsCreating]     = useState(false);

  const loadOrder = useCallback(async () => {
    if (!orderId) { setIsLoading(false); return; }
    const data = await fetchOrderById(orderId);
    setOrder(data);
    setIsLoading(false);
  }, [orderId]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrder();
    setIsRefreshing(false);
  };

  const openCreateModal = () => {
    if (!order) return;
    const batchCount = (order.production_batches || []).length + 1;
    setBatchName(`${order.order_number}-B${String(batchCount).padStart(2, '0')}`);
    setBatchQty('');
    setShowModal(true);
  };

  const handleCreateBatch = async () => {
    const name = batchName.trim();
    const qty  = parseInt(batchQty, 10);
    if (!name)          { Alert.alert('Required', 'Batch name is required.'); return; }
    if (!qty || qty < 1) { Alert.alert('Required', 'Enter a valid quantity for this batch.'); return; }
    setIsCreating(true);
    const created = await createProductionBatch(name, order.species, orderId, qty);
    setIsCreating(false);
    if (!created) { Alert.alert('Error', 'Could not create batch. Check your connection.'); return; }
    setShowModal(false);
    await loadOrder();
  };

  const handleMarkStatus = (newStatus) => {
    Alert.alert(
      'Update Order Status',
      `Mark this order as "${STATUS_CONFIG[newStatus]?.label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            await updateOrderStatus(orderId, newStatus);
            await loadOrder();
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={18} color={B.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ORDER DETAIL</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={B.accent} />
        </View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={18} color={B.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ORDER DETAIL</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>ORDER NOT FOUND</Text>
        </View>
      </View>
    );
  }

  const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const batches = order.production_batches || [];
  const totalPlanned = batches.reduce((s, b) => s + (b.quantity_planned || 0), 0);
  const completedBatches = batches.filter(b => b.status === 'completed').length;
  const overallAvgStage = batches.length > 0
    ? Math.round(batches.reduce((s, b) => s + (b.current_stage || 1), 0) / batches.length)
    : 0;
  const date = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={18} color={B.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{order.order_number}</Text>
          <Text style={styles.headerSub}>// ORDER DETAIL</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
          <Text style={[styles.statusBadgeText, { color: sc.text }]}>{sc.label}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={B.accent} />}
      >
        {/* Order info card */}
        <View style={styles.infoCard}>
          <View style={styles.sectionDivider}>
            <Text style={styles.sectionLabel}>[ ORDER SUMMARY ]</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>SPECIES</Text>
              <Text style={styles.infoValue}>{order.species}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>QUANTITY</Text>
              <Text style={styles.infoValue}>{order.quantity}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>CLIENT</Text>
              <Text style={styles.infoValue}>{order.client_name}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>DATE</Text>
              <Text style={styles.infoValue}>{date}</Text>
            </View>
          </View>

          {order.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>[ NOTES ]</Text>
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          ) : null}

          {/* Fulfillment progress */}
          <View style={styles.fulfillmentRow}>
            <View style={styles.fulfillChip}>
              <Text style={styles.fulfillLabel}>PLANNED</Text>
              <Text style={styles.fulfillValue}>{totalPlanned} / {order.quantity}</Text>
            </View>
            <View style={styles.fulfillChip}>
              <Text style={styles.fulfillLabel}>BATCHES</Text>
              <Text style={styles.fulfillValue}>{batches.length}</Text>
            </View>
            <View style={styles.fulfillChip}>
              <Text style={styles.fulfillLabel}>DONE</Text>
              <Text style={[styles.fulfillValue, completedBatches > 0 && { color: B.success }]}>{completedBatches}</Text>
            </View>
            {overallAvgStage > 0 && (
              <View style={styles.fulfillChip}>
                <Text style={styles.fulfillLabel}>AVG STAGE</Text>
                <Text style={styles.fulfillValue}>{overallAvgStage}/12</Text>
              </View>
            )}
          </View>

          {/* Status controls */}
          {order.status !== 'completed' && order.status !== 'cancelled' && (
            <View style={styles.statusActions}>
              {order.status === 'pending' && (
                <TouchableOpacity style={styles.statusBtn} onPress={() => handleMarkStatus('in_progress')} activeOpacity={0.8}>
                  <Text style={styles.statusBtnText}>MARK IN PROGRESS</Text>
                </TouchableOpacity>
              )}
              {order.status === 'in_progress' && (
                <TouchableOpacity style={[styles.statusBtn, styles.statusBtnSuccess]} onPress={() => handleMarkStatus('completed')} activeOpacity={0.8}>
                  <Text style={[styles.statusBtnText, { color: B.bg }]}>MARK COMPLETED</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.statusBtnDanger} onPress={() => handleMarkStatus('cancelled')} activeOpacity={0.8}>
                <Text style={styles.statusBtnDangerText}>CANCEL ORDER</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Batches section */}
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionLabel}>[ PRODUCTION BATCHES · {batches.length} ]</Text>
          <View style={styles.sectionLine} />
        </View>

        {batches.length === 0 ? (
          <View style={styles.emptyBatches}>
            <Package size={28} color={B.accentDim} />
            <Text style={styles.emptyBatchesText}>No batches yet.</Text>
            <Text style={styles.emptyBatchesSub}>Create a batch to begin production.</Text>
          </View>
        ) : (
          batches.map(batch => {
            const bsc = BATCH_STATUS_CONFIG[batch.status] || BATCH_STATUS_CONFIG.in_progress;
            const stageName = STAGES[(batch.current_stage || 1) - 1] || '—';
            return (
              <View key={batch.id} style={styles.batchCard}>
                <View style={[styles.batchAccent, { backgroundColor: batch.status === 'completed' ? B.success : B.accent }]} />
                <View style={styles.batchBody}>
                  <View style={styles.batchTop}>
                    <Text style={styles.batchName}>{batch.batch_name}</Text>
                    <View style={[styles.batchStatusBadge, { borderColor: bsc.color }]}>
                      <Text style={[styles.batchStatusText, { color: bsc.color }]}>{bsc.label}</Text>
                    </View>
                  </View>

                  {batch.quantity_planned > 0 && (
                    <Text style={styles.batchQty}>{batch.quantity_planned} specimens</Text>
                  )}

                  <StageMiniBar currentStage={batch.current_stage || 1} />

                  <View style={styles.batchStageRow}>
                    <Text style={styles.batchStageNum}>STAGE {batch.current_stage || 1}/12</Text>
                    <Text style={styles.batchStageName}>{stageName}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.viewPipelineBtn}
                    onPress={() => navigation.navigate('ProcessFlowchart', { batchId: batch.id, batchName: batch.batch_name, currentStage: batch.current_stage })}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.viewPipelineBtnText}>VIEW PIPELINE</Text>
                    <ChevronRight size={12} color={B.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* Create batch button */}
        {order.status !== 'completed' && order.status !== 'cancelled' && (
          <TouchableOpacity style={styles.addBatchBtn} onPress={openCreateModal} activeOpacity={0.8}>
            <Plus size={14} color={B.bg} />
            <Text style={styles.addBatchBtnText}>CREATE BATCH</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Create batch modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>[ NEW BATCH ]</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.modalClose}>
                <X size={16} color={B.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalDivider} />
            <Text style={styles.modalContext}>Order: {order.order_number} · {order.species}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>[ BATCH NAME ]</Text>
              <TextInput
                style={styles.input}
                value={batchName}
                onChangeText={setBatchName}
                placeholderTextColor={B.accentDim}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>[ SPECIMEN QUANTITY ]</Text>
              <TextInput
                style={styles.input}
                value={batchQty}
                onChangeText={setBatchQty}
                placeholderTextColor={B.accentDim}
                placeholder="e.g. 25"
                keyboardType="number-pad"
              />
            </View>

            <TouchableOpacity
              style={[styles.createBtn, isCreating && { opacity: 0.5 }]}
              onPress={handleCreateBatch}
              disabled={isCreating}
              activeOpacity={0.85}
            >
              {isCreating
                ? <ActivityIndicator color={B.bg} />
                : <Text style={styles.createBtnText}>START BATCH</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: B.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:    { color: B.error, fontSize: 12, fontWeight: '700', letterSpacing: 2 },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', backgroundColor: B.bgEl, borderBottomWidth: 1, borderBottomColor: B.border, paddingHorizontal: 12, paddingVertical: 11, gap: 10 },
  backBtn:      { backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border, borderRadius: 0, padding: 6 },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 13, fontWeight: '800', color: B.textPri, letterSpacing: 2, textTransform: 'uppercase' },
  headerSub:    { fontSize: 9, color: B.accentDim, fontWeight: '600', letterSpacing: 1.5, marginTop: 1 },
  statusBadge:  { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 0, borderWidth: 1 },
  statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },

  // Scroll
  scrollContent: { padding: 14, paddingBottom: 40 },

  // Info card
  infoCard:     { backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border, borderRadius: 0, padding: 14, marginBottom: 16 },
  infoGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  infoItem:     { minWidth: '40%' },
  infoLabel:    { fontSize: 8, color: B.accentDim, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  infoValue:    { fontSize: 13, fontWeight: '600', color: B.textPri },

  notesBox:     { backgroundColor: B.bg, borderWidth: 1, borderColor: B.border, borderRadius: 0, padding: 10, marginBottom: 12 },
  notesLabel:   { fontSize: 8, color: B.accentDim, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  notesText:    { fontSize: 12, color: B.textMuted, lineHeight: 18 },

  fulfillmentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  fulfillChip:    { backgroundColor: B.bgEl, borderWidth: 1, borderColor: B.border, borderRadius: 0, paddingVertical: 5, paddingHorizontal: 10 },
  fulfillLabel:   { fontSize: 8, color: B.accentDim, fontWeight: '700', letterSpacing: 1.5 },
  fulfillValue:   { fontSize: 13, fontWeight: '700', color: B.textPri, marginTop: 1 },

  statusActions:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusBtn:           { flex: 1, backgroundColor: 'rgba(143,164,184,0.12)', borderWidth: 1, borderColor: B.accent, borderRadius: 0, paddingVertical: 10, alignItems: 'center' },
  statusBtnSuccess:    { backgroundColor: B.success, borderColor: B.success },
  statusBtnText:       { fontSize: 10, fontWeight: '800', color: B.accent, letterSpacing: 2 },
  statusBtnDanger:     { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: B.error, borderRadius: 0, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  statusBtnDangerText: { fontSize: 10, fontWeight: '800', color: B.error, letterSpacing: 2 },

  // Section divider
  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionLabel:   { fontSize: 9, color: B.accent, fontWeight: '700', letterSpacing: 2.5 },
  sectionLine:    { flex: 1, height: 1, backgroundColor: B.border },

  // Batch cards
  batchCard:   { flexDirection: 'row', backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border, borderRadius: 0, marginBottom: 10 },
  batchAccent: { width: 4 },
  batchBody:   { flex: 1, padding: 12 },
  batchTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  batchName:   { fontSize: 13, fontWeight: '700', color: B.accentText },
  batchStatusBadge:  { borderWidth: 1, borderRadius: 0, paddingHorizontal: 6, paddingVertical: 3 },
  batchStatusText:   { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  batchQty:          { fontSize: 11, color: B.textMuted, marginBottom: 8 },

  stageMiniBar: { flexDirection: 'row', gap: 2, marginBottom: 5 },
  stageSeg:     { flex: 1, height: 4, backgroundColor: B.border, borderRadius: 0 },

  batchStageRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  batchStageNum:  { fontSize: 9, color: B.accentDim, fontWeight: '700', letterSpacing: 1.5 },
  batchStageName: { fontSize: 9, color: B.accent, fontWeight: '600', letterSpacing: 1 },

  viewPipelineBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: B.border, paddingTop: 8 },
  viewPipelineBtnText: { fontSize: 10, fontWeight: '700', color: B.accent, letterSpacing: 2 },

  emptyBatches:     { alignItems: 'center', paddingVertical: 32, gap: 6, marginBottom: 16 },
  emptyBatchesText: { fontSize: 13, fontWeight: '700', color: B.textMuted, letterSpacing: 1 },
  emptyBatchesSub:  { fontSize: 11, color: B.textMuted },

  addBatchBtn:     { flexDirection: 'row', backgroundColor: B.accent, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 0, gap: 8, marginTop: 4 },
  addBatchBtnText: { color: B.bg, fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: B.bgEl, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: B.border, borderRadius: 0, padding: 20, paddingBottom: 36 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 12, fontWeight: '800', color: B.accent, letterSpacing: 2.5 },
  modalClose:   { backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border, padding: 6, borderRadius: 0 },
  modalDivider: { height: 1, backgroundColor: B.border, marginBottom: 12 },
  modalContext: { fontSize: 11, color: B.textMuted, marginBottom: 14, letterSpacing: 0.5 },
  fieldGroup:   { marginBottom: 14 },
  fieldLabel:   { fontSize: 9, fontWeight: '700', color: B.accentDim, letterSpacing: 2.5, marginBottom: 6 },
  input:        { backgroundColor: B.bg, borderWidth: 1, borderColor: B.border, borderRadius: 0, color: B.textPri, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  createBtn:    { backgroundColor: B.accent, paddingVertical: 15, alignItems: 'center', borderRadius: 0, marginTop: 4 },
  createBtnText: { color: B.bg, fontWeight: '800', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },
});
