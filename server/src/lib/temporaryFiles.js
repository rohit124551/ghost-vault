const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const directory = path.resolve(process.env.TRANSFER_DIR || path.join(os.tmpdir(), 'ghostvault-transfers'));
const filePath = (key) => {
  if (!/^\d{13}-[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid transfer key');
  return path.join(directory, key);
};
async function removeTransfer(transfer) {
  if (transfer?.key) await fs.rm(filePath(transfer.key), {force:true});
}
async function sweep() {
  await fs.mkdir(directory, {recursive:true, mode:0o700});
  for (const name of await fs.readdir(directory)) {
    if (/^\d{13}-[a-f0-9-]{36}$/.test(name) && Number(name.slice(0,13)) <= Date.now()) {
      await fs.rm(filePath(name), {force:true});
    }
  }
}
module.exports = {directory, filePath, removeTransfer, sweep};
