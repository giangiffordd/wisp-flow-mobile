import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Play,
  Circle,
  ThermometerSnowflake,
  Filter,
  Flame,
  Scale,
  Sparkles,
  Eye,
  Archive,
  RefreshCw,
  Sun,
  ShieldCheck,
  Tag,
  Package,
  RotateCcw
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const pipelineStages = [
  { id: 1,  title: 'Stage 1: Deep Freezing',       instruction: 'Keep specimens in Chamber A at -20°C for exactly 48 hours to induce metabolic dormancy.',                              status: 'completed', icon: ThermometerSnowflake },
  { id: 2,  title: 'Stage 2: Sorting & Grading',    instruction: 'Classify materials by density and color profiles. Reject items with size variance > 5%.',                              status: 'completed', icon: Filter },
  { id: 3,  title: 'Stage 3: Thermal Treatment',    instruction: 'Perform rapid thermal cycling from 15°C to 45°C to strengthen structural outer membranes.',                            status: 'active',    icon: Flame },
  { id: 4,  title: 'Stage 4: Mass Measurement',     instruction: 'Log batch weight using high-precision scales. Calibrate scale to 0.00g before logging.',                               status: 'pending',   icon: Scale },
  { id: 5,  title: 'Stage 5: Ultrasonic Wash',      instruction: 'Submerge batch in purified saline solution with 40kHz sonic transducers for 120 seconds.',                            status: 'pending',   icon: Sparkles },
  { id: 6,  title: 'Stage 6: Optical Inspection',   instruction: 'Scan surfaces with YOLO vision system. Verify component alignment and report micro-cracks.',                          status: 'pending',   icon: Eye },
  { id: 7,  title: 'Stage 7: Dehydration Chamber',  instruction: 'Maintain drying kiln at 60°C with 15% relative humidity for 6 hours. Monitor condensate outflow.',                   status: 'pending',   icon: Sun },
  { id: 8,  title: 'Stage 8: Coating Application',  instruction: 'Apply thin protective polymer layer. Inspect for uniform distribution and avoid bubbles.',                            status: 'pending',   icon: RefreshCw },
  { id: 9,  title: 'Stage 9: Curing and Cooling',   instruction: 'Air cool items slowly to room temperature (21°C) on clean cooling conveyors.',                                        status: 'pending',   icon: Archive },
  { id: 10, title: 'Stage 10: Quality Control Seal',instruction: 'Verify chemical and mechanical stress factors. Apply physical green holographic QC seal.',                            status: 'pending',   icon: ShieldCheck },
  { id: 11, title: 'Stage 11: Barcode Labeling',    instruction: 'Generate and apply standard UUID barcoded tracking tags. Scan tags to verify database sync.',                        status: 'pending',   icon: Tag },
  { id: 12, title: 'Stage 12: Final Packaging',     instruction: 'Vacuum seal specimens in moisture-resistant containers. Pack with bubble wrap and seal box.',                        status: 'pending',   icon: Package },
];

export default function ProcessFlowchart({ navigation }) {
  const insets = useSafeAreaInsets();
  const [stages, setStages] = useState(pipelineStages);
  const [expandedNode, setExpandedNode] = useState(3);

  const toggleNode = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedNode(prev => (prev === id ? null : id));
  };

  const handleComplete = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStages(prev => prev.map(stage => {
      if (stage.id === id)     return { ...stage, status: 'completed' };
      if (stage.id === id + 1) return { ...stage, status: 'active' };
      return stage;
    }));
    const nextId = id + 1;
    if (nextId <= stages.length) setExpandedNode(nextId);
    else setExpandedNode(null);
  };

  const handleRedo = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStages(prev => prev.map(stage => {
      if (stage.id === id)  return { ...stage, status: 'active' };
      if (stage.id > id)    return { ...stage, status: 'pending' };
      return stage;
    }));
    setExpandedNode(id);
  };

  const activeStage    = stages.find(s => s.status === 'active');
  const completedCount = stages.filter(s => s.status === 'completed').length;
  const progressText   = activeStage ? `Stage ${activeStage.id}/12` : completedCount === 12 ? 'Completed' : 'Inactive';

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={B.textPri} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>[ PROCESS FLOWCHART ]</Text>
        <View style={styles.progressPill}>
          <Text style={styles.progressText}>{progressText.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <Text style={{ fontSize: 9, color: B.accent, fontWeight: '700', letterSpacing: 2.5 }}>[ MANUFACTURING PIPELINE ]</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
          </View>
          <Text style={styles.infoSubtitle}>
            Follow the 12-stage pipeline sequentially. Tap any stage node below to expand full operational requirements and SOPs.
          </Text>
        </View>

        {/* Timeline */}
        <View style={styles.timelineContainer}>
          {stages.map((stage, index) => {
            const isExpanded  = expandedNode === stage.id;
            const StageIcon   = stage.icon;

            // Timeline dot & line colours
            let dotBg     = B.border;
            let lineBg    = B.border;

            if (stage.status === 'completed') {
              dotBg  = B.success;
              lineBg = B.success;
            } else if (stage.status === 'active') {
              dotBg  = B.accent;
              lineBg = B.border;
            }

            return (
              <View key={stage.id} style={styles.nodeContainer}>
                {/* Axis dot + line */}
                <View style={styles.axisWrapper}>
                  <View style={[styles.nodeDot, { backgroundColor: dotBg }]}>
                    {stage.status === 'completed' ? (
                      <CheckCircle2 size={12} color={B.bg} />
                    ) : stage.status === 'active' ? (
                      <Play size={11} color={B.bg} style={{ marginLeft: 1 }} />
                    ) : (
                      <Text style={styles.nodeDotNum}>{stage.id}</Text>
                    )}
                  </View>
                  {index < stages.length - 1 && (
                    <View style={[styles.timelineLine, { backgroundColor: lineBg }]} />
                  )}
                </View>

                {/* Accordion card */}
                <TouchableOpacity
                  style={[
                    styles.nodeCard,
                    isExpanded && styles.nodeCardExpanded,
                    stage.status === 'active' && styles.nodeCardActive,
                    stage.status === 'completed' && styles.nodeCardCompleted,
                  ]}
                  onPress={() => toggleNode(stage.id)}
                  activeOpacity={0.9}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      {/* Stage number badge */}
                      <View style={[
                        styles.stageBadge,
                        stage.status === 'completed' && styles.stageBadgeCompleted,
                        stage.status === 'active'    && styles.stageBadgeActive,
                        stage.status === 'pending'   && styles.stageBadgePending,
                      ]}>
                        <StageIcon size={13} color={
                          stage.status === 'completed' ? B.bg :
                          stage.status === 'active'    ? B.bg : B.accentDim
                        } />
                      </View>
                      <Text style={[
                        styles.nodeTitle,
                        stage.status === 'active'    && styles.nodeTitleActive,
                        stage.status === 'pending'   && styles.nodeTitlePending,
                        stage.status === 'completed' && styles.nodeTitleCompleted,
                      ]}>
                        {stage.title}
                      </Text>
                    </View>
                    {isExpanded
                      ? <ChevronUp size={15} color={B.accent} />
                      : <ChevronDown size={15} color={B.accentDim} />}
                  </View>

                  {isExpanded && (
                    <View style={styles.cardBody}>
                      <View style={styles.instructionContainer}>
                        <Text style={styles.instructionLabel}>[ OPERATIONAL INSTRUCTION ]</Text>
                        <Text style={styles.instructionText}>{stage.instruction}</Text>
                      </View>

                      {stage.status === 'active' && (
                        <TouchableOpacity
                          style={styles.completeButton}
                          onPress={() => handleComplete(stage.id)}
                          activeOpacity={0.8}
                        >
                          <CheckCircle2 size={13} color={B.bg} style={{ marginRight: 6 }} />
                          <Text style={styles.completeButtonText}>COMPLETE STAGE</Text>
                        </TouchableOpacity>
                      )}

                      {stage.status === 'completed' && (
                        <TouchableOpacity
                          style={styles.redoButton}
                          onPress={() => handleRedo(stage.id)}
                          activeOpacity={0.8}
                        >
                          <RotateCcw size={12} color={B.error} style={{ marginRight: 5 }} />
                          <Text style={styles.redoButtonText}>REDO STAGE</Text>
                        </TouchableOpacity>
                      )}

                      <View style={styles.badgeRow}>
                        <View style={[
                          styles.statusBadge,
                          stage.status === 'completed' && { backgroundColor: B.successBg, borderColor: B.success },
                          stage.status === 'active'    && { backgroundColor: 'rgba(143,164,184,0.12)', borderColor: B.accent },
                          stage.status === 'pending'   && { backgroundColor: B.warningBg, borderColor: B.warning },
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            stage.status === 'completed' && { color: B.success },
                            stage.status === 'active'    && { color: B.accent },
                            stage.status === 'pending'   && { color: B.warning },
                          ]}>
                            {stage.status.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.sopCode}>SOP-STG-{String(stage.id).padStart(2, '0')}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

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
  progressPill: {
    backgroundColor: 'rgba(143,164,184,0.12)',
    borderWidth: 1,
    borderColor: B.accent,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  progressText: {
    fontSize: 9,
    fontWeight: '700',
    color: B.accent,
    letterSpacing: 1.5,
  },

  scrollContainer: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },

  // ── Info card ─────────────────────────────────────────────
  infoCard: {
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: B.border,
  },
  infoSubtitle: {
    fontSize: 12,
    color: B.textMuted,
    lineHeight: 17,
  },

  // ── Timeline ──────────────────────────────────────────────
  timelineContainer: { paddingLeft: 2 },
  nodeContainer: {
    flexDirection: 'row',
    minHeight: 60,
  },
  axisWrapper: {
    alignItems: 'center',
    width: 30,
    marginRight: 10,
  },
  nodeDot: {
    width: 28,
    height: 28,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  nodeDotNum: {
    fontSize: 10,
    fontWeight: '800',
    color: B.textMuted,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: -2,
    marginBottom: -2,
    zIndex: 1,
  },

  // ── Node card ─────────────────────────────────────────────
  nodeCard: {
    flex: 1,
    backgroundColor: B.bgCard,
    borderRadius: 0,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: B.border,
  },
  nodeCardActive: {
    borderColor: B.borderActive,
  },
  nodeCardExpanded: {
    borderColor: B.accent,
  },
  nodeCardCompleted: {
    borderColor: B.success,
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 6,
  },
  stageBadge: {
    width: 28,
    height: 28,
    borderRadius: 0,
    backgroundColor: B.bg,
    borderWidth: 1,
    borderColor: B.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  stageBadgeCompleted: { backgroundColor: B.success, borderColor: B.success },
  stageBadgeActive:    { backgroundColor: B.accent,  borderColor: B.accent },
  stageBadgePending:   { backgroundColor: B.bg,      borderColor: B.border },

  nodeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: B.textMuted,
    flex: 1,
  },
  nodeTitleActive: {
    color: B.accentText,
    fontWeight: '700',
  },
  nodeTitleCompleted: {
    color: B.textPri,
  },
  nodeTitlePending: {
    color: B.textMuted,
  },

  cardBody: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: B.border,
  },
  instructionContainer: {
    backgroundColor: B.bg,
    borderRadius: 0,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: B.border,
    borderLeftWidth: 3,
    borderLeftColor: B.accentDim,
  },
  instructionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: B.accentDim,
    letterSpacing: 2.5,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  instructionText: {
    fontSize: 12,
    color: B.textPri,
    lineHeight: 17,
    fontWeight: '500',
  },

  completeButton: {
    backgroundColor: B.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 0,
    marginBottom: 10,
  },
  completeButtonText: {
    color: B.bg,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  redoButton: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: B.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 0,
    marginBottom: 10,
  },
  redoButtonText: {
    color: B.error,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: 0,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sopCode: {
    fontSize: 10,
    color: B.accentDim,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
