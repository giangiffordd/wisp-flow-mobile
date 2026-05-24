import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LogOut, Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COLORS = {
  navy: '#2B3441',
  navyBorder: '#3D4F63',
  skyAccent: '#B8D4E8',
  white: '#FFFFFF',
  muted: '#94a3b8',
};

export default function GlobalHeader({ title, onLogout, onBell }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      {/* Left: Brand */}
      <View style={styles.leftSection}>
        <Text style={styles.brandText}>wisp</Text>
        <Text style={styles.brandDash}>-</Text>
        <Text style={styles.brandSubtext}>flow</Text>
      </View>

      {/* Right: Bell + Logout */}
      <View style={styles.rightSection}>
        {onBell && (
          <TouchableOpacity
            onPress={onBell}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <Bell size={18} color={COLORS.skyAccent} />
          </TouchableOpacity>
        )}
        {onLogout && (
          <TouchableOpacity
            onPress={onLogout}
            style={[styles.iconButton, { marginLeft: 8 }]}
            activeOpacity={0.7}
          >
            <LogOut size={18} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: COLORS.navy,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    color: COLORS.skyAccent,
    fontWeight: '800',
    fontSize: 18,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  brandDash: {
    color: COLORS.white,
    fontWeight: '300',
    fontSize: 18,
  },
  brandSubtext: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 18,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});
