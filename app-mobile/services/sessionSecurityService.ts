/**
 * sessionSecurityService — Auto-generated service stub
 * TODO: Implement full service
 */

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function formatTimestamp(ts: any): string {
  return new Date(ts).toLocaleString();
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active': return '#4CAF50';
    case 'pending': return '#FF9800';
    case 'error': return '#F44336';
    default: return '#999';
  }
}

export default {};
