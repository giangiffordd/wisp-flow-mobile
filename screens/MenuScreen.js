import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions
} from 'react-native';
import { History, ChevronRight, Cpu } from 'lucide-react-native';
import { COLORS, SHADOW_SM } from '../theme';

const { width } = Dimensions.get('window');
const cardWidth = (width - 48) / 2;

export default function MenuScreen({ navigation }) {
  const menuItems = [
    {
      id: 'history',
      title: 'Task History',
      subtitle: 'Pending & Logs',
      screen: 'TaskHistoryPendingLogs',
      icon: History,
      iconBg: '#FEF2F2',
      iconColor: COLORS.errorRed,
      badge: 'Review',
      badgeBg: '#FEF2F2',
      badgeColor: COLORS.errorRed,
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
              activeOpacity={0.75}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: item.iconBg }]}>
                  <Icon size={22} color={item.iconColor} />
                </View>
                {item.badge && (
                  <View style={[styles.badge, { backgroundColor: item.badgeBg }]}>
                    <Text style={[styles.badgeText, { color: item.badgeColor }]}>{item.badge}</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.launchText}>Open Module</Text>
                <ChevronRight size={13} color={COLORS.textLight} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* System Status Footer */}
      <View style={styles.systemStatusCard}>
        <Cpu size={18} color={COLORS.textMuted} />
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
    backgroundColor: COLORS.pageBg,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  card: {
    width: cardWidth,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOW_SM,
    justifyContent: 'space-between',
    minHeight: 150,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardBody: {
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.pageBg,
    paddingTop: 10,
  },
  launchText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  systemStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  systemStatusTextContainer: {
    flex: 1,
  },
  systemStatusTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMid,
  },
  systemStatusSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.successGreen,
  },
});
