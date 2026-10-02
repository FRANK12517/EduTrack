'use strict';

function category(error) {
  switch (error?.code) {
    case 'ENOTFOUND': return 'ENDPOINT';
    case 'ECONNREFUSED': case 'ETIMEDOUT': case 'ECONNRESET': case 'PROTOCOL_CONNECTION_LOST': return 'NETWORK';
    case 'ER_ACCESS_DENIED_ERROR': return 'AUTHENTICATION';
    case 'ER_BAD_DB_ERROR': return 'DATABASE';
    case 'HANDSHAKE_SSL_ERROR': case 'DEPTH_ZERO_SELF_SIGNED_CERT': case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE': return 'TLS';
    default: {
      // Driver error codes are protocol tokens, not connection metadata.  Do
      // not emit arbitrary messages, which can contain a host or user name.
      return /^[A-Z0-9_]{1,64}$/.test(error?.code || '') ? `UNCLASSIFIED_${error.code}` : 'UNKNOWN';
    }
  }
}
async function verify(pool) {
  try {
    await pool.query('SELECT VERSION()');
    console.log('TiDB connectivity verified.');
  } catch (error) {
    // Keep CI useful without leaking a driver message, endpoint, user, URL, or CA data.
    console.error(`TiDB connectivity failed: ${category(error)}.`);
    process.exitCode = 1;
  }
}
module.exports = { category, verify };
