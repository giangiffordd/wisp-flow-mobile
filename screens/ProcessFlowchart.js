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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const pipelineStages = [
  {
    id: 1,
    title: 'Stage 1: Deep Freezing',
    instruction: 'Keep specimens in Chamber A at -20°C for exactly 48 hours to induce metabolic dormancy.',
    status: 'completed',
    icon: ThermometerSnowflake,
  },
  {
    id: 2,
    title: 'Stage 2: Sorting & Grading',
    instruction: 'Classify materials by density and color profiles. Reject items with size variance > 5%.',
    status: 'completed',
    icon: Filter,
  },
  {
    id: 3,
    title: 'Stage 3: Thermal Treatment',
    instruction: 'Perform rapid thermal cycling from 15°C to 45°C to strengthen structural outer membranes.',
    status: 'active', // Currently in progress
    icon: Flame,
  },
  {
    id: 4,
    title: 'Stage 4: Mass Measurement',
    instruction: 'Log batch weight using high-precision scales. Calibrate scale to 0.00g before logging.',
    status: 'pending',
    icon: Scale,
  },
  {
    id: 5,
    title: 'Stage 5: Ultrasonic Wash',
    instruction: 'Submerge batch in purified saline solution with 40kHz sonic transducers for 120 seconds.',
    status: 'pending',
    icon: Sparkles,
  },
  {
    id: 6,
    title: 'Stage 6: Optical Inspection',
    instruction: 'Scan surfaces with YOLO vision system. Verify component alignment and report micro-cracks.',
    status: 'pending',
    icon: Eye,
  },
  {
    id: 7,
    title: 'Stage 7: Dehydration Chamber',
    instruction: 'Maintain drying kiln at 60°C with 15% relative humidity for 6 hours. Monitor condensate outflow.',
    status: 'pending',
    icon: Sun,
  },
  {
    id: 8,
    title: 'Stage 8: Coating Application',
    instruction: 'Apply thin protective polymer layer. Inspect for uniform distribution and avoid bubbles.',
    status: 'pending',
    icon: RefreshCw,
  },
  {
    id: 9,
    title: 'Stage 9: Curing and Cooling',
    instruction: 'Air cool items slowly to room temperature (21°C) on clean cooling conveyors.',
    status: 'pending',
    icon: Archive,
  },
  {
    id: 10,
    title: 'Stage 10: Quality Control Seal',
    instruction: 'Verify chemical and mechanical stress factors. Apply physical green holographic QC seal.',
    status: 'pending',
    icon: ShieldCheck,
  },
  {
    id: 11,
    title: 'Stage 11: Barcode Labeling',
    instruction: 'Generate and apply standard UUID barcoded tracking tags. Scan tags to verify database sync.',
    status: 'pending',
    icon: Tag,
  },
  {
    id: 12,
    title: 'Stage 12: Final Packaging',
    instruction: 'Vacuum seal specimens in moisture-resistant containers. Pack with bubble wrap and seal box.',
    status: 'pending',
    icon: Package,
  },
];

export default function ProcessFlowchart({ navigation }) {
  const [stages, setStages] = useState(pipelineStages);
  const [expandedNode, setExpandedNode] = useState(3); // Default expanded to active stage (3)

  const toggleNode = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedNode === id) {
      setExpandedNode(null);
    } else {
      setExpandedNode(id);
    }
  };

  const handleComplete = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStages(prevStages => {
      return prevStages.map(stage => {
        if (stage.id === id) {
          return { ...stage, status: 'completed' };
        }
        if (stage.id === id + 1) {
          return { ...stage, status: 'active' };
        }
        return stage;
      });
    });
    
    // Expand next stage if available
    const nextId = id + 1;
    if (nextId <= stages.length) {
      setExpandedNode(nextId);
    } else {
      setExpandedNode(null);
    }
  };

  const handleRedo = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStages(prevStages => {
      return prevStages.map(stage => {
        if (stage.id === id) {
          return { ...stage, status: 'active' };
        }
        if (stage.id > id) {
          return { ...stage, status: 'pending' };
        }
        return stage;
      });
    });
    setExpandedNode(id);
  };

  // Compute active status progress
  const activeStage = stages.find(s => s.status === 'active');
  const completedCount = stages.filter(s => s.status === 'completed').length;
  const progressText = activeStage ? `Stage ${activeStage.id}/12` : completedCount === 12 ? 'Completed' : 'Inactive';

  return (
    <View style={styles.container}>
      {/* Sleek Slate Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Process Flowchart</Text>
        <View style={styles.headerRight}>
          <Text style={styles.progressText}>{progressText}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Manufacturing Pipeline</Text>
          <Text style={styles.infoSubtitle}>
            Follow the 12-stage pipeline sequentially. Tap any stage node below to expand full operational requirements and standard operating procedures (SOP).
          </Text>
        </View>

        {/* Timeline Container */}
        <View style={styles.timelineContainer}>
          {stages.map((stage, index) => {
            const isExpanded = expandedNode === stage.id;
            const StageIcon = stage.icon;

            // Dot and line style logic based on stage status
            let dotBg = '#e2e8f0';
            let dotBorder = '#cbd5e1';
            let IconComponent = Circle;
            let iconColor = '#94a3b8';
            let lineBg = '#e2e8f0';

            if (stage.status === 'completed') {
              dotBg = '#10b981';
              dotBorder = '#10b981';
              IconComponent = CheckCircle2;
              iconColor = '#ffffff';
              lineBg = '#10b981';
            } else if (stage.status === 'active') {
              dotBg = '#3b82f6';
              dotBorder = '#93c5fd';
              IconComponent = Play;
              iconColor = '#ffffff';
              lineBg = '#cbd5e1';
            }

            return (
              <View key={stage.id} style={styles.nodeContainer}>
                {/* Timeline Axis (Dot & Connecting Line) */}
                <View style={styles.axisWrapper}>
                  <View style={[
                    styles.nodeDot, 
                    { backgroundColor: dotBg, borderColor: dotBorder },
                    stage.status === 'active' && styles.activeDot
                  ]}>
                    <IconComponent size={14} color={iconColor} style={stage.status === 'active' ? { marginLeft: 1 } : {}} />
                  </View>
                  
                  {index < stages.length - 1 && (
                    <View style={[styles.timelineLine, { backgroundColor: lineBg }]} />
                  )}
                </View>

                {/* Accordion Node Card */}
                <TouchableOpacity 
                  style={[
                    styles.nodeCard, 
                    isExpanded && styles.nodeCardExpanded,
                    stage.status === 'active' && styles.nodeCardActive
                  ]}
                  onPress={() => toggleNode(stage.id)}
                  activeOpacity={0.9}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[
                        styles.iconCircle, 
                        stage.status === 'completed' && styles.iconCircleCompleted,
                        stage.status === 'active' && styles.iconCircleActive
                      ]}>
                        <StageIcon size={16} color={
                          stage.status === 'completed' ? '#10b981' : 
                          stage.status === 'active' ? '#3b82f6' : '#64748b'
                        } />
                      </View>
                      <Text style={[
                        styles.nodeTitle,
                        stage.status === 'active' && styles.nodeTitleActive
                      ]}>
                        {stage.title}
                      </Text>
                    </View>
                    
                    {isExpanded ? (
                      <ChevronUp size={16} color="#64748b" />
                    ) : (
                      <ChevronDown size={16} color="#64748b" />
                    )}
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
                          <CheckCircle2 size={14} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={styles.completeButtonText}>Complete Stage</Text>
                        </TouchableOpacity>
                      )}

                      {stage.status === 'completed' && (
                        <TouchableOpacity 
                          style={styles.redoButton}
                          onPress={() => handleRedo(stage.id)}
                          activeOpacity={0.8}
                        >
                          <RotateCcw size={12} color="#64748b" style={{ marginRight: 6 }} />
                          <Text style={styles.redoButtonText}>Redo Stage</Text>
                        </TouchableOpacity>
                      )}

                      <View style={styles.badgeRow}>
                        <View style={[
                          styles.statusBadge, 
                          stage.status === 'completed' && styles.statusBadgeCompleted,
                          stage.status === 'active' && styles.statusBadgeActive
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            stage.status === 'completed' && styles.statusBadgeTextCompleted,
                            stage.status === 'active' && styles.statusBadgeTextActive
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
    backgroundColor: '#f1f5f9', // Light gray background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B', // Dark slate header
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    minWidth: 40,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b', // Dark slate text
    marginBottom: 6,
  },
  infoSubtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  timelineContainer: {
    paddingLeft: 4,
  },
  nodeContainer: {
    flexDirection: 'row',
    minHeight: 64,
  },
  axisWrapper: {
    alignItems: 'center',
    width: 32,
    marginRight: 12,
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
  activeDot: {
    borderWidth: 3,
  },
  timelineLine: {
    width: 2.5,
    flex: 1,
    marginTop: -2,
    marginBottom: -2,
    zIndex: 1,
  },
  nodeCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  nodeCardActive: {
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fafc',
  },
  nodeCardExpanded: {
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
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
    paddingRight: 8,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  iconCircleCompleted: {
    backgroundColor: '#ecfdf5',
  },
  iconCircleActive: {
    backgroundColor: '#eff6ff',
  },
  nodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155', // Dark slate text
  },
  nodeTitleActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  cardBody: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  instructionContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  instructionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeCompleted: {
    backgroundColor: '#d1fae5',
  },
  statusBadgeActive: {
    backgroundColor: '#dbeafe',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
  },
  statusBadgeTextCompleted: {
    color: '#065f46',
  },
  statusBadgeTextActive: {
    color: '#1e40af',
  },
  sopCode: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  completeButton: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  redoButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  redoButtonText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
});
