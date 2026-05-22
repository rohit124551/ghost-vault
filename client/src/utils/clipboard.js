import toast from 'react-hot-toast';

export const copyToClipboard = async (text, successMessage = 'Copied to clipboard') => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      if (successMessage) toast.success(successMessage);
      return true;
    } else {
      // Fallback for non-secure contexts (http:// instead of https://)
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Prevent scrolling to bottom
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        if (successMessage) toast.success(successMessage);
        return true;
      } else {
        toast.error('Failed to copy. Please copy manually.');
        return false;
      }
    }
  } catch (err) {
    console.error('Copy fallback failed', err);
    toast.error('Failed to copy. Please copy manually.');
    return false;
  }
};
