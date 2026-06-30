import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { FileDown, ShieldAlert, Trophy } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getWorkerSession } from '../src/services/workerSession';
import { fetchEmployeePerformance } from '../src/services/supabaseService';

const B = {
  bg: '#F5F5F7', bgEl: '#FFFFFF', bgCard: '#FFFFFF',
  border: '#E5E7EB', borderActive: '#5B21D9',
  accent: '#5B21D9', accentDim: '#7C3AED', accentText: '#FFFFFF',
  textPri: '#111827', textMuted: '#6B7280',
  error: '#EF4444', success: '#10B981', warning: '#F59E0B',
};

const DEMO_PREFIXES = ['EMP001', 'EMP002'];

function isDemoWorker(workerName) {
  return DEMO_PREFIXES.some(p => (workerName || '').startsWith(p));
}

function formatPassRate(passRate) {
  if (passRate === null || passRate === undefined) return '—';
  return `${Math.round(passRate * 100)}%`;
}

function buildReportHtml(rows) {
  const generatedAt = new Date().toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const tableRows = rows.map((r, i) => {
    const rank = i + 1;
    const highlight = isDemoWorker(r.worker);
    return `
      <tr style="${highlight ? 'background:#F3EEFE;' : ''}">
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-weight:700;">${rank}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;">${r.worker}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center;">${r.totalScanned}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center;color:#10B981;font-weight:700;">${r.passed}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center;color:#EF4444;font-weight:700;">${r.flagged}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center;">${formatPassRate(r.passRate)}</td>
      </tr>`;
  }).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; color: #111827; }
          .header { background: #111111; color: #FFFFFF; padding: 28px 32px; }
          .wordmark { font-size: 13px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; color: #9CA3AF; margin-bottom: 6px; }
          .title { font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
          .accent-rule { height: 4px; background: #5B21D9; }
          .body { padding: 28px 32px; }
          .meta { font-size: 12px; color: #6B7280; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { text-align: left; padding: 10px 12px; background: #F5F5F7; border-bottom: 2px solid #111111; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #6B7280; }
          .footer { background: #111111; color: #9CA3AF; text-align: center; padding: 16px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin-top: 32px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="wordmark">WISP-FLOW</div>
          <div class="title">Employee Performance Report</div>
        </div>
        <div class="accent-rule"></div>
        <div class="body">
          <div class="meta">Generated ${generatedAt}</div>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Worker</th>
                <th style="text-align:center;">Total Scanned</th>
                <th style="text-align:center;">Successful</th>
                <th style="text-align:center;">Flagged</th>
                <th style="text-align:center;">Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#6B7280;">No scan data available.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="footer">Computer-generated report &middot; WISP-FLOW</div>
      </body>
    </html>`;
}

export default function EmployeePerformanceReport({ navigation }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [session, setSession]       = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [rows, setRows]             = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting]   = useState(false);

  const role = (session?.role || '').toLowerCase();
  const isManager = ['manager', 'admin', 'supervisor'].includes(role);

  const loadData = useCallback(async () => {
    const data = await fetchEmployeePerformance();
    setRows(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    (async () => {
      const s = await getWorkerSession();
      if (cancelled) return;
      setSession(s);
      setSessionReady(true);
      const r = (s?.role || '').toLowerCase();
      if (['manager', 'admin', 'supervisor'].includes(r)) {
        await loadData();
      } else {
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isFocused, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const html = buildReportHtml(rows);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Export Ready', `PDF generated at ${uri}`);
      }
    } catch (e) {
      Alert.alert('Export Failed', 'Could not generate the PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!sessionReady) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={B.accent} />
      </View>
    );
  }

  if (!isManager) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <View style={styles.restrictedIcon}>
          <ShieldAlert size={28} color={B.error} />
        </View>
        <Text style={styles.restrictedTitle}>Access Restricted</Text>
        <Text style={styles.restrictedBody}>This report is only available to managers.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Employee Performance</Text>
        <Text style={styles.headerSub}>Ranked by successful scans</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={B.accent} />
        }
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={B.accent} style={{ marginTop: 40 }} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No scan data available yet.</Text>
          </View>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, styles.colRank]}>#</Text>
              <Text style={[styles.th, styles.colWorker]}>Worker</Text>
              <Text style={[styles.th, styles.colNum]}>Total</Text>
              <Text style={[styles.th, styles.colNum]}>Pass</Text>
              <Text style={[styles.th, styles.colNum]}>Flag</Text>
              <Text style={[styles.th, styles.colNum]}>Rate</Text>
            </View>

            {rows.map((r, i) => {
              const highlight = isDemoWorker(r.worker);
              return (
                <View
                  key={r.worker}
                  style={[styles.tableRow, highlight && styles.tableRowHighlight]}
                >
                  <View style={[styles.colRank, styles.rankBadge]}>
                    {i === 0 ? (
                      <Trophy size={14} color={B.warning} />
                    ) : (
                      <Text style={styles.rankText}>{i + 1}</Text>
                    )}
                  </View>
                  <Text style={[styles.td, styles.colWorker, highlight && styles.tdHighlight]} numberOfLines={1}>
                    {r.worker}
                  </Text>
                  <Text style={[styles.td, styles.colNum]}>{r.totalScanned}</Text>
                  <Text style={[styles.td, styles.colNum, { color: B.success, fontWeight: '800' }]}>{r.passed}</Text>
                  <Text style={[styles.td, styles.colNum, { color: B.error, fontWeight: '800' }]}>{r.flagged}</Text>
                  <Text style={[styles.td, styles.colNum]}>{formatPassRate(r.passRate)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.exportBar, { paddingBottom: insets.bottom + 14 }]}>
        <TouchableOpacity
          style={[styles.exportBtn, isExporting && { opacity: 0.6 }]}
          onPress={handleExportPdf}
          disabled={isExporting || rows.length === 0}
          activeOpacity={0.85}
        >
          {isExporting ? (
            <ActivityIndicator color={B.accentText} />
          ) : (
            <>
              <FileDown size={16} color={B.accentText} style={{ marginRight: 8 }} />
              <Text style={styles.exportBtnText}>EXPORT PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: B.textPri },
  headerSub: { fontSize: 12, color: B.textMuted, marginTop: 2 },

  restrictedIcon: {
    width: 56, height: 56,
    borderRadius: 0,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: B.error,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  restrictedTitle: { fontSize: 16, fontWeight: '800', color: B.textPri, marginBottom: 6, letterSpacing: 0.5 },
  restrictedBody: { fontSize: 13, color: B.textMuted, textAlign: 'center', lineHeight: 19 },

  emptyText: { fontSize: 13, color: B.textMuted, marginTop: 40 },

  table: { marginHorizontal: 16, backgroundColor: B.bgCard, borderWidth: 1, borderColor: B.border },
  tableHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: B.bg, borderBottomWidth: 2, borderBottomColor: B.textPri,
    paddingVertical: 10, paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: B.border,
    paddingVertical: 12, paddingHorizontal: 8,
  },
  tableRowHighlight: { backgroundColor: 'rgba(91,33,217,0.06)' },

  th: { fontSize: 10, fontWeight: '800', color: B.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  td: { fontSize: 13, color: B.textPri },
  tdHighlight: { color: B.accent, fontWeight: '800' },

  colRank:   { width: 28, textAlign: 'center' },
  colWorker: { flex: 1, paddingHorizontal: 6 },
  colNum:    { width: 46, textAlign: 'center' },

  rankBadge: { alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '800', color: B.textMuted },

  exportBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 14,
    backgroundColor: B.bgEl, borderTopWidth: 1, borderTopColor: B.border,
  },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: B.accent, paddingVertical: 15,
  },
  exportBtnText: { color: B.accentText, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
