/**
 * Token generation — uses unambiguous chars (no 0/O/1/l)
 * e.g. "x9k2", "mq3p"
 */
function generateToken(length = 4) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

module.exports = { generateToken };
