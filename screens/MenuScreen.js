import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions 
} from 'react-native';
import { 
  Boxes, 
  History, 
  ChevronRight,
  Cpu
} from 'lucide-react-native';

const { width } = Dimensions.get('window');
const cardWidth = (width - 48) / 2;

export default function MenuScreen({ navigation }) {
  const menuItems = [
    {
      id: 'inventory',
      title: 'Inventory Viewer',
      subtitle: 'Warehouse Stock',
      screen: 'MobileInventoryViewer',
      icon: Boxes,
      iconColor: '#8b5cf6',
      badge: 'Realtime',
      badgeColor: '#ede9fe',
      badgeTextColor: '#5b21b6',
    },
    {
      id: 'history',
      title: 'Task History',
      subtitle: 'Pending & Logs',
      screen: 'TaskHistoryPendingLogs',
      icon: History,
      iconColor: '#ec4899',
      badge: 'Review',
      badgeColor: '#fce7f3',
      badgeTextColor: '#9d174d',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Operations Modules</Text>
      
      {/* Menu Grid */}
      <View style={styles.grid}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <TouchableOpacity 
              key={item.id} 
              style={styles.card}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: item.iconColor + '15' }]}>
                  <Icon size={24} color={item.iconColor} />
                </View>
                {item.badge && (
                  <View style={[styles.badge, { backgroundColor: item.badgeColor }]}>
                    <Text style={[styles.badgeText, { color: item.badgeTextColor }]}>{item.badge}</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </View>
              
              <View style={styles.cardFooter}>
                <Text style={styles.launchText}>Open Module</Text>
                <ChevronRight size={14} color="#94a3b8" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* System Status Footer */}
      <View style={styles.systemStatusCard}>
        <Cpu size={20} color="#64748b" />
        <View style={styles.systemStatusTextContainer}>
          <Text style={styles.systemStatusTitle}>Wisp Flow Diagnostics</Text>
          <Text style={styles.systemStatusSubtitle}>App Node: Online | Version: v1.0.0</Text>
        </View>
        <View style={styles.statusPulse} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FB',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  statIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  statVal: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  card: {
    width: cardWidth,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    justifyContent: 'space-between',
    minHeight: 160,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardBody: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  launchText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  systemStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  systemStatusTextContainer: {
    flex: 1,
  },
  systemStatusTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  systemStatusSubtitle: {
    fontSize: 11,
    color: '#64748b',
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
});
