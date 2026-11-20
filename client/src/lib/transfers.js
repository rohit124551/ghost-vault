import api from './api';

export const guestAttachmentBytes = 25 * 1024 ** 2;
export const cloudAttachmentBytes = 10 * 1024 ** 2;
export const transferPath = token => '/api/rooms/' + encodeURIComponent(token) + '/transfers';

export async function uploadTemporaryFile(client, token, file, options, onProgress) {
  const root = transferPath(token);
  const {data:session} = await client.post(root + '/sessions', {name:file.name,size:file.size,...options});
  const path = root + '/sessions/' + session.id;
  try {
    for (let offset = 0; offset < file.size; offset += session.chunkSize) {
      const chunk = file.slice(offset, offset + session.chunkSize);
      await client.put(path, chunk, {
        params:{offset}, headers:{'Content-Type':'application/octet-stream'},
        onUploadProgress:event => onProgress?.({loaded:offset+event.loaded,total:file.size})
      });
    }
    const {data} = await client.post(path + '/finish');
    return data;
  } catch (error) {
    await client.delete(path).catch(() => {});
    throw error;
  }
}

export async function downloadTransfer(client, token, id) {
  const root = transferPath(token);
  const {data} = await client.post(root + '/' + id + '/ticket');
  const link = document.createElement('a');
  link.href = new URL(root + '/download/' + data.ticket, api.defaults.baseURL || location.origin).href;
  link.click();
}
