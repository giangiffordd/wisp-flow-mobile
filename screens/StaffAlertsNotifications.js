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

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const initialAlerts = [
  {
    id: '1',
    title: 'Specimen Flagged in QC',
    description: 'Batch #BT-9921 specimen 14 failed viability verification and has been flagged for destruction.',
    timestamp: '10 mins ago',
    type: 'critical', // Red left border
    icon: ShieldAlert,
    iconColor: '#ef4444',
  },
  {
    id: '2',
    title: 'Log Rejected by Manager',
    description: 'Stage 4 assembly log submitted by ID EMP-1033 has been sent back for temperature validation correction.',
    timestamp: '42 mins ago',
    type: 'warning', // Yellow left border
    icon: AlertCircle,
    iconColor: '#f59e0b',
  },
  {
    id: '3',
    title: 'Inventory Synced',
    description: 'Central database inventory count synchronized successfully with regional storage facility A.',
    timestamp: '2 hours ago',
    type: 'success', // Green left border
    icon: CheckCircle2,
    iconColor: '#10b981',
  },
  {
    id: '4',
    title: 'Specimen Flagged in QC',
    description: 'Batch #BT-9921 specimen 08 flagged due to chamber humidity drift anomaly. Re-testing scheduled.',
    timestamp: '4 hours ago',
    type: 'critical', // Red
    icon: ShieldAlert,
    iconColor: '#ef4444',
  },
  {
    id: '5',
    title: 'Log Rejected by Manager',
    description: 'Assembly line B batch checklist rejected: missing secondary supervisor electronic signature.',
    timestamp: 'Yesterday',
    type: 'warning', // Yellow
    icon: AlertCircle,
    iconColor: '#f59e0b',
  },
  {
    id: '6',
    title: 'Inventory Synced',
    description: 'Local batch logs exported to production reporting ledger. All 12 items verified.',
    timestamp: 'Yesterday',
    type: 'success', // Green
    icon: CheckCircle2,
    iconColor: '#10b981',
  }
];

export default function StaffAlertsNotifications({ navigation }) {
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
      {/* Sleek Slate Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color="#f8fafc" />
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
            
            // Urgency color logic
            let borderColor = '#10b981'; // success
            let bgUrgency = 'rgba(16, 185, 129, 0.03)';
            if (alert.type === 'critical') {
              borderColor = '#ef4444';
              bgUrgency = 'rgba(239, 68, 68, 0.03)';
            } else if (alert.type === 'warning') {
              borderColor = '#f59e0b';
              bgUrgency = 'rgba(245, 158, 11, 0.03)';
            }

            return (
              <View 
                key={alert.id} 
                style={[
                  styles.alertCard, 
                  { borderLeftColor: borderColor, backgroundColor: bgUrgency }
                ]}
              >
                <View style={styles.cardMain}>
                  <View style={styles.iconWrapper}>
                    <Icon size={20} color={alert.iconColor} />
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
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrapper}>
            <Bell size={48} color="#94a3b8" />
          </View>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySubtitle}>There are no pending alerts or push notifications requiring your review.</Text>
          
          <TouchableOpacity style={styles.resetButton} onPress={resetList} activeOpacity={0.8}>
            <RefreshCw size={16} color="#ffffff" style={{ marginRight: 8 }} />
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  clearAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  clearAllText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  alertCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 5,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    paddingRight: 24, // Space for dismissal 'x'
  },
  iconWrapper: {
    marginRight: 12,
    marginTop: 2,
  },
  textWrapper: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: 6,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  timestamp: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  cardDescription: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  dismissButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
