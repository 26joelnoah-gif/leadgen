/**
 * Converts an array of objects to a CSV string and triggers a download.
 * @param {Array} data - The data to export
 * @param {string} filename - The name of the file (without extension)
 */
export function exportToCSV(data, filename = 'export') {
  if (!data || !data.length) {
    console.error('No data to export');
    return;
  }

  // Get keys from first object
  const headers = Object.keys(data[0]);
  
  // Build CSV rows
  const rows = data.map(obj => {
    return headers.map(header => {
      let val = obj[header] || '';
      // Escape quotes and wrap in quotes if contains comma
      if (typeof val === 'string') {
        val = val.replace(/"/g, '""');
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val}"`;
        }
      }
      return val;
    }).join(',');
  });

  // Combine headers and rows
  const csvContent = [headers.join(','), ...rows].join('\n');
  
  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
