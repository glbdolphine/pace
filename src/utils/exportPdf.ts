import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LogEntry } from '../types';

export function exportBatchLogsPdf(logs: LogEntry[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setTextColor(24, 75, 48);
  doc.text('Pace IT - Connectivity & Service Request Logs', 14, 15);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${new Date().toLocaleString()} | Total Logs: ${logs.length}`, 14, 21);

  const tableRows = logs.map((l) => [
    `#${l.logNo}`,
    l.date || '—',
    l.nameEn || l.customerName || '—',
    l.resellerName || '—',
    l.resellerPhone || '—',
    l.headTeacherName ? `${l.headTeacherName}${l.headTeacherPhone ? ` (${l.headTeacherPhone})` : ''}` : '—',
    l.nmsId || '—',
    l.edcNo || '—',
    [l.upazila, l.unionName].filter(Boolean).join(' / ') || '—',
    l.mac || '—',
    l.routerSerial || '—',
    l.fiberLength ? `${l.fiberLength}m` : '—',
    l.status || '—',
  ]);

  autoTable(doc, {
    startY: 25,
    head: [[
      'Log #', 'Date', 'Institute Name', 'Reseller', 'Reseller Phone',
      'Head Teacher / In-Charge', 'NMS ID', 'EDC No', 'Upazila / Union',
      'MAC', 'Router Serial', 'Fiber', 'Status',
    ]],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [24, 75, 48], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 249, 246] },
  });

  doc.save(`Pace_IT_Logs_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportSingleLogPdf(log: LogEntry): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.setTextColor(24, 75, 48);
  doc.text('Pace IT - Connectivity Request Log', 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Log #${log.logNo} | Date: ${log.date || '—'}`, 14, 25);

  const rows = [
    ['Log No.', `#${log.logNo}`],
    ['Date', log.date || '—'],
    ['Reseller Name', log.resellerName || '—'],
    ['Reseller Phone', log.resellerPhone || '—'],
    ['Customer / Institute Name', log.nameEn || log.customerName || '—'],
    ['Head Teacher / In-Charge Name', log.headTeacherName || '—'],
    ['Head Teacher Phone', log.headTeacherPhone || '—'],
    ['Upazila / City Corporation', log.upazila || '—'],
    ['Union / Ward / Pouroshova', log.unionName || '—'],
    ['Lat & Long', [log.lat, log.long].filter(Boolean).join(', ') || '—'],
    ['NMS ID', log.nmsId || '—'],
    ['EDC Book No.', log.edcNo || '—'],
    ['Wi-Fi Router Serial No.', log.routerSerial || '—'],
    ['MAC Address', log.mac || '—'],
    ['Optical Fiber Length (m)', log.fiberLength ? `${log.fiberLength} m` : '—'],
    ['Request Type', log.requestType || '—'],
    ['Status', log.status || '—'],
    ['Issue Found', log.issueFound || '—'],
    ['Missing / Wrong Details', log.missingWrongDetails || '—'],
    ['Action Taken', log.actionTaken || '—'],
    ['Reason for Action', log.reasonForAction || '—'],
    ['Reseller Informed', log.resellerInformed || '—'],
    ['Follow-up Needed', log.followUpNeeded || '—'],
    ['Supervisor Informed', log.supervisorInformed || '—'],
    ['Remarks', log.remarks || '—'],
  ];

  autoTable(doc, {
    startY: 30,
    head: [['Field', 'Details']],
    body: rows,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [24, 75, 48], textColor: [255, 255, 255] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  doc.save(`Pace_IT_Log_${log.logNo}_${(log.nameEn || log.customerName || 'record').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}
