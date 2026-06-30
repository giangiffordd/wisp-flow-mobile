import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, Briefcase, ClipboardList, Layers, BarChart2, ArrowLeft, KeyRound } from 'lucide-react-native';
import { getWorkerSession, clearWorkerSession, workerLabel } from '../src/services/workerSession';
import { supabase } from '../src/services/supabaseService';

// ── Palette (matches ChangePassword.js / MainAppNavigator.js) ────────────────
const C = {
  bg:          '#F8F9FA',
  panel:       '#FFFFFF',
  border:      '#E5E7EB',
  accent:      '#5B21D9',
  accentDim:   '#7C3AED',
  accentLight: '#EDE9FE',
  textDark:    '#111827',
  textMid:     '#1F2937',
  textMuted:   '#6B7280',
  textLight:   '#9CA3AF',
  error:       '#EF4444',
  errorBg:     'rgba(239,68,68,0.08)',
  white:       '#FFFFFF',
};

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export default function Profile({ navigation }) {
  const insets = useSafeAreaInsets();

  const [session, setSession]               = useState(null);
  const [loading, setLoading]               = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Stats
  const [scanBatches, setScanBatches]       = useState(0);
  const [totalScanned, setTotalScanned]     = useState(0);
  const [totalPassed, setTotalPassed]       = useState(0);
  const [stageLogs, setStageLogs]           = useState(0);
  const [stockRequests, setStockRequests]   = useState(0);
  const [approvedBatches, setApprovedBatches] = useState(0);
  const [rejectedBatches, setRejectedBatches] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const s = await getWorkerSession();
      if (cancelled) return;

      if (!s) {
        setLoading(false);
        return;
      }

      setSession(s);
      const label = workerLabel(s);

      // Fire all three Supabase queries in parallel.
      const [batchResult, stageResult, stockResult] = await Promise.all([
        // QC scan batches
        supabase
          ? supabase
              .from('scan_batches')
              .select('total_scanned, pass_count, status')
              .eq('worker_name', label)
          : Promise.resolve({ data: null, error: null }),

        // Stage logs
        supabase
          ? supabase
              .from('stage_logs')
              .select('id', { count: 'exact', head: true })
              .eq('worker_name', label)
          : Promise.resolve({ count: null, error: null }),

        // Stock requests (barcode scans)
        supabase
          ? supabase
              .from('stock_requests')
              .select('id', { count: 'exact', head: true })
              .eq('worker_name', label)
          : Promise.resolve({ count: null, error: null }),
      ]);

      if (cancelled) return;

      // scan_batches
      if (!batchResult.error && batchResult.data) {
        const rows = batchResult.data;
        setScanBatches(rows.length);
        setTotalScanned(rows.reduce((acc, r) => acc + (r.total_scanned || 0), 0));
        setTotalPassed(rows.reduce((acc, r) => acc + (r.pass_count || 0), 0));
        setApprovedBatches(rows.filter(r => r.status === 'approved').length);
        setRejectedBatches(rows.filter(r => r.status === 'rejected').length);
      }

      // stage_logs — using count mode
      if (!stageResult.error) {
        setStageLogs(stageResult.count ?? 0);
      }

      // stock_requests — using count mode
      if (!stockResult.error) {
        setStockRequests(stockResult.count ?? 0);
      }

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const handleLogoutConfirm = async () => {
    setShowLogoutModal(false);
    await clearWorkerSession();
    // Profile is a tab nested in the root stack, so replace must target the stack.
    (navigation.getParent() ?? navigation).replace('Login');
  };

  const totalJobs = scanBatches + stageLogs + stockRequests;
  // QC Accuracy = specimen pass rate (passed / scanned). This matches the web
  // Insights "Worker QC Accuracy" definition exactly, so the same worker shows
  // one consistent number in both places (previously mobile used the manager
  // approved/(approved+rejected) batch rate, which disagreed with the web).
  const accuracy = totalScanned > 0 ? Math.round((totalPassed / totalScanned) * 100) : null;

  // ── No session ────────────────────────────────────────────────────────────
  if (!loading && !session) {
    return (
      <View style={s.bg}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <View style={s.centeredMsg}>
          <Text style={s.noSessionText}>No active session.</Text>
          <Text style={s.noSessionSub}>Please log in again.</Text>
        </View>
      </View>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.bg, s.center]}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <View style={s.bg}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header — matches the Alerts/Notifications back-button format,
          respects the safe-area top inset so it never collides with the
          status bar / notch on any screen size. */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <ArrowLeft size={20} color={C.textDark} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom, 32) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile header card ──────────────────────────────────────── */}
        <View style={s.profileCard}>
          {/* Avatar */}
          <View style={s.avatar}>
            <Text style={s.avatarInitials}>{getInitials(session.name)}</Text>
          </View>

          {/* Name */}
          <Text style={s.workerName}>{session.name || '—'}</Text>

          {/* Employee ID */}
          <View style={s.empIdRow}>
            <Text style={s.empIdLabel}>[ EMP ID ]</Text>
            <Text style={s.empIdValue}>{session.employee_id || '—'}</Text>
          </View>

          {/* Role badge */}
          <View style={s.roleBadge}>
            <Briefcase size={11} color={C.accent} />
            <Text style={s.roleBadgeText}>{capitalize(session.role) || 'Worker'}</Text>
          </View>
        </View>

        {/* ── Total Jobs Done (headline) ───────────────────────────────── */}
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>[ TOTAL TASKS DONE ]</Text>
          <Text style={s.totalNumber}>{totalJobs}</Text>
          <Text style={s.totalSub}>Across all recorded activity</Text>
        </View>

        {/* ── Stats grid ──────────────────────────────────────────────── */}
        <View style={s.statsGrid}>
          {/* QC Scans */}
          <View style={[s.statCard, s.statCardHalf]}>
            <View style={s.statIconWrap}>
              <BarChart2 size={16} color={C.accent} />
            </View>
            <Text style={s.statNumber}>{scanBatches}</Text>
            <Text style={s.statLabel}>QC Scans</Text>
          </View>

          {/* Stage Logs */}
          <View style={[s.statCard, s.statCardHalf]}>
            <View style={s.statIconWrap}>
              <Layers size={16} color={C.accent} />
            </View>
            <Text style={s.statNumber}>{stageLogs}</Text>
            <Text style={s.statLabel}>Stage Logs</Text>
          </View>

          {/* Barcode Scans */}
          <View style={[s.statCard, s.statCardHalf]}>
            <View style={s.statIconWrap}>
              <ClipboardList size={16} color={C.accent} />
            </View>
            <Text style={s.statNumber}>{stockRequests}</Text>
            <Text style={s.statLabel}>Barcode Scans</Text>
          </View>

          {/* QC Accuracy */}
          <View style={[s.statCard, s.statCardHalf]}>
            <View style={s.statIconWrap}>
              <BarChart2 size={16} color={accuracy !== null && accuracy >= 80 ? '#10B981' : C.textLight} />
            </View>
            <Text style={[s.statNumber, accuracy !== null && accuracy >= 80 && { color: '#10B981' }]}>
              {accuracy !== null ? `${accuracy}%` : '—'}
            </Text>
            <Text style={s.statLabel}>QC Accuracy</Text>
          </View>
        </View>

        {/* ── Change Password button ───────────────────────────────────── */}
        <TouchableOpacity
          style={s.changePwBtn}
          onPress={() => navigation.navigate('ChangePassword')}
          activeOpacity={0.85}
        >
          <KeyRound size={16} color={C.accent} style={{ marginRight: 8 }} />
          <Text style={s.changePwBtnText}>CHANGE PASSWORD</Text>
        </TouchableOpacity>

        {/* ── Log Out button ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() => setShowLogoutModal(true)}
          activeOpacity={0.85}
        >
          <LogOut size={16} color={C.white} style={{ marginRight: 8 }} />
          <Text style={s.logoutBtnText}>LOG OUT</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Logout confirmation modal (mirrors MainAppNavigator style) ──── */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['portrait']}
      >
        <View style={m.overlay}>
          <View style={m.card}>
            <View style={m.iconRow}>
              <LogOut size={22} color={C.error} />
            </View>
            <Text style={m.title}>Log Out</Text>
            <Text style={m.body}>Are you sure you want to log out?</Text>
            <View style={m.actions}>
              <TouchableOpacity
                style={m.cancelBtn}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.75}
              >
                <Text style={m.cancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={m.confirmBtn}
                onPress={handleLogoutConfirm}
                activeOpacity={0.85}
              >
                <Text style={m.confirmText}>LOG OUT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Main stylesheet ───────────────────────────────────────────────────────────
const s = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: C.bg,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Header (back button + title) — mirrors StaffAlertsNotifications ──────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.panel,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: {
    padding: 8,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerTitle: {
    color: C.textDark,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textDark,
    marginBottom: 20,
    letterSpacing: 0.5,
  },

  // ── Profile header card ───────────────────────────────────────────────────
  profileCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 3,
    borderColor: C.accentLight,
  },
  avatarInitials: {
    color: C.white,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },
  workerName: {
    fontSize: 20,
    fontWeight: '800',
    color: C.textDark,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  empIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  empIdLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.accentDim,
    letterSpacing: 2,
  },
  empIdValue: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textMuted,
    letterSpacing: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.accentLight,
    borderWidth: 1,
    borderColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // ── Total jobs headline card ──────────────────────────────────────────────
  totalCard: {
    backgroundColor: C.accent,
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 3,
    marginBottom: 6,
  },
  totalNumber: {
    fontSize: 52,
    fontWeight: '900',
    color: C.white,
    lineHeight: 56,
    marginBottom: 4,
  },
  totalSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // ── Stats grid ────────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statCardHalf: {
    // Two columns with gap: 10; parent has paddingHorizontal: 24 * 2 = 48 total,
    // 10 gap in between. So each card = (screenWidth - 48 - 10) / 2.
    // Using flexBasis with a percentage close to half minus gap.
    flexBasis: '47.5%',
    flexGrow: 1,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: C.textDark,
    marginBottom: 2,
    lineHeight: 32,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── Change Password button ────────────────────────────────────────────────
  changePwBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.accent,
    paddingVertical: 15,
    marginBottom: 10,
  },
  changePwBtnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },

  // ── Log Out button ────────────────────────────────────────────────────────
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    marginBottom: 8,
  },
  logoutBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 4,
  },

  // ── No-session fallback ───────────────────────────────────────────────────
  centeredMsg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  noSessionText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textDark,
    marginBottom: 6,
  },
  noSessionSub: {
    fontSize: 13,
    color: C.textMuted,
  },
});

// ── Logout modal stylesheet (pixel-perfect match to MainAppNavigator) ─────────
const m = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    alignItems: 'center',
  },
  iconRow: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title:      { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  body:       { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  actions:    { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtn:  {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelText:  { fontSize: 12, fontWeight: '800', color: '#6B7280', letterSpacing: 2 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#EF4444',
  },
  confirmText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2 },
});
