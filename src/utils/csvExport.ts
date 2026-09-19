import { MetricSnapshot, SystemLog, SystemAlert } from '../types';

export function downloadMetricsCsv(metrics: MetricSnapshot[], hostname: string) {
  const headers = [
    'Timestamp',
    'TimeLabel',
    'CPU_Usage_Pct',
    'RAM_Usage_Pct',
    'RAM_Used_GB',
    'RAM_Total_GB',
    'Disk_Usage_Pct',
    'Disk_IOPS',
    'Network_In_Mbps',
    'Network_Out_Mbps',
    'Load_1m',
    'Active_TCP_Connections',
    'Latency_ms'
  ];

  const rows = metrics.map(m => [
    m.timestamp,
    m.timeLabel,
    m.cpuUsage.toFixed(2),
    m.ramUsagePercent.toFixed(2),
    m.ramUsedGb.toFixed(2),
    m.ramTotalGb.toFixed(2),
    m.diskUsagePercent.toFixed(2),
    m.diskIops,
    m.networkInMbps.toFixed(2),
    m.networkOutMbps.toFixed(2),
    m.load1m.toFixed(2),
    m.activeConnections,
    m.latencyMs.toFixed(2)
  ]);

  const csvContent = [
    `# Velclaw Hosting Platform - Production Hostname Metrics Report`,
    `# Hostname: ${hostname}`,
    `# Generated: ${new Date().toISOString()}`,
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `velclaw-metrics-${hostname}-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadLogsCsv(logs: SystemLog[], alerts: SystemAlert[]) {
  const headers = ['Timestamp', 'Type', 'Level_Severity', 'Category', 'Message', 'Source_Details'];

  const logRows = logs.map(l => [
    l.timestamp,
    'LOG_EVENT',
    l.level,
    l.category,
    `"${l.message.replace(/"/g, '""')}"`,
    l.source || ''
  ]);

  const alertRows = alerts.map(a => [
    a.timestamp,
    'SYSTEM_ALERT',
    a.severity.toUpperCase(),
    a.type,
    `"${a.message.replace(/"/g, '""')}"`,
    `Triggered at ${a.value}% (Threshold: ${a.threshold}%)`
  ]);

  const csvContent = [
    `# Velclaw Hosting Platform - Audit & Event Logs Export`,
    `# Generated: ${new Date().toISOString()}`,
    headers.join(','),
    ...logRows.map(r => r.join(',')),
    ...alertRows.map(r => r.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `velclaw-audit-logs-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
