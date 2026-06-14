import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LogOut, Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

export default function GlobalHeader({ title, onLogout, onBell, onBrandPress }) {
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    scaleAnim.setValue(0.93);
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 120,
      friction: 6,
      useNativeDriver: true,
    }).start();
    if (onBrandPress) onBrandPress();
  };

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      {/* Left: wisp-flow brand logo (retained) */}
      <TouchableOpacity onPress={handlePress} style={styles.leftSection} activeOpacity={0.7}>
        <Animated.View style={[styles.brandWrapper, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.brandTextGroup}>
            <Text style={styles.brandText}>wisp</Text>
            <Text style={styles.brandDash}>-</Text>
            <Text style={styles.brandSubtext}>flow</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>

      {/* Right: Bell + Logout — same pattern as ICPI "Logout" top-right */}
      <View style={styles.rightSection}>
        {onBell && (
          <TouchableOpacity onPress={onBell} style={styles.iconButton} activeOpacity={0.7}>
            <Bell size={17} color={COLORS.textOnDark} />
          </TouchableOpacity>
        )}
        {onLogout && (
          <TouchableOpacity onPress={onLogout} style={[styles.iconButton, { marginLeft: 8 }]} activeOpacity={0.7}>
            <LogOut size={17} color={COLORS.textLight} />
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.headerBorder,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    color: COLORS.textOnDark,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  brandDash: {
    color: COLORS.textLight,
    fontWeight: '300',
    fontSize: 16,
  },
  brandSubtext: {
    color: COLORS.textOnDark,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});
