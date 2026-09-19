'use strict';

const UNSAFE = /\b(?:insert|update|delete|replace|create|alter|drop|truncate|rename|grant|revoke|call|load|lock|unlock|set|into|outfile|dumpfile)\b/i;

function normalize(sql) {
  if (typeof sql !== 'string') throw new Error('Production preflight accepts SQL strings only');
  const value = sql.trim();
  if (!value || value.includes(';')) throw new Error('Production preflight rejects empty or multi-statement SQL');
  if (/^(?:--|#|\/\*)/.test(value) || /\/\*|--|#/.test(value)) throw new Error('Production preflight rejects SQL comments');
  return value;
}

function assertReadOnly(sql) {
  const value = normalize(sql);
  if (!/^(?:select|show|describe|explain)\b/i.test(value) || UNSAFE.test(value)) {
    throw new Error('Production preflight rejected a non-read-only SQL statement');
  }
  return value;
}

function readonly(connection) {
  return {
    async query(sql, values) { return connection.query(assertReadOnly(sql), values); },
    async end() { return connection.end(); }
  };
}

module.exports = { assertReadOnly, readonly };
