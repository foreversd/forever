//
// ### function randomString (length)
// #### @length {integer} The number of bits for the random base64 string returned to contain
// randomString returns a pseude-random ASCII string (subset)
// the return value is a string of length ⌈bits/6⌉ of characters
// from the base64 alphabet.
//
function randomString(length) {
  let rand, i, ret, bits;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const mod = 4;

  ret = '';
  // standard 4
  // default is 16
  bits = length * mod || 64;

  // in v8, Math.random() yields 32 pseudo-random bits (in spidermonkey it gives 53)
  while (bits > 0) {
    // 32-bit integer
    rand = Math.floor(Math.random() * 0x100000000);
    //we use the top bits
    for (i = 26; i > 0 && bits > 0; i -= mod, bits -= mod) {
      ret += chars[0x3f & (rand >>> i)];
    }
  }

  return ret;
}

module.exports = {
  randomString,
};
