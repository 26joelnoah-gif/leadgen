export const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const formatTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return `${formatDate(dateString)} ${formatTime(dateString)}`;
};

export const getTimeAgo = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " jaar geleden";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " maanden geleden";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " dagen geleden";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " uur geleden";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minuten geleden";
  return "zojuist";
};