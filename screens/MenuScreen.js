import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { History, ChevronRight, Cpu, Shield } from 'lucide-react-native';

const PRIVACY_POLICY_URL =
  'https://app.termly.io/policy-viewer/policy.html?policyUUID=1c0a8365-0ccf-4ffc-8f40-ee580a479fb3';

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
      badge: 'Review',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Section divider */}
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionDividerText}>[ OPERATIONS MODULES ]</Text>
        <View style={styles.sectionDividerLine} />
      </View>

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
                <View style={styles.iconContainer}>
                  <Icon size={22} color="#5B21D9" />
                </View>
                {item.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.launchText}>Open Module</Text>
                <ChevronRight size={13} color="#5A7080" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* System Status Footer */}
      <View style={styles.systemStatusCard}>
        <Cpu size={18} color="#4A6070" />
        <View style={styles.systemStatusTextContainer}>
          <Text style={styles.systemStatusTitle}>Wisp Flow Diagnostics</Text>
          <Text style={styles.systemStatusSubtitle}>App Node: Online | Version: v1.0.0</Text>
        </View>
        <View style={styles.statusPulse} />
      </View>

      {/* Privacy Policy Link */}
      <TouchableOpacity
        style={styles.privacyRow}
        onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
        activeOpacity={0.6}
      >
        <Shield size={13} color="#5A7080" />
        <Text style={styles.privacyText}>Privacy Policy</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  sectionDividerText: {
    fontSize: 9,
    color: '#5B21D9',
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  card: {
    width: cardWidth,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 0,
    backgroundColor: 'rgba(143,164,184,0.12)',
    borderWidth: 1,
    borderColor: '#5B21D9',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#5B21D9',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cardBody: {
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },
  launchText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  systemStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 0,
    padding: 14,
    gap: 10,
  },
  systemStatusTextContainer: {
    flex: 1,
  },
  systemStatusTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5B21D9',
  },
  systemStatusSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 0,
    backgroundColor: '#10B981',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 16,
    paddingVertical: 6,
  },
  privacyText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
