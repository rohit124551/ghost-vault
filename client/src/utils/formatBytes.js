export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const validI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, validI)).toFixed(1))} ${sizes[validI]}`;
}
