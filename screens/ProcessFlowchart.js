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
import { COLORS, SHADOW_SM } from '../theme';

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
      {/* ── Dark Navy Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={COLORS.textOnDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Process Flowchart</Text>
        <View style={styles.progressPill}>
          <Text style={styles.progressText}>{progressText}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Info card — ICPI-style white card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Manufacturing Pipeline</Text>
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
            let dotBg     = COLORS.borderLight;
            let dotBorder = COLORS.borderMid;
            let IconComp  = Circle;
            let iconColor = COLORS.textLight;
            let lineBg    = COLORS.borderLight;

            if (stage.status === 'completed') {
              dotBg     = COLORS.successGreen;
              dotBorder = COLORS.successGreen;
              IconComp  = CheckCircle2;
              iconColor = COLORS.white;
              lineBg    = COLORS.successGreen;
            } else if (stage.status === 'active') {
              dotBg     = COLORS.primary;
              dotBorder = COLORS.primaryLight;
              IconComp  = Play;
              iconColor = COLORS.white;
              lineBg    = COLORS.borderLight;
            }

            return (
              <View key={stage.id} style={styles.nodeContainer}>
                {/* Axis dot + line */}
                <View style={styles.axisWrapper}>
                  <View style={[
                    styles.nodeDot,
                    { backgroundColor: dotBg, borderColor: dotBorder },
                    stage.status === 'active' && styles.activeDot
                  ]}>
                    <IconComp size={13} color={iconColor} style={stage.status === 'active' ? { marginLeft: 1 } : {}} />
                  </View>
                  {index < stages.length - 1 && (
                    <View style={[styles.timelineLine, { backgroundColor: lineBg }]} />
                  )}
                </View>

                {/* Accordion card — ICPI card style */}
                <TouchableOpacity
                  style={[
                    styles.nodeCard,
                    isExpanded && styles.nodeCardExpanded,
                    stage.status === 'active' && styles.nodeCardActive,
                  ]}
                  onPress={() => toggleNode(stage.id)}
                  activeOpacity={0.9}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[
                        styles.iconCircle,
                        stage.status === 'completed' && styles.iconCircleCompleted,
                        stage.status === 'active' && styles.iconCircleActive,
                      ]}>
                        <StageIcon size={15} color={
                          stage.status === 'completed' ? COLORS.successGreen :
                          stage.status === 'active'    ? COLORS.primary      : COLORS.textMuted
                        } />
                      </View>
                      <Text style={[styles.nodeTitle, stage.status === 'active' && styles.nodeTitleActive]}>
                        {stage.title}
                      </Text>
                    </View>
                    {isExpanded
                      ? <ChevronUp size={15} color={COLORS.textMuted} />
                      : <ChevronDown size={15} color={COLORS.textMuted} />}
                  </View>

                  {isExpanded && (
                    <View style={styles.cardBody}>
                      <View style={styles.instructionContainer}>
                        <Text style={styles.instructionLabel}>OPERATIONAL INSTRUCTION</Text>
                        <Text style={styles.instructionText}>{stage.instruction}</Text>
                      </View>

                      {stage.status === 'active' && (
                        <TouchableOpacity
                          style={styles.completeButton}
                          onPress={() => handleComplete(stage.id)}
                          activeOpacity={0.8}
                        >
                          <CheckCircle2 size={13} color={COLORS.white} style={{ marginRight: 6 }} />
                          <Text style={styles.completeButtonText}>Complete Stage</Text>
                        </TouchableOpacity>
                      )}

                      {stage.status === 'completed' && (
                        <TouchableOpacity
                          style={styles.redoButton}
                          onPress={() => handleRedo(stage.id)}
                          activeOpacity={0.8}
                        >
                          <RotateCcw size={12} color={COLORS.textMuted} style={{ marginRight: 5 }} />
                          <Text style={styles.redoButtonText}>Redo Stage</Text>
                        </TouchableOpacity>
                      )}

                      <View style={styles.badgeRow}>
                        <View style={[
                          styles.statusBadge,
                          stage.status === 'completed' && { backgroundColor: COLORS.successBg },
                          stage.status === 'active'    && { backgroundColor: COLORS.primaryMuted },
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            stage.status === 'completed' && { color: '#065F46' },
                            stage.status === 'active'    && { color: '#1E40AF' },
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
  progressPill: {
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },

  scrollContainer: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },

  // ── Info card ─────────────────────────────────────────────
  infoCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 5,
  },
  infoSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    zIndex: 2,
  },
  activeDot: { borderWidth: 3 },
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
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
  },
  nodeCardActive: {
    borderColor: COLORS.primaryLight,
  },
  nodeCardExpanded: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
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
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  iconCircleCompleted: { backgroundColor: COLORS.successBg },
  iconCircleActive:    { backgroundColor: COLORS.primaryMuted },
  nodeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMid,
  },
  nodeTitleActive: {
    color: COLORS.textDark,
    fontWeight: '700',
  },

  cardBody: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.pageBg,
  },
  instructionContainer: {
    backgroundColor: COLORS.pageBg,
    borderRadius: 7,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  instructionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  instructionText: {
    fontSize: 12,
    color: COLORS.textMid,
    lineHeight: 17,
    fontWeight: '500',
  },

  completeButton: {
    backgroundColor: COLORS.successGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 7,
    marginBottom: 10,
  },
  completeButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  redoButton: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 7,
    marginBottom: 10,
  },
  redoButtonText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },

  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  sopCode: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '600',
  },
});
