#!/usr/bin/env node
'use strict';

const { getPool, closePool } = require('../lib/postgres-pool');
const { verify } = require('../lib/postgres-connectivity-diagnostic');

if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required');
verify(getPool()).finally(closePool);
