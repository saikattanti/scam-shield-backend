require('dotenv').config();
const { Pool } = require('@neondatabase/serverless');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

console.log('DATABASE_URL:', process.env.DATABASE_URL.substring(0, 50) + '...');
console.log('DATABASE_URL type:', typeof process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

console.log('Pool created');

pool.query('SELECT NOW()')
  .then(result => {
    console.log('✅ Query successful:', result.rows[0]);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Query error:', err.message);
    console.error('Error code:', err.code);
    process.exit(1);
  });
