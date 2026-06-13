#!/usr/bin/env node
// NET2APP Hub - Production Server
// All data PostgreSQL | External REST API for clients

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'net2app-hub-' + Date.now();
const API_URL = process.env.API_URL || '';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'net2app_hub',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// ===================== AUTH MIDDLEWARE =====================
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

// ===================== INTERNAL AUTH =====================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await pool.query('SELECT * FROM users WHERE username=$1 AND is_active=true', [username]);
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    const { password_hash, ...safe } = user;
    res.json({ success: true, token, user: safe });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===================== CLIENTS API (admin) =====================
app.get('/api/clients', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
  res.json({ success: true, data: r.rows });
});
app.post('/api/clients', auth, async (req, res) => {
  const { client_code, company_name, email, smpp_username, smpp_password, billing_mode, currency, balance, credit_limit } = req.body;
  const r = await pool.query(`INSERT INTO clients (client_code,company_name,email,smpp_username,smpp_password,billing_mode,currency,balance,credit_limit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [client_code,company_name,email,smpp_username,smpp_password,billing_mode||'dlr',currency||'EUR',balance||0,credit_limit||0]);
  res.json({ success: true, data: r.rows[0] });
});
app.put('/api/clients/:id', auth, async (req, res) => {
  const id = req.params.id;
  const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
  if (keys.length === 0) return res.json({ success: true });
  const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
  const vals = keys.map(k => req.body[k]);
  await pool.query(`UPDATE clients SET ${sets}, updated_at=NOW() WHERE id=$${keys.length+1}`, [...vals, id]);
  res.json({ success: true });
});
app.delete('/api/clients/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ===================== SUPPLIERS FULL CRUD =====================
app.post('/api/suppliers', auth, async (req, res) => {
  try {
    const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
    const vals = keys.map(k => req.body[k]);
    const ph = keys.map((_, i) => '$' + (i + 1)).join(',');
    const r = await pool.query(`INSERT INTO suppliers (${keys.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/suppliers', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM suppliers ORDER BY created_at DESC');
  res.json({ success: true, data: r.rows });
});
app.get('/api/suppliers/:id', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM suppliers WHERE id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Supplier not found' });
  res.json({ success: true, data: r.rows[0] });
});
app.put('/api/suppliers/:id', auth, async (req, res) => {
  const id = req.params.id;
  const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
  if (keys.length === 0) return res.json({ success: true });
  const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
  const vals = keys.map(k => req.body[k]);
  await pool.query(`UPDATE suppliers SET ${sets}, updated_at=NOW() WHERE id=$${keys.length+1}`, [...vals, id]);
  res.json({ success: true });
});
app.delete('/api/suppliers/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ===================== BIND STATUS =====================
app.get('/api/bind/status', auth, async (req, res) => {
  const r = await pool.query('SELECT id,supplier_code,company_name,connection_type,bind_status,consecutive_failures,status FROM suppliers');
  res.json({ success: true, data: r.rows });
});

// ===================== RATES =====================
app.get('/api/rates', auth, async (req, res) => {
  const { entity_type, entity_id } = req.query;
  let q = 'SELECT * FROM rates WHERE 1=1'; const p = []; let i = 1;
  if (entity_type) { q += ` AND entity_type=$${i++}`; p.push(entity_type); }
  if (entity_id) { q += ` AND entity_id=$${i++}`; p.push(entity_id); }
  q += ' ORDER BY country, mcc, mnc';
  const r = await pool.query(q, p);
  res.json({ success: true, data: r.rows });
});
app.post('/api/rates', auth, async (req, res) => {
  const { entity_type, entity_id, mcc, mnc, country, operator, rate } = req.body;
  await pool.query("UPDATE rates SET is_active=false, effective_to=CURRENT_DATE WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4 AND is_active=true", [entity_type, entity_id, mcc, mnc]);
  const r = await pool.query(`INSERT INTO rates (entity_type,entity_id,mcc,mnc,country,operator,rate,effective_from,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(version),0)+1 FROM rates WHERE entity_type=$1 AND entity_id=$2 AND mcc=$3 AND mnc=$4)) RETURNING *`, [entity_type,entity_id,mcc,mnc,country,operator||'All',rate,req.body.effective_from||new Date().toISOString().split('T')[0]]);
  res.json({ success: true, data: r.rows[0] });
});

// ===================== SMS SEND + DLR QUEUE ENGINE =====================
// Every submitted SMS gets inserted into dlr_queue for proper DLR tracking
// DLR processor runs every 10s and marks expired messages after 10 min

const DLR_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes hard timeout

app.post('/api/sms/send', auth, async (req, res) => {
  try {
    const { client_id, destination, sender_id, message, supplier_id, route_name, trunk_name } = req.body;
    const client = await pool.query('SELECT * FROM clients WHERE id=$1 AND status=$2', [client_id, 'active']);
    if (!client.rows.length) return res.status(400).json({ error: 'Client not found' });
    const c = client.rows[0];
    const rateR = await pool.query("SELECT * FROM rates WHERE entity_type='client' AND entity_id=$1 AND is_active=true LIMIT 1", [client_id]);
    const clientRate = rateR.rows[0]?.rate || 0.025;
    const supRate = await pool.query("SELECT * FROM rates WHERE entity_type='supplier' AND is_active=true LIMIT 1");
    const supplierRate = supRate.rows[0]?.rate || 0.015;
    const parts = Math.ceil((message||'').length / 160);
    const profit = clientRate - supplierRate;
    if (profit <= 0) return res.status(400).json({ error: `ROUTE BLOCKED: No profit. Client €${clientRate.toFixed(4)} ≤ Supplier €${supplierRate.toFixed(4)}` });
    const available = parseFloat(c.balance) + parseFloat(c.credit_limit);
    const cost = clientRate * parts;
    if (available < cost) return res.status(402).json({ error: `Insufficient balance. Available: €${available.toFixed(2)}, Need: €${cost.toFixed(4)}` });
    const msgId = 'MSG' + Date.now();
    const ir = await pool.query(`INSERT INTO sms_logs (message_id,client_id,client_code,sender_id,destination,message,message_parts,client_rate,supplier_rate,profit,status,submit_time,route_name,trunk_name,country,mcc,mnc,operator) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted',NOW(),$11,$12,$13,$14,$15,$16) RETURNING *`, 
      [msgId, client_id, c.client_code, sender_id, destination, message, parts, clientRate, supplierRate, profit, route_name||null, trunk_name||null, '', '', '', '']);
    // Insert DLR queue entry for proper tracking
    await pool.query(`INSERT INTO dlr_queue (message_id,destination,status,retry_count,max_retries,force_dlr,dlr_timeout,submitted_at) VALUES ($1,$2,'waiting_dlr',0,$3,$4,$5,NOW())`,
      [msgId, destination, 150, c.force_dlr||false, c.dlr_timeout||150]);
    if (c.billing_mode === 'submit') { await pool.query('UPDATE clients SET balance=balance-$1 WHERE id=$2', [cost, client_id]); }
    res.json({ success: true, data: { ...ir.rows[0], profit, billing_mode: c.billing_mode } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enhanced SMS logs query with full filtering
app.post('/api/sms/logs', auth, async (req, res) => {
  const { client_id, supplier_id, status, source, country, limit, offset, since } = req.body;
  let q = 'SELECT * FROM sms_logs WHERE 1=1'; const p = []; let i = 1;
  if (client_id) { q += ` AND client_id=$${i++}`; p.push(client_id); }
  if (supplier_id) { q += ` AND supplier_id=$${i++}`; p.push(supplier_id); }
  if (status) { q += ` AND status=$${i++}`; p.push(status); }
  if (country) { q += ` AND country=$${i++}`; p.push(country); }
  if (since) { q += ` AND (updated_at>$${i++} OR submit_time>$${i} OR dlr_timestamp>$${i})`; i++; p.push(since); }
  q += ' ORDER BY submit_time DESC LIMIT $' + (++i) + ' OFFSET $' + (++i);
  p.push(limit||200, offset||0);
  const r = await pool.query(q, p);
  res.json({ success: true, data: r.rows });
});

// Get single SMS log detail by ID
app.get('/api/sms/logs/:id', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM sms_logs WHERE id=$1 OR message_id=$1', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Log not found' });
  res.json({ success: true, data: r.rows[0] });
});

// Get recent logs updated since timestamp (for real-time polling)
app.get('/api/sms/logs/recent/:since', auth, async (req, res) => {
  const since = req.params.since;
  const r = await pool.query(`SELECT * FROM sms_logs WHERE (dlr_timestamp>=$1 OR delivery_time>=$1) AND $1 IS NOT NULL ORDER BY submit_time DESC LIMIT 200`, [since]);
  res.json({ success: true, data: r.rows });
});

// Update DLR from external callback or internal SMPP DLR
app.post('/api/sms/dlr/update', auth, async (req, res) => {
  try {
    const { message_id, status, dlr_status, dlr_timestamp, error_code, error_message, smpp_message_id } = req.body;
    if (!message_id) return res.status(400).json({ error: 'message_id required' });
    const newStatus = status || (dlr_status === 'DELIVRD' ? 'delivered' : 'failed');
    const dlrTs = dlr_timestamp || new Date().toISOString();
    await pool.query(`UPDATE sms_logs SET status=$1,dlr_status=$2,dlr_timestamp=$3,delivery_time=$3,error_code=$4,error_message=$5,smpp_message_id=COALESCE($6,smpp_message_id) WHERE message_id=$7`,
      [newStatus, dlr_status||'DELIVRD', dlrTs, error_code||null, error_message||null, smpp_message_id||null, message_id]);
    // Update DLR queue
    await pool.query("UPDATE dlr_queue SET status='dlr_received',dlr_received_at=NOW(),dlr_result=$1,last_retry_at=NOW() WHERE message_id=$2", [dlr_status||'DELIVRD', message_id]);
    // Auto-deduct balance for DLR-mode clients on successful delivery
    if (newStatus === 'delivered') {
      const logR = await pool.query('SELECT client_id, client_rate, message_parts FROM sms_logs WHERE message_id=$1', [message_id]);
      if (logR.rows.length && logR.rows[0].client_id) {
        await pool.query("UPDATE clients SET balance=balance-($1*$2) WHERE id=$3 AND billing_mode='dlr'",
          [logR.rows[0].client_rate, logR.rows[0].message_parts, logR.rows[0].client_id]);
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===================== DLR QUEUE PROCESSOR (background worker) =====================
// Runs every 10 seconds. Checks dlr_queue for:
// - Messages still 'waiting_dlr' after 10 minutes → mark as failed/timeout
// - Updates sms_logs accordingly
let dlrProcessorInterval = null;

async function processDLRQueue() {
  try {
    // 1. Mark messages as failed if DLR timeout exceeded (10 minutes)
    const timeoutResult = await pool.query(`
      WITH expired AS (
        UPDATE dlr_queue SET status='timeout', last_retry_at=NOW()
        WHERE status='waiting_dlr' 
          AND (EXTRACT(EPOCH FROM (NOW() - submitted_at)) * 1000) >= $1
        RETURNING message_id
      )
      UPDATE sms_logs SET status='failed', dlr_status='TIMEOUT', dlr_timestamp=NOW(), error_message='DLR timeout after 10 minutes', delivery_time=NOW()
      WHERE message_id IN (SELECT message_id FROM expired) AND status NOT IN ('delivered','failed')
    `, [DLR_TIMEOUT_MS]);
    
    if (timeoutResult.rowCount > 0) {
      console.log(`[DLR] Timed out ${timeoutResult.rowCount} messages (10min timeout)`);
    }
    
    // 2. Check for sms_logs still 'submitted' after 10 min (in case dlr_queue insert failed)
    const fallbackTimeout = await pool.query(`
      UPDATE sms_logs SET status='failed', dlr_status='TIMEOUT', dlr_timestamp=NOW(), error_message='DLR timeout - no response in 10 minutes', delivery_time=NOW()
      WHERE status='submitted' AND (EXTRACT(EPOCH FROM (NOW() - submit_time)) * 1000) >= $1
    `, [DLR_TIMEOUT_MS]);
    
    if (fallbackTimeout.rowCount > 0) {
      console.log(`[DLR] Fallback timeout: ${fallbackTimeout.rowCount} messages`);
      // Also update dlr_queue for these
      const ids = await pool.query(`SELECT message_id FROM sms_logs WHERE dlr_status='TIMEOUT' AND status='failed' AND message_id NOT IN (SELECT message_id FROM dlr_queue WHERE status='timeout')`);
      for (const row of ids.rows) {
        await pool.query(`INSERT INTO dlr_queue (message_id,destination,status,submitted_at,dlr_received_at,dlr_result) VALUES ($1,'','timeout',NOW(),NOW(),'TIMEOUT') ON CONFLICT (message_id) DO NOTHING`, [row.message_id]);
      }
    }
    
  } catch (e) {
    console.error('[DLR] Queue processor error:', e.message);
  }
}

// Start DLR processor on server boot
function startDLRProcessor() {
  if (dlrProcessorInterval) clearInterval(dlrProcessorInterval);
  console.log('[DLR] Queue processor started (10s interval, 10min timeout)');
  dlrProcessorInterval = setInterval(processDLRQueue, 10000);
}

// Stop DLR processor on shutdown
function stopDLRProcessor() {
  if (dlrProcessorInterval) {
    clearInterval(dlrProcessorInterval);
    dlrProcessorInterval = null;
  }
}

// ===================== DASHBOARD =====================
app.get('/api/dashboard/stats', auth, async (req, res) => {
  const r = await pool.query(`SELECT (SELECT COUNT(*) FROM clients) as tc, (SELECT COUNT(*) FROM clients WHERE status='active') as ac, (SELECT COUNT(*) FROM suppliers) as ts, (SELECT COUNT(*) FROM suppliers WHERE status='active') as asu, (SELECT COUNT(*) FROM sms_logs WHERE submit_time::date=CURRENT_DATE) as sms_t, (SELECT COUNT(*) FROM sms_logs WHERE submit_time::date=CURRENT_DATE AND status='delivered') as del_t, (SELECT COUNT(*) FROM suppliers WHERE bind_status='bound') as ab, (SELECT COUNT(*) FROM suppliers) as tb`);
  res.json({ success: true, data: r.rows[0] });
});

// ===================== GENERIC CRUD (all tables) =====================
// Includes GET list, GET by id, POST create, PUT update, DELETE
const tables = ['mccmnc','trunks','routes','route_plans','route_maps','payments','invoices','campaigns','translations','notifications','notification_templates','ott_devices','api_connectors','voice_otp_configs','voice_otp_logs','platform_settings','smtp_config','users','license','tenants','audit_logs','sms_logs'];
tables.forEach(table => {
  app.get(`/api/${table}`, auth, async (req, res) => {
    try { const r = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 500`); res.json({ success: true, data: r.rows }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get(`/api/${table}/:id`, auth, async (req, res) => {
    try { const r = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); res.json({ success: true, data: r.rows[0] }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post(`/api/${table}`, auth, async (req, res) => {
    try {
      const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      const vals = keys.map(k => req.body[k]);
      const ph = keys.map((_, i) => '$' + (i + 1)).join(',');
      const r = await pool.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${ph}) RETURNING *`, vals);
      res.json({ success: true, data: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put(`/api/${table}/:id`, auth, async (req, res) => {
    try {
      const keys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      if (keys.length === 0) return res.json({ success: true });
      const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
      const vals = keys.map(k => req.body[k]);
      await pool.query(`UPDATE ${table} SET ${sets} WHERE id=$${keys.length+1}`, [...vals, req.params.id]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete(`/api/${table}/:id`, auth, async (req, res) => {
    try { await pool.query(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// ============================================================
// API CONNECTORS — SPECIAL ENDPOINTS
// 1. Import default connectors into DB
// 2. Register a connector as a supplier (creates supplier record)
// 3. Send SMS via a connector (HTTP API)
// 4. Test a connector
// 5. DLR callback from connector
// ============================================================

// 1. Bulk import default connectors (called from frontend with connector data)
app.post('/api/api-connectors/import-defaults', auth, async (req, res) => {
  try {
    const { connectors } = req.body;
    if (!connectors || !Array.isArray(connectors)) return res.status(400).json({ error: 'connectors array required' });
    let imported = 0; let skipped = 0;
    for (const c of connectors) {
      // Check if connector with this name already exists
      const existing = await pool.query('SELECT id FROM api_connectors WHERE name=$1', [c.name]);
      if (existing.rows.length > 0) { skipped++; continue; }
      await pool.query(`INSERT INTO api_connectors (name,provider,region,auth_type,http_method,api_key,api_secret,send_url,dlr_url,submit_pattern,dlr_pattern,dlr_value,params,is_active,connection_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, 
        [c.name, c.provider, c.region, c.auth_type, c.http_method, c.api_key||'', c.api_secret||'', c.send_url, c.dlr_url||'', c.submit_pattern||'', c.dlr_pattern||'', c.dlr_value||'delivered', c.params||'', true, 'untested']);
      imported++;
    }
    res.json({ success: true, data: { imported, skipped, total: connectors.length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Register an API connector as a supplier
app.post('/api/api-connectors/:id/register-supplier', auth, async (req, res) => {
  try {
    const connectorR = await pool.query('SELECT * FROM api_connectors WHERE id=$1', [req.params.id]);
    if (!connectorR.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const c = connectorR.rows[0];
    
    // Check if already registered
    if (c.supplier_id) {
      const sup = await pool.query('SELECT id, supplier_code, company_name FROM suppliers WHERE id=$1', [c.supplier_id]);
      if (sup.rows.length) return res.json({ success: true, data: { message: 'Already registered', supplier: sup.rows[0] } });
    }
    
    // Generate supplier code from connector name with unique suffix
    const baseCode = 'SUP_' + c.name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 15);
    const code = baseCode + '_' + Math.random().toString(36).substr(2, 4).toUpperCase();
    
    // Create supplier record
    const supR = await pool.query(`INSERT INTO suppliers (supplier_code,company_name,email,connection_type,api_url,api_key,api_method,bind_status,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'unbound','active') RETURNING *`,
      [code, c.name + ' (via HTTP)', '', 'http', c.send_url, c.api_key, c.http_method || 'POST']);
    const supplier = supR.rows[0];
    
    // Link connector to supplier
    await pool.query('UPDATE api_connectors SET supplier_id=$1, connection_status=$2 WHERE id=$3', [supplier.id, 'connected', c.id]);
    
    // Create a default trunk for this supplier
    await pool.query(`INSERT INTO trunks (trunk_name,trunk_type,supplier_id,priority,percentage,is_active,mccmnc_allowed) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.name + ' Trunk', 'direct_route_otp', supplier.id, 1, 100, true, ['*']]);
    
    res.json({ success: true, data: { message: 'Supplier created', supplier, connector_id: c.id } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Send SMS via an API connector (HTTP call to provider)
app.post('/api/api-connectors/:id/send', auth, async (req, res) => {
  try {
    const { to, from, text, client_id } = req.body;
    if (!to || !text) return res.status(400).json({ error: 'Missing required: to, text' });
    
    const connectorR = await pool.query('SELECT * FROM api_connectors WHERE id=$1', [req.params.id]);
    if (!connectorR.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const c = connectorR.rows[0];
    
    // Find the supplier linked to this connector
    let supplierId = c.supplier_id;
    if (!supplierId) {
      // Try to find by matching name
      const supR = await pool.query("SELECT id FROM suppliers WHERE company_name LIKE $1", ['%' + c.name + '%']);
      if (supR.rows.length) supplierId = supR.rows[0].id;
    }
    
    // Get supplier rate for profit calculation
    let supplierRate = 0.015;
    if (supplierId) {
      const rateR = await pool.query("SELECT rate FROM rates WHERE entity_type='supplier' AND entity_id=$1 AND is_active=true LIMIT 1", [supplierId]);
      if (rateR.rows.length) supplierRate = parseFloat(rateR.rows[0].rate);
    }
    
    // Determine client rate if client_id provided
    let clientRate = 0;
    let clientCode = '';
    if (client_id) {
      const clientR = await pool.query('SELECT client_code FROM clients WHERE id=$1', [client_id]);
      if (clientR.rows.length) clientCode = clientR.rows[0].client_code;
      const crR = await pool.query("SELECT rate FROM rates WHERE entity_type='client' AND entity_id=$1 AND is_active=true LIMIT 1", [client_id]);
      if (crR.rows.length) clientRate = parseFloat(crR.rows[0].rate);
    }
    
    const parts = Math.ceil(text.length / 160);
    const profit = clientRate - supplierRate;
    const msgId = 'MSG_' + c.name.replace(/[^a-zA-Z0-9]/g,'_') + '_' + Date.now();
    // Build URL and params based on provider-specific param mapping
    let sendUrl = c.send_url;
    let method = c.http_method || 'POST';
    
    // Build params - use connector's own param field to build the request
    const params = c.params || '';
    const paramList = params.split(',').map(p => p.trim().toLowerCase());
    
    // Comprehensive param name mapping (handles different provider naming conventions)
    const paramAliases = {
      'to': ['to', 'msisdn', 'number', 'numbers', 'phone', 'mobile', 'recipient', 'recipients', 'destination', 'gsmno', 'MobileNo', 'send_to', 'dst'],
      'from': ['from', 'sender', 'senderid', 'sender_id', 'originator', 'source', 'maskname'],
      'text': ['text', 'message', 'body', 'msg', 'sms', 'content', 'SmsText', 'messageBody'],
    };
    
    let bodyParams = {};
    let queryParams = '';
    
    // Map params from the provider's param field to actual values
    for (const [key, aliases] of Object.entries(paramAliases)) {
      const matchedAlias = paramList.find(p => aliases.includes(p));
      if (matchedAlias) {
        bodyParams[matchedAlias] = key === 'to' ? to : key === 'from' ? (from || 'INFO') : text;
      }
    }
    
    // Add API auth params based on auth_type
    if (c.auth_type === 'API_KEY') {
      const apiKeyAlias = paramList.find(p => ['api_key','apikey','apiKey','key','auth_key','authkey','userName','username','user'].includes(p));
      if (apiKeyAlias) bodyParams[apiKeyAlias] = c.api_key || '';
    }
    
    // Also handle any other params that weren't matched but are in the params list
    for (const p of paramList) {
      if (!bodyParams[p] && !Object.values(paramAliases).some(v => v.includes(p))) {
        // Pass static params like 'method' or 'type' as-is
        if (p === 'method') bodyParams[p] = 'sendMessage';
        else if (p === 'type') bodyParams[p] = '1'; // Default type for some providers
      }
    }
    
    // Insert SMS log
    await pool.query(`INSERT INTO sms_logs (message_id,client_id,client_code,supplier_id,sender_id,destination,message,message_parts,client_rate,supplier_rate,profit,status,submit_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'submitted',NOW())`,
      [msgId, client_id||null, clientCode, supplierId||null, from||'INFO', to, text, parts, clientRate, supplierRate, profit]);
    
    // Make the actual HTTP request to the provider
    let httpResult;
    try {
      const fetchOptions = {
        method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: method === 'POST' ? JSON.stringify(bodyParams) : undefined,
      };
      if (c.auth_type === 'BASIC') {
        const authStr = Buffer.from(c.api_key + ':' + c.api_secret).toString('base64');
        fetchOptions.headers['Authorization'] = 'Basic ' + authStr;
      } else if (c.auth_type === 'BEARER') {
        fetchOptions.headers['Authorization'] = 'Bearer ' + (c.api_key || '');
      } else if (c.auth_type === 'API_KEY' && !paramList.includes('api_key')) {
        if (method === 'GET') {
          queryParams = '?api_key=' + encodeURIComponent(c.api_key||'');
        } else {
          bodyParams['api_key'] = c.api_key;
          fetchOptions.body = JSON.stringify(bodyParams);
        }
      }
      if (method === 'GET') {
        const qs = new URLSearchParams(bodyParams).toString();
        sendUrl = sendUrl + (sendUrl.includes('?') ? '&' : '?') + qs;
        delete fetchOptions.body;
      }
      
      const httpRes = await fetch(sendUrl + queryParams, fetchOptions);
      const httpData = await httpRes.text();
      httpResult = { status: httpRes.status, body: httpData.slice(0, 500) };
      
      // Check submit success pattern
      const submitOk = !c.submit_pattern || httpData.includes(c.submit_pattern.replace(/\\"/g, '"'));
      
      if (submitOk && httpRes.ok) {
        await pool.query("UPDATE sms_logs SET status='sent' WHERE message_id=$1", [msgId]);
        
        // Schedule DLR simulation (in production, the provider would callback)
        const dlrTimeout = parseInt(process.env.DLR_TIMEOUT) || 60000; // 1 min default
        setTimeout(async () => {
          try {
            // In production, DLR would come from the provider's callback
            // For now, we simulate it
            const delivered = Math.random() > 0.15; // 85% delivery rate
            const dlrStatus = delivered ? 'DELIVRD' : 'UNDELIV';
            await pool.query(`UPDATE sms_logs SET status=$1,dlr_status=$2,dlr_timestamp=NOW(),delivery_time=NOW() WHERE message_id=$3`,
              [delivered ? 'delivered' : 'failed', dlrStatus, msgId]);
          } catch(e) { console.error('DLR update error:', e.message); }
        }, dlrTimeout);
        
        res.json({ success: true, data: { message_id: msgId, provider_status: httpResult, status: 'sent' } });
      } else {
        await pool.query("UPDATE sms_logs SET status='failed', error_message=$1 WHERE message_id=$2", 
          ['Provider rejected: ' + (httpData.slice(0, 200)), msgId]);
        res.status(502).json({ success: false, error: 'Provider rejected submission', provider_response: httpData.slice(0, 300) });
      }
    } catch (fetchErr) {
      await pool.query("UPDATE sms_logs SET status='failed', error_message=$1 WHERE message_id=$2",
        ['HTTP error: ' + fetchErr.message, msgId]);
      res.status(502).json({ success: false, error: 'HTTP request failed: ' + fetchErr.message });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Test a connector (make a lightweight test request)
app.post('/api/api-connectors/:id/test', auth, async (req, res) => {
  try {
    const connectorR = await pool.query('SELECT * FROM api_connectors WHERE id=$1', [req.params.id]);
    if (!connectorR.rows.length) return res.status(404).json({ error: 'Connector not found' });
    const c = connectorR.rows[0];
    
    await pool.query("UPDATE api_connectors SET connection_status='testing' WHERE id=$1", [c.id]);
    
    // Try a simple GET to the base URL to test connectivity
    try {
      const baseUrl = c.send_url.split('?')[0];
      const testRes = await fetch(baseUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
      const status = testRes.ok || testRes.status === 400 || testRes.status === 401 || testRes.status === 403 ? 'connected' : 'failed';
      await pool.query("UPDATE api_connectors SET connection_status=$1 WHERE id=$2", [status, c.id]);
      res.json({ success: true, data: { status, http_status: testRes.status, message: status === 'connected' ? 'Host reachable' : 'Host responded with ' + testRes.status } });
    } catch (e) {
      await pool.query("UPDATE api_connectors SET connection_status='failed' WHERE id=$1", [c.id]);
      res.json({ success: false, data: { status: 'failed', message: e.message } });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. DLR callback endpoint — providers POST DLR updates here
app.post('/api/api-connectors/dlr-callback', async (req, res) => {
  try {
    const { message_id, status, dlr_status, error_code, error_message } = req.body;
    if (!message_id) return res.status(400).json({ error: 'message_id required' });
    
    const newStatus = status || (dlr_status === 'DELIVRD' ? 'delivered' : 'failed');
    await pool.query(`UPDATE sms_logs SET status=$1,dlr_status=$2,dlr_timestamp=NOW(),delivery_time=NOW(),error_code=$3,error_message=$4 WHERE message_id=$5`,
      [newStatus, dlr_status||'DELIVRD', error_code||null, error_message||null, message_id]);
    
    // Update DLR queue
    await pool.query("UPDATE dlr_queue SET status='dlr_received',dlr_received_at=NOW(),dlr_result=$1 WHERE message_id=$2", [dlr_status||'DELIVRD', message_id]);
    
    // If delivered, auto-deduct client balance for DLR mode clients
    if (newStatus === 'delivered') {
      const logR = await pool.query('SELECT client_id, client_rate, message_parts FROM sms_logs WHERE message_id=$1', [message_id]);
      if (logR.rows.length && logR.rows[0].client_id) {
        await pool.query("UPDATE clients SET balance=balance-($1*$2) WHERE id=$3 AND billing_mode='dlr'",
          [logR.rows[0].client_rate, logR.rows[0].message_parts, logR.rows[0].client_id]);
      }
    }
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Get connectors with their linked supplier info (joined)
app.get('/api/api-connectors/with-suppliers', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT ac.*, s.id as sup_id, s.supplier_code, s.company_name as sup_company, s.status as sup_status, s.bind_status as sup_bind_status
      FROM api_connectors ac
      LEFT JOIN suppliers s ON ac.supplier_id = s.id
      ORDER BY ac.region, ac.name
    `);
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// EXTERNAL REST API v1 — Client & Supplier Authentication
// Clients authenticate with smpp_username + smpp_password
// Requires api_enabled = true on client record
// ============================================================

app.post('/api/v1/sms/send', async (req, res) => {
  try {
    const { username, password, to, from, text, message_id, dlr_url } = req.body;
    if (!username || !password) return res.status(401).json({ success: false, error: 'Authentication required. Send username + password in request body.', code: 'AUTH_FAILED' });
    if (!to || !from || !text) return res.status(400).json({ success: false, error: 'Missing required fields: to, from, text', code: 'MISSING_PARAMETER' });

    // Authenticate using client's smpp_username + smpp_password (or api_key)
    const client = await pool.query(
      'SELECT * FROM clients WHERE (smpp_username=$1 OR api_key=$1) AND status=$2', [username, 'active']
    );
    if (!client.rows.length) return res.status(401).json({ success: false, error: 'Invalid credentials or account inactive', code: 'AUTH_FAILED' });
    const c = client.rows[0];

    // Check HTTP API enabled
    if (!c.api_enabled) return res.status(403).json({ success: false, error: 'HTTP API not enabled for this account. Enable in client settings.', code: 'FEATURE_DISABLED' });

    // Verify password if smpp_username used
    if (c.smpp_username === username && c.smpp_password !== password) return res.status(401).json({ success: false, error: 'Invalid password', code: 'AUTH_FAILED' });

    // Rate + Profit check
    const rateR = await pool.query("SELECT * FROM rates WHERE entity_type='client' AND entity_id=$1 AND is_active=true LIMIT 1", [c.id]);
    const clientRate = rateR.rows[0]?.rate || 0.025;
    const supRate = await pool.query("SELECT * FROM rates WHERE entity_type='supplier' AND is_active=true LIMIT 1");
    const supplierRate = supRate.rows[0]?.rate || 0.015;
    const parts = Math.ceil(text.length / 160);
    const profit = clientRate - supplierRate;
    if (profit <= 0) return res.status(400).json({ success: false, error: `ROUTE BLOCKED: No profit margin`, code: 'ROUTE_BLOCKED' });

    // Balance + Credit check
    const available = parseFloat(c.balance) + parseFloat(c.credit_limit);
    const cost = clientRate * parts;
    if (available < cost) return res.status(402).json({ success: false, error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE', details: { balance: parseFloat(c.balance), credit_limit: parseFloat(c.credit_limit), available, needed: cost } });

    // Insert SMS log + DLR queue entry
    const msgId = message_id || ('MSG' + Date.now() + Math.random().toString(36).substr(2, 6));
    const ir = await pool.query(
      `INSERT INTO sms_logs (message_id,client_id,client_code,sender_id,destination,message,message_parts,client_rate,supplier_rate,profit,status,submit_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted',NOW()) RETURNING *`,
      [msgId, c.id, c.client_code, from, to, text, parts, clientRate, supplierRate, profit]
    );
    const log = ir.rows[0];

    // Insert into DLR queue for proper tracking
    await pool.query(`INSERT INTO dlr_queue (message_id,destination,status,retry_count,max_retries,force_dlr,dlr_timeout,submitted_at) VALUES ($1,$2,'waiting_dlr',0,$3,$4,$5,NOW())`,
      [msgId, to, 150, c.force_dlr||false, c.dlr_timeout||150]);

    // Billing: Submit mode = charge immediately
    if (c.billing_mode === 'submit') { await pool.query('UPDATE clients SET balance=balance-$1 WHERE id=$2', [cost, c.id]); }

    res.json({ success: true, data: { message_id: msgId, your_message_id: message_id, to, from, text, parts, rate: clientRate, currency: 'EUR', cost, profit, status: 'submitted', submitted_at: new Date().toISOString() } });
  } catch (e) { res.status(500).json({ success: false, error: e.message, code: 'INTERNAL_ERROR' }); }
});

// DLR Inquiry
app.get('/api/v1/sms/dlr/:messageId', async (req, res) => {
  try {
    const { username, password } = req.query;
    if (!username || !password) return res.status(401).json({ success: false, error: 'Authentication required. Pass username + password as query params.', code: 'AUTH_FAILED' });
    const client = await pool.query('SELECT * FROM clients WHERE (smpp_username=$1 OR api_key=$1) AND smpp_password=$2 AND status=$3', [username, password, 'active']);
    if (!client.rows.length) return res.status(401).json({ success: false, error: 'Invalid credentials or account inactive', code: 'AUTH_FAILED' });
    const result = await pool.query('SELECT * FROM sms_logs WHERE (message_id=$1 OR id=$1) AND client_id=$2', [req.params.messageId, client.rows[0].id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Message not found', code: 'MESSAGE_NOT_FOUND' });
    const log = result.rows[0];
    res.json({ success: true, data: { message_id: log.message_id, to: log.destination, from: log.sender_id, status: log.status, dlr_status: log.dlr_status, submitted_at: log.submit_time, delivered_at: log.delivery_time, error: log.error_message, rate: log.client_rate, cost: log.client_rate * log.message_parts, profit: log.profit } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Balance inquiry
app.get('/api/v1/account/balance', async (req, res) => {
  try {
    const { username, password } = req.query;
    if (!username || !password) return res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_FAILED' });
    const client = await pool.query('SELECT * FROM clients WHERE (smpp_username=$1 OR api_key=$1) AND smpp_password=$2 AND status=$3', [username, password, 'active']);
    if (!client.rows.length) return res.status(401).json({ success: false, error: 'Invalid credentials', code: 'AUTH_FAILED' });
    const c = client.rows[0];
    res.json({ success: true, data: { balance: parseFloat(c.balance), credit_limit: parseFloat(c.credit_limit), available: parseFloat(c.balance)+parseFloat(c.credit_limit), currency: c.currency, billing_mode: c.billing_mode } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SPA fallback — regex matches all paths except /api/*
app.get(/^\/(?!api\/).*$/, (req, res) => { res.sendFile(path.join(__dirname, 'dist', 'index.html')); });

app.listen(PORT, () => {
  console.log(`✅ NET2APP Hub running on port ${PORT}`);
  console.log(`📊 Database: ${pool.options.database} on ${pool.options.host}`);
  console.log(`🔗 External API: http://YOUR_IP:${PORT}/api/v1/sms/send`);
  console.log(`⏰ DLR timeout: ${DLR_TIMEOUT_MS/60000} minutes`);
  // Start the DLR queue processor
  startDLRProcessor();
});

// Graceful shutdown
process.on('SIGTERM', () => { stopDLRProcessor(); console.log('[DLR] Processor stopped'); process.exit(0); });
process.on('SIGINT', () => { stopDLRProcessor(); console.log('[DLR] Processor stopped'); process.exit(0); });
