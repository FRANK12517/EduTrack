'use strict';

function category(error) {
  switch (error?.code) {
    case 'ENOTFOUND': return 'ENDPOINT';
    case 'ECONNREFUSED': case 'ETIMEDOUT': case 'ECONNRESET': case '57P01': return 'NETWORK';
    case '28P01': case '28000': return 'AUTHENTICATION';
    case '3D000': return 'DATABASE';
    case 'HANDSHAKE_SSL_ERROR': case 'DEPTH_ZERO_SELF_SIGNED_CERT': case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE': case 'SELF_SIGNED_CERT_IN_CHAIN': return 'TLS';
    default: return /^[A-Z0-9_]{1,64}$/.test(error?.code || '') ? `UNCLASSIFIED_${error.code}` : 'UNKNOWN';
  }
}

async function verify(pool) {
  try {
    await pool.query('SELECT version()');
    console.log('PostgreSQL connectivity verified.');
  } catch (error) {
    console.error(`PostgreSQL connectivity failed: ${category(error)}.`);
    process.exitCode = 1;
  }
}

module.exports = { category, verify };
