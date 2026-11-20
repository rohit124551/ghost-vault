const express = require('express');
const fs = require('node:fs/promises');
const {randomUUID} = require('node:crypto');
const db = require('../lib/supabase');
const roomAccess = require('../middleware/roomAccess');
const {guestsCanAccess} = require('../lib/roomAccess');
const {broadcastRoomEvent} = require('../lib/roomEvents');
const {directory, filePath, removeTransfer, sweep} = require('../lib/temporaryFiles');

const router = express.Router({mergeParams:true});
const MiB = 1024 ** 2;
const hour = 3600000;
const chunkSize = 4 * MiB;
const sessions = new Map();
const tickets = new Map();
const route = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
const fail = (status,message) => { throw Object.assign(new Error(message), {status}); };
async function message(roomId,id) {
  const {data,error} = await db.from('messages').select('*').eq('room_id',roomId).eq('id',id).maybeSingle();
  if (error) throw error;
  if (!data) fail(404,'Message unavailable');
  return data;
}
async function publish(req,row,created) {
  const token = req.params.token;
  await broadcastRoomEvent(req.app.get('io'),token,created ? 'new_message' : 'chat_patch',
    created ? {...row,roomToken:token} : {token,ids:[row.id],patch:{transfer:row.transfer,content:row.content}});
}
async function cleanup() {
  for (const [id,s] of sessions) {
    if (!s.busy && Math.min(s.expires,s.lastActive + hour) <= Date.now()) {
      sessions.delete(id);
      await removeTransfer(s);
    }
  }
  for (const [id,t] of tickets) if (t.until <= Date.now()) tickets.delete(id);
  await sweep();
}
const housekeeping = () => cleanup().catch(err => console.error('Transfer cleanup:',err.message));
housekeeping();
setInterval(housekeeping,60000).unref();

// Native browser downloads can stream directly to disk with a single-use ticket.
router.get('/download/:ticket',route(async (req,res) => {
  const ticket = tickets.get(req.params.ticket);
  if (!ticket || ticket.token !== req.params.token || ticket.until <= Date.now()) fail(410,'Download link expired');
  tickets.delete(req.params.ticket);
  if (!ticket.owner) {
    const {data} = await db.from('rooms').select('*').eq('id',ticket.room).single();
    if (!guestsCanAccess(data)) fail(403,'Room unavailable');
  }
  const {transfer} = await message(ticket.room,ticket.message);
  if (!transfer?.key || transfer.expires <= Date.now()) fail(410,'File expired');
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Type':'application/octet-stream'});
  res.download(filePath(transfer.key),transfer.name);
}));
router.use(roomAccess);
router.post('/requests',route(async (req,res) => {
  if (!req.owner || !guestsCanAccess(req.room)) fail(403,'Open a shared room to request a file');
  const {limitMiB,hours} = req.body;
  if (!Number.isSafeInteger(limitMiB) || limitMiB < 1 || !Number.isSafeInteger(limitMiB * MiB) || ![1,24].includes(hours)) fail(400,'Invalid size or expiry');
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const disk = await fs.statfs(directory);
  if (limitMiB * MiB > disk.bavail * disk.bsize - 64 * MiB) fail(507,'Insufficient temporary disk space');
  const {data,error} = await db.from('messages').insert({room_id:req.room.id,sender:'owner',type:'text',
    content:'File requested: up to ' + limitMiB + ' MiB',transfer:{state:'open',limit:limitMiB * MiB,expires:Date.now()+hours*hour}}).select().single();
  if (error) throw error;
  await publish(req,data,true);
  res.status(201).json(data);
}));
router.post('/sessions',route(async (req,res) => {
  const {requestId,size,name,replyId,thread} = req.body;
  if (!Number.isSafeInteger(size) || size <= 0 || typeof name !== 'string' || !name.trim() || name.length > 255) fail(400,'Invalid file');
  let expires = Date.now()+24*hour;
  if (!req.owner && !requestId && size > 25 * MiB) fail(413,'Files over 25 MiB need an owner upload request');
  if (requestId) {
    if (req.owner) fail(403,'This request is for guest uploads');
    const {transfer} = await message(req.room.id,requestId);
    if (transfer?.state !== 'open' || transfer.expires <= Date.now()) fail(410,'Request used or expired');
    if (size > transfer.limit) fail(413,'File exceeds the requested limit');
    expires = transfer.expires;
  } else if (replyId) await message(req.room.id,replyId);
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const disk = await fs.statfs(directory);
  let reserved = 0;
  for (const s of sessions.values()) {
    if (requestId && s.requestId === requestId) fail(409,'An upload is already in progress');
    reserved += s.size - s.offset;
  }
  if (size + reserved + 64*MiB > disk.bavail * disk.bsize) fail(507,'Insufficient temporary disk space');
  const id = randomUUID();
  sessions.set(id,{room:req.room.id,owner:!!req.owner,requestId,replyId,thread:thread === true,name,size,expires,key:expires+'-'+id,offset:0,lastActive:Date.now()});
  res.status(201).json({id,chunkSize});
}));
function session(req) {
  const s = sessions.get(req.params.session);
  if (!s || s.room !== req.room.id || s.owner !== !!req.owner || s.expires <= Date.now()) fail(410,'Upload expired');
  if (s.busy) fail(409,'Upload busy');
  return s;
}
router.put('/sessions/:session',(req,res,next) => {
  const s = session(req);
  if (Number(req.headers['content-length']) > Math.min(chunkSize,s.size-s.offset)) return res.status(413).json({error:'Chunk exceeds remaining size'});
  next();
},express.raw({type:'application/octet-stream',limit:chunkSize,inflate:false}),route(async (req,res) => {
  const s = session(req);
  if (!Buffer.isBuffer(req.body) || !req.body.length || Number(req.query.offset) !== s.offset || s.offset + req.body.length > s.size) fail(400,'Invalid upload chunk');
  s.busy = true;
  try {
    const handle = await fs.open(filePath(s.key),s.offset ? 'r+' : 'w',0o600);
    try {
      let written = 0;
      while (written < req.body.length) {
        const result = await handle.write(req.body,written,req.body.length-written,s.offset+written);
        written += result.bytesWritten;
      }
    } finally { await handle.close(); }
    s.offset += req.body.length;
    s.lastActive = Date.now();
    res.json({offset:s.offset});
  } finally { s.busy = false; }
}));
router.delete('/sessions/:session',route(async (req,res) => {
  const s = session(req);
  sessions.delete(req.params.session);
  await removeTransfer(s);
  res.sendStatus(204);
}));
router.post('/sessions/:session/finish',route(async (req,res) => {
  const s = session(req);
  if (s.offset !== s.size) fail(409,'File is incomplete');
  s.busy = true;
  try {
    const transfer = {state:'ready',key:s.key,name:s.name,size:s.size,expires:s.expires,ownerOnly:!!s.requestId};
    const content = 'Temporary file: '+s.name;
    const query = s.requestId ? db.from('messages').update({transfer,content}).eq('id',s.requestId)
      .eq('room_id',s.room).eq('transfer->>state','open') :
      db.from('messages').insert({room_id:s.room,type:'text',sender:s.owner ? 'owner' : 'guest',content,transfer,reply_to_id:s.replyId || null,is_thread_reply:!!s.replyId && s.thread});
    const {data,error} = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) fail(410,'Upload request is no longer available');
    sessions.delete(req.params.session);
    await publish(req,data,!s.requestId);
    res.json(data);
  } finally { s.busy = false; }
}));
router.post('/:id/ticket',route(async (req,res) => {
  const {transfer} = await message(req.room.id,req.params.id);
  if (!transfer?.key || transfer.expires <= Date.now()) fail(410,'File expired');
  if ((transfer.ownerOnly ?? transfer.fromGuest) && !req.owner) fail(403,'Only the owner can download this upload');
  await fs.access(filePath(transfer.key)).catch(() => fail(410,'Temporary file unavailable'));
  const id = randomUUID();
  tickets.set(id,{room:req.room.id,token:req.params.token,message:req.params.id,owner:!!req.owner,until:Date.now()+60000});
  res.set('Cache-Control','no-store').json({ticket:id});
}));
router.use((err,req,res,next) => {
  if (err.status === 507 || err.code === 'ENOSPC') return res.status(507).json({error:'Insufficient temporary disk space'});
  next(err);
});
module.exports = router;
