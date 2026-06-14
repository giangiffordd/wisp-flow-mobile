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
import { ArrowLeft, Bell, X, ShieldAlert, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOW_SM } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const initialAlerts = [
  {
    id: '1',
    title: 'Specimen Flagged in QC',
    description: 'Batch #BT-9921 specimen 14 failed viability verification and has been flagged for destruction.',
    timestamp: '10 mins ago',
    type: 'critical',
    icon: ShieldAlert,
    iconColor: COLORS.errorRed,
  },
  {
    id: '2',
    title: 'Log Rejected by Manager',
    description: 'Stage 4 assembly log submitted by ID EMP-1033 has been sent back for temperature validation correction.',
    timestamp: '42 mins ago',
    type: 'warning',
    icon: AlertCircle,
    iconColor: COLORS.warningAmber,
  },
  {
    id: '3',
    title: 'Inventory Synced',
    description: 'Central database inventory count synchronized successfully with regional storage facility A.',
    timestamp: '2 hours ago',
    type: 'success',
    icon: CheckCircle2,
    iconColor: COLORS.successGreen,
  },
  {
    id: '4',
    title: 'Specimen Flagged in QC',
    description: 'Batch #BT-9921 specimen 08 flagged due to chamber humidity drift anomaly. Re-testing scheduled.',
    timestamp: '4 hours ago',
    type: 'critical',
    icon: ShieldAlert,
    iconColor: COLORS.errorRed,
  },
  {
    id: '5',
    title: 'Log Rejected by Manager',
    description: 'Assembly line B batch checklist rejected: missing secondary supervisor electronic signature.',
    timestamp: 'Yesterday',
    type: 'warning',
    icon: AlertCircle,
    iconColor: COLORS.warningAmber,
  },
  {
    id: '6',
    title: 'Inventory Synced',
    description: 'Local batch logs exported to production reporting ledger. All 12 items verified.',
    timestamp: 'Yesterday',
    type: 'success',
    icon: CheckCircle2,
    iconColor: COLORS.successGreen,
  },
];

export default function StaffAlertsNotifications({ navigation }) {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState(initialAlerts);

  const dismissAlert = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAlerts(alerts.filter(alert => alert.id !== id));
  };

  const clearAllAlerts = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAlerts([]);
  };

  const resetList = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAlerts(initialAlerts);
  };

  return (
    <View style={styles.container}>
      {/* ── Dark Navy Header — matches ICPI admin header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={COLORS.textOnDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Alerts</Text>
        </View>

        {alerts.length > 0 && (
          <TouchableOpacity onPress={clearAllAlerts} style={styles.clearAllButton}>
            <Text style={styles.clearAllText}>Dismiss All</Text>
          </TouchableOpacity>
        )}
      </View>

      {alerts.length > 0 ? (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {alerts.map((alert) => {
            const Icon = alert.icon;

            // Left-border colour mirrors ICPI's status indicators
            let borderColor = COLORS.successGreen;
            let bgUrgency   = 'rgba(16,185,129,0.025)';
            if (alert.type === 'critical') {
              borderColor = COLORS.errorRed;
              bgUrgency   = 'rgba(239,68,68,0.025)';
            } else if (alert.type === 'warning') {
              borderColor = COLORS.warningAmber;
              bgUrgency   = 'rgba(245,158,11,0.025)';
            }

            return (
              <View
                key={alert.id}
                style={[styles.alertCard, { borderLeftColor: borderColor, backgroundColor: bgUrgency }]}
              >
                <View style={styles.cardMain}>
                  <View style={styles.iconWrapper}>
                    <Icon size={18} color={alert.iconColor} />
                  </View>
                  <View style={styles.textWrapper}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle}>{alert.title}</Text>
                      <Text style={styles.timestamp}>{alert.timestamp}</Text>
                    </View>
                    <Text style={styles.cardDescription}>{alert.description}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => dismissAlert(alert.id)}
                  activeOpacity={0.7}
                >
                  <X size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrapper}>
            <Bell size={42} color={COLORS.textLight} />
          </View>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySubtitle}>
            There are no pending alerts or push notifications requiring your review.
          </Text>

          <TouchableOpacity style={styles.resetButton} onPress={resetList} activeOpacity={0.8}>
            <RefreshCw size={15} color={COLORS.white} style={{ marginRight: 7 }} />
            <Text style={styles.resetButtonText}>Repopulate Alerts</Text>
          </TouchableOpacity>
        </View>
      )}
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
  clearAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  clearAllText: {
    color: COLORS.textOnDark,
    fontSize: 12,
    fontWeight: '600',
  },

  scrollContainer: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },

  // ── Alert card — ICPI card style + coloured left border ───────
  alertCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderLeftWidth: 4,
    ...SHADOW_SM,
    position: 'relative',
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    paddingRight: 22,
  },
  iconWrapper: {
    marginRight: 10,
    marginTop: 1,
  },
  textWrapper: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: 5,
    gap: 6,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  cardDescription: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  dismissButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
    backgroundColor: COLORS.inputBg,
    borderRadius: 6,
  },

  // ── Empty state ───────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 7,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  resetButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
