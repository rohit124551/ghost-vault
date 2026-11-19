function isConfiguredOwner(user, ownerEmail = process.env.OWNER_EMAIL) {
  return !!(ownerEmail && user?.email && user.email.toLowerCase() === ownerEmail.toLowerCase());
}

function guestsCanAccess(room, now = Date.now()) {
  const visibility = room?.visibility || 'shared';
  return !!(room && visibility === 'shared' && room.is_active && !room.is_paused
    && (!room.expires_at || new Date(room.expires_at).getTime() > now));
}

async function resolveOwner(supabase, accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return null;
  const { data, error } = await supabase.auth.getUser(accessToken);
  return !error && isConfiguredOwner(data?.user) ? data.user : null;
}

module.exports = { isConfiguredOwner, guestsCanAccess, resolveOwner };
