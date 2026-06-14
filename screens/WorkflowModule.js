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
import { useIsFocused } from '@react-navigation/native';
import { Play, CheckCircle, Clock, Plus, X, Sparkles, Package, Bell, Lock } from 'lucide-react-native';
import { fetchProductsCatalog } from '../src/supabaseClient';
import { COLORS, SHADOW_SM, SHADOW_MD } from '../theme';

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
      update: { type: 'spring', springDamping: 0.75 },
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

  // ── Check if a step's prerequisite is satisfied ──
  const isStepUnlocked = (step) => {
    if (step.id === 1) return true; // Initial QC always accessible
    const prereqStep = steps.find(s => s.id === step.id - 1);
    return prereqStep?.status === 'completed';
  };

  // ── Navigate to YOLO scan, blocking if prerequisite not complete ──
  const handleOpenScan = (step) => {
    if (!isStepUnlocked(step)) {
      const prereqStep = steps.find(s => s.id === step.id - 1);
      Alert.alert(
        '🔒 Step Locked',
        `Complete "${prereqStep?.title}" before accessing "${step.title}".\n\nOpening YOLO Scan for the required step.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Scan Prerequisite',
            onPress: () => {
              navigation && navigation.navigate('YoloScan', {
                stepId: prereqStep.id,
                stepTitle: prereqStep.title,
              });
            },
          },
        ]
      );
      return;
    }
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
    <Animated.View style={{ flex: 1, opacity: screenFadeAnim }}>
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
                {(() => {
                  const unlocked = isStepUnlocked(step);
                  return (
                    <Animated.View style={{ flex: 1, transform: [{ scale: stepScales[step.id] }] }}>
                      <TouchableOpacity
                        style={[
                          styles.stepCard,
                          step.status === 'active' && styles.stepCardActive,
                          !unlocked && styles.stepCardLocked,
                        ]}
                        onPressIn={() => unlocked && animatePressIn(step.id)}
                        onPressOut={() => unlocked && animatePressOut(step.id)}
                        onPress={() => handleOpenScan(step)}
                        activeOpacity={unlocked ? 1 : 0.6}
                      >
                        <View style={styles.stepRowMain}>
                          <View style={styles.stepInfoContainer}>
                            <Text style={[
                              styles.stepTitle,
                              step.status === 'active'  && styles.stepTitleActive,
                              step.status === 'pending' && styles.stepTitlePending,
                              !unlocked && styles.stepTitleLocked,
                            ]}>
                              {step.title}
                            </Text>
                            <Text style={styles.stepTime}>
                              {!unlocked ? 'Complete previous step first' : step.time}
                            </Text>
                          </View>

                          {/* Lock icon for blocked steps */}
                          {!unlocked ? (
                            <View style={styles.lockBadge}>
                              <Lock size={14} color="#94a3b8" />
                            </View>
                          ) : countData !== null && countData !== undefined ? (
                            <View style={styles.countBadge}>
                              <Text style={styles.countBadgeNum}>{countData.count}</Text>
                              <Text style={styles.countBadgeLabel} numberOfLines={1}>
                                {countData.specimenName
                                  ? countData.specimenName.split(' ').slice(0, 1).join('')
                                  : 'pcs'}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {step.status === 'active' && unlocked && (
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={(e) => {
                              e.stopPropagation && e.stopPropagation();
                              handleCompleteStep(step.id);
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionButtonText}>Mark Complete</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })()}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  scrollContent: {
    padding: 16,
  },
  // ── Alerts Banner — ICPI card style ──
  alertsBanner: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  alertsBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  alertsBell: {
    position: 'relative',
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.inputBg,
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
    backgroundColor: COLORS.errorRed,
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  alertsBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  alertsBannerSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  alertsTagRow: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
  },
  alertsTypeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: COLORS.inputBg,
  },
  alertsTagCritical: { backgroundColor: COLORS.errorBg },
  alertsTagWarning:  { backgroundColor: COLORS.warningBg },
  alertsTagSuccess:  { backgroundColor: COLORS.successBg },
  alertsTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // ── Header Card — ICPI white card ──
  headerCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  headerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  batchLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  batchId: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textDark,
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeActive:  { backgroundColor: COLORS.primaryMuted },
  statusBadgeSuccess: { backgroundColor: COLORS.successBg },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadgeTextActive:  { color: COLORS.primary },
  statusBadgeTextSuccess: { color: '#065F46' },
  divider: {
    height: 1,
    backgroundColor: COLORS.pageBg,
    marginBottom: 10,
  },
  detailsRow: { flexDirection: 'row', gap: 20 },
  detailItem: {},
  detailLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  speciesValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    fontStyle: 'italic',
  },
  commonNameValue: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  startNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 11,
    marginTop: 12,
  },
  startNewButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },

  // ── Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    letterSpacing: 0.2,
  },
  addBatchBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.primaryMuted,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  addBatchBtnHeaderText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 12,
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
    marginRight: 10,
    paddingTop: 18,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotCompleted: { backgroundColor: COLORS.successGreen },
  dotActive:    { backgroundColor: COLORS.primary },
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
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
    marginBottom: 4,
  },
  stepCardActive: {
    borderColor: COLORS.primaryLight,
    borderWidth: 1.5,
    backgroundColor: COLORS.primaryMuted,
  },
  stepCardLocked: {
    backgroundColor: COLORS.pageBg,
    borderColor: COLORS.borderLight,
    opacity: 0.7,
  },
  stepTitleLocked: {
    color: COLORS.textLight,
  },
  lockBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMid,
    marginBottom: 3,
  },
  stepTitleActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },
  stepTitlePending: {
    color: COLORS.textLight,
  },
  stepTime: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '500',
  },

  // ── Count Badge ──
  countBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.headerBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginLeft: 8,
    minWidth: 44,
  },
  countBadgeNum: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  countBadgeLabel: {
    color: COLORS.textLight,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  actionButton: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  actionButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.2,
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingTop: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.pageBg,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  closeButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
  },
  modalForm: {
    padding: 18,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMid,
    marginBottom: 7,
  },
  textInput: {
    backgroundColor: COLORS.pageBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  speciesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  speciesCard: {
    width: '47%',
    backgroundColor: COLORS.pageBg,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  speciesCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryMuted,
  },
  speciesCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  radioCircle: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.borderMid,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: { borderColor: COLORS.primary },
  radioInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  speciesScientific: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  speciesScientificSelected: { color: COLORS.primary },
  speciesCommon: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  supabaseNoteBox: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
  },
  supabaseNoteBoxLive:    { backgroundColor: COLORS.successBg, borderColor: COLORS.successBorder },
  supabaseNoteBoxEmpty:   { backgroundColor: COLORS.warningBg, borderColor: COLORS.warningBorder },
  supabaseNoteBoxOffline: { backgroundColor: COLORS.errorBg,   borderColor: COLORS.errorBorder },
  supabaseNoteTitle: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  supabaseNoteTitleLive:       { color: '#065F46' },
  supabaseNoteBoxEmptyTitle:   { color: '#92400E' },
  supabaseNoteBoxOfflineTitle: { color: '#991B1B' },
  supabaseNoteText: { fontSize: 11, lineHeight: 17 },
  supabaseNoteTextLive:       { color: COLORS.successGreen },
  supabaseNoteBoxEmptyText:   { color: COLORS.warningAmber },
  supabaseNoteBoxOfflineText: { color: COLORS.errorRed },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 18,
    paddingTop: 0,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  submitBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
