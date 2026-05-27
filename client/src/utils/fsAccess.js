import { get, set, del } from 'idb-keyval';

const DIRECTORY_HANDLE_KEY = 'ghostvault_download_dir';

// Check if the browser supports the File System Access API
export const isFileSystemAccessSupported = () => {
  return 'showDirectoryPicker' in window;
};

// Prompt user to select a directory
export const selectDownloadDirectory = async () => {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'ghostvault_downloads',
      startIn: 'downloads' // Suggest starting in the Downloads folder
    });
    // Save the handle to IndexedDB for future sessions
    await set(DIRECTORY_HANDLE_KEY, handle);
    return handle;
  } catch (error) {
    // Ignore AbortError (user cancelled)
    if (error.name !== 'AbortError') {
      console.error('Error selecting directory:', error);
      throw error;
    }
    return null;
  }
};

// Retrieve the stored directory handle
export const getDownloadDirectory = async () => {
  try {
    return await get(DIRECTORY_HANDLE_KEY);
  } catch (error) {
    console.error('Error retrieving directory handle:', error);
    return null;
  }
};

// Clear the stored directory handle
export const clearDownloadDirectory = async () => {
  await del(DIRECTORY_HANDLE_KEY);
};

// Verify we still have permission to read/write to the directory
export const verifyPermission = async (fileHandle, withWrite = true) => {
  const options = { mode: withWrite ? 'readwrite' : 'read' };
  
  // Check if we already have permission
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  
  // Request permission to the directory
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  
  return false;
};

// Write a blob directly to the selected directory
export const saveFileToDirectory = async (directoryHandle, filename, blob) => {
  try {
    // Get a reference to the file inside the directory (creates it if it doesn't exist)
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    
    // Create a writable stream
    const writable = await fileHandle.createWritable();
    
    // Write the contents of the blob
    await writable.write(blob);
    
    // Close the file and write it to disk
    await writable.close();
    
    return true;
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
};
