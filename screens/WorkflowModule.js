import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Play, CheckCircle, Clock, Plus, X, Sparkles, Package, Bell, AlertCircle } from 'lucide-react-native';
import { fetchProductsCatalog } from '../src/supabaseClient';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALERTS_PREVIEW = [
  { id: '1', title: 'Specimen Flagged in QC', type: 'critical' },
  { id: '2', title: 'Log Rejected by Manager', type: 'warning' },
  { id: '3', title: 'Inventory Synced', type: 'success' },
];

const PRESET_PRODUCTS = [
  { species: 'Danaus plexippus', commonName: 'Monarch Butterfly' },
  { species: 'Morpho peleides', commonName: 'Blue Morpho' },
  { species: 'Heliconius charithonia', commonName: 'Zebra Longwing' },
  { species: 'Graphium sarpedon', commonName: 'Common Bluebottle' },
  { species: 'Papilio palinurus', commonName: 'Emerald Swallowtail' },
  { species: 'Actias selene', commonName: 'Indian Moon Moth' },
  { species: 'Attacus atlas', commonName: 'Atlas Moth' },
  { species: 'Caligo eurilochus', commonName: 'Forest Giant Owl' }
];

// Initial step definitions — always starts at Initial QC
const INITIAL_STEPS = () => ([
  { id: 1, title: 'Initial Quality Control', status: 'active',  time: 'In Progress' },
  { id: 2, title: 'Final Quality Control',   status: 'pending', time: '--:--' },
  { id: 3, title: 'Packaging',               status: 'pending', time: '--:--' },
]);

export default function WorkflowModule({ navigation, route }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [products, setProducts] = useState(PRESET_PRODUCTS);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [dbStatus, setDbStatus] = useState('checking');

  const [activeBatch, setActiveBatch] = useState({
    id: '#BT-9921',
    species: 'Morpho peleides',
    commonName: 'Blue Morpho',
    status: 'In Progress'
  });

  // Always start at Initial QC
  const [steps, setSteps] = useState(INITIAL_STEPS());

  // Per-step specimen counts received from YoloScan
  // { stepId: { count: number, specimenName: string } | null }
  const [stepCounts, setStepCounts] = useState({ 1: null, 2: null, 3: null });

  // Animated values for each step card press
  const stepScales = useRef({
    1: new Animated.Value(1),
    2: new Animated.Value(1),
    3: new Animated.Value(1),
  }).current;

  // ── Receive scan results navigated back from YoloScan ──
  useEffect(() => {
    const scanResult = route?.params?.scanResult;
    if (scanResult) {
      const { stepId, count, specimenName } = scanResult;
      setStepCounts(prev => ({ ...prev, [stepId]: { count, specimenName } }));
      // Clear param so it doesn't fire again on re-focus
      navigation.setParams({ scanResult: undefined });
    }
  }, [route?.params?.scanResult]);

  // ── Load products on mount ──
  useEffect(() => {
    async function loadProducts() {
      setIsLoadingProducts(true);
      try {
        const catalog = await fetchProductsCatalog();
        if (catalog && catalog.length > 0) {
          setProducts(catalog);
          setDbStatus('connected_live');
        } else if (catalog && catalog.length === 0) {
          setDbStatus('connected_empty');
        } else {
          setDbStatus('offline');
        }
      } catch (err) {
        console.error('Error fetching Supabase products:', err);
        setDbStatus('offline');
      } finally {
        setIsLoadingProducts(false);
      }
    }
    loadProducts();
  }, []);

  // ── Press animation for step cards ──
  const animatePressIn = (stepId) => {
    Animated.spring(stepScales[stepId], {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const animatePressOut = (stepId) => {
    Animated.spring(stepScales[stepId], {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  };

  // ── Open new batch modal ──
  const handleOpenModal = () => {
    const randomId = `#BT-${Math.floor(1000 + Math.random() * 9000)}`;
    setBatchId(randomId);
    setSelectedProduct(products[0] || PRESET_PRODUCTS[0]);
    setModalVisible(true);
  };

  // ── Create a new batch, reset to Initial QC ──
  const handleCreateBatch = () => {
    if (!batchId.trim()) {
      Alert.alert('Missing Info', 'Please enter a Batch ID.');
      return;
    }
    if (!selectedProduct) {
      Alert.alert('Missing Info', 'Please select a butterfly species.');
      return;
    }

    LayoutAnimation.configureNext({
      duration: 350,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.7 },
    });

    setActiveBatch({
      id: batchId.trim(),
      species: selectedProduct.species,
      commonName: selectedProduct.commonName,
      status: 'In Progress'
    });

    // Always reset to Initial QC first
    setSteps(INITIAL_STEPS());
    setStepCounts({ 1: null, 2: null, 3: null });
    setModalVisible(false);
  };

  // ── Complete a step with smooth layout animation ──
  const handleCompleteStep = (stepId) => {
    const now = new Date();
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    LayoutAnimation.configureNext({
      duration: 400,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.75 },
    });

    const updatedSteps = steps.map((step, index) => {
      if (step.id === stepId) {
        return { ...step, status: 'completed', time: formattedTime };
      }
      const prevStep = steps[index - 1];
      if (prevStep && prevStep.id === stepId) {
        return { ...step, status: 'active', time: 'In Progress' };
      }
      return step;
    });

    setSteps(updatedSteps);

    const wasLastStep = steps[steps.length - 1].id === stepId;
    if (wasLastStep) {
      setActiveBatch(prev => ({ ...prev, status: 'Completed' }));
      Alert.alert('Batch Completed', `Batch ${activeBatch.id} has been fully packaged and completed!`);
    }
  };

  // ── Navigate to YOLO scan for a step (small delay so press animation shows) ──
  const handleOpenScan = (step) => {
    animatePressIn(step.id);
    setTimeout(() => {
      animatePressOut(step.id);
      setTimeout(() => {
        navigation && navigation.navigate('YoloScan', {
          stepId: step.id,
          stepTitle: step.title,
        });
      }, 180);
    }, 80);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── Alerts Greeting Banner ── */}
        <TouchableOpacity
          style={styles.alertsBanner}
          onPress={() => navigation && navigation.navigate('StaffAlertsNotifications')}
          activeOpacity={0.8}
        >
          <View style={styles.alertsBannerLeft}>
            <View style={styles.alertsBell}>
              <Bell size={18} color="#2B3441" />
              <View style={styles.alertsBadgeDot} />
            </View>
            <View>
              <Text style={styles.alertsBannerTitle}>Alerts</Text>
              <Text style={styles.alertsBannerSub}>{ALERTS_PREVIEW.length} notifications pending</Text>
            </View>
          </View>
          <View style={styles.alertsTagRow}>
            {ALERTS_PREVIEW.slice(0, 2).map(a => (
              <View
                key={a.id}
                style={[
                  styles.alertsTypeTag,
                  a.type === 'critical' && styles.alertsTagCritical,
                  a.type === 'warning'  && styles.alertsTagWarning,
                  a.type === 'success'  && styles.alertsTagSuccess,
                ]}
              >
                <Text style={[
                  styles.alertsTagText,
                  a.type === 'critical' && { color: '#D94F4F' },
                  a.type === 'warning'  && { color: '#B45309' },
                  a.type === 'success'  && { color: '#065f46' },
                ]} numberOfLines={1}>{a.title}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Active Batch Summary Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerInfo}>
            <View>
              <Text style={styles.batchLabel}>
                {activeBatch.status === 'Completed' ? 'Last Completed Batch' : 'Active Batch'}
              </Text>
              <Text style={styles.batchId}>{activeBatch.id}</Text>
            </View>
            <View style={[
              styles.statusBadge,
              activeBatch.status === 'Completed' ? styles.statusBadgeSuccess : styles.statusBadgeActive
            ]}>
              <Text style={[
                styles.statusBadgeText,
                activeBatch.status === 'Completed' ? styles.statusBadgeTextSuccess : styles.statusBadgeTextActive
              ]}>
                {activeBatch.status}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Species</Text>
              <Text style={styles.speciesValue}>{activeBatch.species}</Text>
              <Text style={styles.commonNameValue}>{activeBatch.commonName}</Text>
            </View>
          </View>

          {activeBatch.status === 'Completed' && (
            <TouchableOpacity style={styles.startNewButton} onPress={handleOpenModal}>
              <Plus size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.startNewButtonText}>Start New Batch</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Steps Timeline Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workflow Progress</Text>
          {activeBatch.status !== 'Completed' && (
            <TouchableOpacity style={styles.addBatchBtnHeader} onPress={handleOpenModal}>
              <Plus size={16} color="#3b82f6" style={{ marginRight: 4 }} />
              <Text style={styles.addBatchBtnHeaderText}>New Batch</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Steps Timeline */}
        <View style={styles.timeline}>
          {steps.map((step, index) => {
            const countData = stepCounts[step.id];
            return (
              <View key={step.id} style={styles.stepContainer}>
                {/* Dot + line */}
                <View style={styles.stepIndicator}>
                  <View style={[
                    styles.dot,
                    step.status === 'completed' && styles.dotCompleted,
                    step.status === 'active'    && styles.dotActive,
                  ]}>
                    {step.status === 'completed' ? (
                      <CheckCircle size={12} color="#ffffff" />
                    ) : step.status === 'active' ? (
                      <Play size={10} color="#ffffff" style={{ marginLeft: 2 }} />
                    ) : (
                      <Clock size={12} color="#94a3b8" />
                    )}
                  </View>
                  {index < steps.length - 1 && (
                    <View style={[
                      styles.line,
                      step.status === 'completed' && styles.lineCompleted
                    ]} />
                  )}
                </View>

                {/* Step Card — animated press */}
                <Animated.View style={{ flex: 1, transform: [{ scale: stepScales[step.id] }] }}>
                  <TouchableOpacity
                    style={[
                      styles.stepCard,
                      step.status === 'active' && styles.stepCardActive,
                    ]}
                    onPressIn={() => animatePressIn(step.id)}
                    onPressOut={() => animatePressOut(step.id)}
                    onPress={() => handleOpenScan(step)}
                    activeOpacity={1}
                  >
                    <View style={styles.stepRowMain}>
                      <View style={styles.stepInfoContainer}>
                        <Text style={[
                          styles.stepTitle,
                          step.status === 'active'  && styles.stepTitleActive,
                          step.status === 'pending' && styles.stepTitlePending,
                        ]}>
                          {step.title}
                        </Text>
                        <Text style={styles.stepTime}>{step.time}</Text>
                      </View>

                      {/* Count badge on the right */}
                      {countData !== null && countData !== undefined && (
                        <View style={styles.countBadge}>
                          <Text style={styles.countBadgeNum}>{countData.count}</Text>
                          <Text style={styles.countBadgeLabel} numberOfLines={1}>
                            {countData.specimenName
                              ? countData.specimenName.split(' ').slice(0, 1).join('')
                              : 'pcs'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {step.status === 'active' && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation && e.stopPropagation();
                          handleCompleteStep(step.id);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionButtonText}>Complete</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Creation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} color="#3b82f6" />
                <Text style={styles.modalTitle}>Create New Batch</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} keyboardShouldPersistTaps="handled">
              
              {/* Batch ID Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Batch ID</Text>
                <TextInput
                  style={styles.textInput}
                  value={batchId}
                  onChangeText={setBatchId}
                  placeholder="e.g. #BT-1029"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              {/* Species Selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Select Product Species</Text>
                <View style={styles.speciesGrid}>
                  {products.map((prod) => {
                    const isSelected = selectedProduct?.species === prod.species;
                    return (
                      <TouchableOpacity
                        key={prod.species}
                        style={[
                          styles.speciesCard,
                          isSelected && styles.speciesCardSelected
                        ]}
                        onPress={() => setSelectedProduct(prod)}
                      >
                        <View style={styles.speciesCardHeader}>
                          <Package size={14} color={isSelected ? '#3b82f6' : '#64748b'} />
                          <View style={[
                            styles.radioCircle,
                            isSelected && styles.radioCircleSelected
                          ]}>
                            {isSelected && <View style={styles.radioInner} />}
                          </View>
                        </View>
                        <Text style={[
                          styles.speciesScientific,
                          isSelected && styles.speciesScientificSelected
                        ]}>
                          {prod.species}
                        </Text>
                        <Text style={styles.speciesCommon}>
                          {prod.commonName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Supabase Connection Status Notice */}
              {dbStatus === 'connected_live' && (
                <View style={[styles.supabaseNoteBox, styles.supabaseNoteBoxLive]}>
                  <Text style={[styles.supabaseNoteTitle, styles.supabaseNoteTitleLive]}>✓ Supabase Connected</Text>
                  <Text style={[styles.supabaseNoteText, styles.supabaseNoteTextLive]}>
                    Synchronized with live database catalog! Loaded {products.length} products.
                  </Text>
                </View>
              )}
              {dbStatus === 'connected_empty' && (
                <View style={[styles.supabaseNoteBox, styles.supabaseNoteBoxEmpty]}>
                  <Text style={[styles.supabaseNoteTitle, styles.supabaseNoteBoxEmptyTitle]}>⚠ Supabase Connected (Empty)</Text>
                  <Text style={[styles.supabaseNoteText, styles.supabaseNoteBoxEmptyText]}>
                    Connected successfully, but the 'inventory' table is empty. Using offline presets.
                  </Text>
                </View>
              )}
              {(dbStatus === 'offline' || dbStatus === 'checking') && (
                <View style={[styles.supabaseNoteBox, styles.supabaseNoteBoxOffline]}>
                  <Text style={[styles.supabaseNoteTitle, styles.supabaseNoteBoxOfflineTitle]}>✗ Supabase Offline</Text>
                  <Text style={[styles.supabaseNoteText, styles.supabaseNoteBoxOfflineText]}>
                    Using offline preset products as fallback. Configure your API credentials in src/supabaseClient.js to enable sync.
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.submitBtn} 
                onPress={handleCreateBatch}
              >
                <Text style={styles.submitBtnText}>Start Workflow</Text>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FB',
  },
  scrollContent: {
    padding: 16,
  },
  // ── Alerts Banner ──
  alertsBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DDE8F0',
    shadowColor: '#2B3441',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  alertsBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  alertsBell: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EFF6FB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertsBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#D94F4F',
    borderWidth: 1,
    borderColor: '#fff',
  },
  alertsBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B3441',
  },
  alertsBannerSub: {
    fontSize: 12,
    color: '#6B7C93',
    marginTop: 1,
  },
  alertsTagRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  alertsTypeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  alertsTagCritical: { backgroundColor: 'rgba(217,79,79,0.08)' },
  alertsTagWarning:  { backgroundColor: 'rgba(180,83,9,0.08)'  },
  alertsTagSuccess:  { backgroundColor: 'rgba(6,95,70,0.08)'   },
  alertsTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },

  // ── Header Card ──
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#2B3441',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#DDE8F0',
  },
  headerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  batchLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  batchId: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2B3441',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  statusBadgeActive: { backgroundColor: '#dbeafe' },
  statusBadgeSuccess: { backgroundColor: '#dcfce7' },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBadgeTextActive: { color: '#1d4ed8' },
  statusBadgeTextSuccess: { color: '#166534' },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginBottom: 12,
  },
  detailsRow: { flexDirection: 'row', gap: 24 },
  detailItem: {},
  detailLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  speciesValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B3441',
    fontStyle: 'italic',
  },
  commonNameValue: {
    fontSize: 12,
    color: '#6B7C93',
    fontWeight: '500',
    marginTop: 2,
  },
  startNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B3441',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  startNewButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B3441',
    letterSpacing: 0.3,
  },
  addBatchBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EFF6FB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDE8F0',
  },
  addBatchBtnHeaderText: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 13,
  },

  // ── Timeline ──
  timeline: {
    gap: 4,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  stepIndicator: {
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 18,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotCompleted: { backgroundColor: '#10b981' },
  dotActive:    { backgroundColor: '#2B3441' },
  line: {
    width: 2,
    flex: 1,
    minHeight: 32,
    backgroundColor: '#e2e8f0',
    marginTop: 4,
    borderRadius: 1,
  },
  lineCompleted: { backgroundColor: '#10b981' },

  // ── Step Card ──
  stepCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#2B3441',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 4,
  },
  stepCardActive: {
    borderColor: '#B8D4E8',
    borderWidth: 1.5,
    backgroundColor: '#F7FBFF',
  },
  stepRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepInfoContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 3,
  },
  stepTitleActive: {
    color: '#2B3441',
    fontWeight: '700',
  },
  stepTitlePending: {
    color: '#94a3b8',
  },
  stepTime: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // ── Count Badge ──
  countBadge: {
    alignItems: 'center',
    backgroundColor: '#2B3441',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
    minWidth: 48,
  },
  countBadgeNum: {
    color: '#B8D4E8',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  countBadgeLabel: {
    color: '#6B7C93',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  actionButton: {
    marginTop: 12,
    backgroundColor: '#2B3441',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#B8D4E8',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
  },
  closeButton: {
    padding: 4,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  modalForm: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2B3441',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  speciesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  speciesCard: {
    width: '47%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  speciesCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  speciesCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: { borderColor: '#3b82f6' },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  speciesScientific: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  speciesScientificSelected: { color: '#1d4ed8' },
  speciesCommon: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  supabaseNoteBox: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  supabaseNoteBoxLive: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  supabaseNoteBoxEmpty: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  supabaseNoteBoxOffline: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  supabaseNoteTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  supabaseNoteTitleLive: { color: '#166534' },
  supabaseNoteBoxEmptyTitle: { color: '#92400e' },
  supabaseNoteBoxOfflineTitle: { color: '#991b1b' },
  supabaseNoteText: { fontSize: 12, lineHeight: 18 },
  supabaseNoteTextLive: { color: '#15803d' },
  supabaseNoteBoxEmptyText: { color: '#b45309' },
  supabaseNoteBoxOfflineText: { color: '#b91c1c' },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingTop: 0,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 15,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#2B3441',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#B8D4E8',
    fontWeight: '700',
    fontSize: 15,
  },
});
