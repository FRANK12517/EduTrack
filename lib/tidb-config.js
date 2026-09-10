'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_HOST = 'gateway01.eu-central-1.prod.aws.tidbcloud.com';
const DEFAULT_PORT = 4000;
const DEFAULT_USER = 'zecQwb6NPm9Swji.root';
const DEFAULT_DATABASE = 'edutrack_dev';

function getCaCertificate() {
  if (process.env.DB_CA_CERT) {
    return process.env.DB_CA_CERT.replace(/\\n/g, '\n');
  }

  const localCertPath = path.join(process.cwd(), 'certs', 'ca.pem');
  if (fs.existsSync(localCertPath)) {
    return fs.readFileSync(localCertPath, 'utf-8');
  }

  return undefined;
}

function hasExplicitTiDbConfiguration() {
  return Boolean(process.env.DB_PASSWORD);
}

function getTiDbConnectionOptions() {
  return {
    host: process.env.DB_HOST || DEFAULT_HOST,
    port: Number(process.env.DB_PORT || DEFAULT_PORT),
    user: process.env.DB_USER || DEFAULT_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || DEFAULT_DATABASE,
    ssl: {
      ca: getCaCertificate(),
      rejectUnauthorized: true,
    },
  };
}

module.exports = {
  getCaCertificate,
  getTiDbConnectionOptions,
  hasExplicitTiDbConfiguration,
};
