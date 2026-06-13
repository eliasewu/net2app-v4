import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Globe, CheckCircle, XCircle, RefreshCw, UserPlus, Database, Send, Link, ExternalLink, Server } from 'lucide-react';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Modal } from '../../components/UI/Modal';
import { Input, Select, Textarea } from '../../components/UI/Input';
import { Table, Pagination } from '../../components/UI/Table';
import { defaultConnectors, Connector } from '../../data/connectors';

// API base URL
declare const __API_URL__: string;
const API_BASE = (typeof __API_URL__ !== 'undefined' ? __API_URL__ : null) || '/api';

function getToken() { return localStorage.getItem('auth_token'); }

// Extended connector type with DB fields
interface DBConnector {
  id: string; name: string; provider: string; region: string;
  auth_type: string; http_method: string; api_key: string; api_secret: string;
  send_url: string; dlr_url: string; params: string;
  submit_pattern: string; dlr_pattern: string; dlr_value: string;
  is_active: boolean; connection_status: string; supplier_id?: string;
  sup_id?: string; sup_company?: string; sup_status?: string; sup_bind_status?: string;
}

const REGIONS = [
  { key: 'all', label: 'All', flag: '📊' },
  { key: 'Global', label: 'Global', flag: '🌍' },
  { key: 'Bangladesh', label: 'Bangladesh', flag: '🇧🇩' },
  { key: 'India', label: 'India', flag: '🇮🇳' },
  { key: 'Pakistan', label: 'Pakistan', flag: '🇵🇰' },
  { key: 'Middle East', label: 'Middle East', flag: '🕌' },
  { key: 'Europe', label: 'Europe', flag: '🇪🇺' },
  { key: 'Africa', label: 'Africa', flag: '🌍' },
  { key: 'Americas', label: 'Americas', flag: '🌎' },
  { key: 'Australia', label: 'Australia', flag: '🇦🇺' },
];

export const APIConnectors: React.FC = () => {
  const [connectors, setConnectors] = useState<DBConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendConnector, setSendConnector] = useState<DBConnector | null>(null);
  const [sendForm, setSendForm] = useState({ to: '', from: 'INFO', text: '' });
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [editing, setEditing] = useState<DBConnector | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const itemsPerPage = 25;

  const [form, setForm] = useState({
    name: '', provider: '', region: 'Global', auth_type: 'API_KEY', http_method: 'POST',
    api_key: '', api_secret: '', send_url: '', dlr_url: '', params: '',
    submit_pattern: '', dlr_pattern: '', dlr_value: 'delivered', is_active: true,
  });

  // Load connectors from backend API with localStorage fallback
  const loadConnectors = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(API_BASE + '/api-connectors/with-suppliers', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setConnectors(data.data);
          // Cache to localStorage as fallback
          localStorage.setItem('api_connectors_cache', JSON.stringify(data.data));
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Backend unavailable, using cached data');
    }
    // Fallback: load from localStorage cache
    try {
      const cached = localStorage.getItem('api_connectors_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.length > 0) {
          setConnectors(parsed);
          setLoading(false);
          return;
        }
      }
    } catch {}
    // Last resort: convert frontend defaults to DB format
    const defaults: DBConnector[] = defaultConnectors.map((c, i) => ({
      id: c.id, name: c.name, provider: c.provider, region: c.region,
      auth_type: c.auth_type, http_method: c.http_method, api_key: c.api_key, api_secret: c.api_secret || '',
      send_url: c.send_url, dlr_url: c.dlr_url, params: c.params,
      submit_pattern: c.submit_pattern, dlr_pattern: c.dlr_pattern, dlr_value: c.dlr_value,
      is_active: c.is_active, connection_status: c.status,
    }));
    setConnectors(defaults);
    setLoading(false);
  };

  useEffect(() => { loadConnectors(); }, []);

  const filtered = connectors.filter(c => {
    const ms = c.name.toLowerCase().includes(search.toLowerCase()) || c.provider.toLowerCase().includes(search.toLowerCase());
    const mr = regionFilter === 'all' || c.region === regionFilter;
    return ms && mr;
  });
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', provider: '', region: 'Global', auth_type: 'API_KEY', http_method: 'POST', api_key: '', api_secret: '', send_url: '', dlr_url: '', params: '', submit_pattern: '', dlr_pattern: '', dlr_value: 'delivered', is_active: true });
    setShowModal(true);
  };
  const openEdit = (c: DBConnector) => {
    setEditing(c);
    setForm({ name: c.name, provider: c.provider, region: c.region, auth_type: c.auth_type, http_method: c.http_method, api_key: c.api_key, api_secret: c.api_secret, send_url: c.send_url, dlr_url: c.dlr_url, params: c.params, submit_pattern: c.submit_pattern, dlr_pattern: c.dlr_pattern, dlr_value: c.dlr_value, is_active: c.is_active });
    setShowModal(true);
  };

  const apiCall = async (endpoint: string, method = 'GET', body?: any) => {
    const token = getToken();
    const opts: any = { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + endpoint, opts);
    if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || 'API error'); }
    return res.json();
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await apiCall('/api-connectors/' + editing.id, 'PUT', form);
      } else {
        await apiCall('/api-connectors', 'POST', { ...form, connection_status: 'untested' });
      }
      setShowModal(false);
      await loadConnectors();
      setMessage({ type: 'success', text: editing ? 'Connector updated' : 'Connector created' });
      setTimeout(() => setMessage(null), 3000);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this connector?')) return;
    try {
      await apiCall('/api-connectors/' + id, 'DELETE');
      await loadConnectors();
      setMessage({ type: 'success', text: 'Connector deleted' });
      setTimeout(() => setMessage(null), 3000);
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await apiCall('/api-connectors/' + id, 'PUT', { is_active: !current });
      await loadConnectors();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
  };

  const handleTest = async (id: string) => {
    try {
      setConnectors(p => p.map(c => c.id === id ? { ...c, connection_status: 'testing' } : c));
      const res = await apiCall('/api-connectors/' + id + '/test', 'POST');
      await loadConnectors();
      setMessage({ type: res.success ? 'success' : 'error', text: res.data?.message || 'Test ' + (res.success ? 'passed' : 'failed') });
      setTimeout(() => setMessage(null), 5000);
    } catch (e: any) {
      setConnectors(p => p.map(c => c.id === id ? { ...c, connection_status: 'failed' } : c));
      setMessage({ type: 'error', text: 'Test failed: ' + e.message });
    }
  };

  // Register connector as supplier
  const handleRegisterSupplier = async (id: string) => {
    try {
      const res = await apiCall('/api-connectors/' + id + '/register-supplier', 'POST');
      await loadConnectors();
      setMessage({ type: 'success', text: '✅ Supplier created: ' + (res.data?.supplier?.supplier_code || '') });
      setTimeout(() => setMessage(null), 5000);
    } catch (e: any) { setMessage({ type: 'error', text: 'Registration failed: ' + e.message }); }
  };

  // Import all default connectors to DB
  const handleImportDefaults = async () => {
    if (!window.confirm('Import all ' + defaultConnectors.length + ' default API connectors to database?')) return;
    try {
      const res = await apiCall('/api-connectors/import-defaults', 'POST', { connectors: defaultConnectors });
      await loadConnectors();
      const d = res.data;
      setMessage({ type: 'success', text: `✅ Imported ${d.imported} connectors (${d.skipped} skipped, ${d.total} total)` });
      setTimeout(() => setMessage(null), 5000);
    } catch (e: any) { setMessage({ type: 'error', text: 'Import failed: ' + e.message }); }
  };

  // Send SMS via connector
  const handleSendViaConnector = async () => {
    if (!sendConnector || !sendForm.to || !sendForm.text) { alert('Fill all fields'); return; }
    setSendResult('Sending...');
    try {
      const res = await apiCall('/api-connectors/' + sendConnector.id + '/send', 'POST', sendForm);
      setSendResult(res.success ? `✅ Sent! Message ID: ${res.data?.message_id}` : `❌ Failed: ${res.error}`);
    } catch (e: any) { setSendResult('❌ Error: ' + e.message); }
  };

  const getStatusBadge = (c: DBConnector) => {
    if (c.connection_status === 'testing') return <Badge variant="warning" size="sm">Testing...</Badge>;
    if (c.connection_status === 'connected') return <Badge variant="success" dot size="sm">Connected</Badge>;
    if (c.connection_status === 'failed') return <Badge variant="danger" dot size="sm">Failed</Badge>;
    return <Badge variant={c.is_active ? 'default' : 'danger'} size="sm">{c.is_active ? 'Active' : 'Inactive'}</Badge>;
  };

  const columns = [
    { key: 'name', header: 'Connector', render: (c: DBConnector) => <div><p className="font-medium text-sm">{c.name}</p><p className="text-[10px] text-gray-500">{c.provider} • {c.region}</p></div> },
    { key: 'supplier', header: 'Supplier', render: (c: DBConnector) => c.sup_id ? <Badge variant="success" size="sm"><Link size={10} className="mr-0.5" />{c.sup_company?.slice(0, 20) || 'Linked'}</Badge> : <Badge variant="default" size="sm">Not registered</Badge> },
    { key: 'auth', header: 'Auth', render: (c: DBConnector) => <Badge variant="default" size="sm">{c.auth_type}</Badge> },
    { key: 'url', header: 'API URL', render: (c: DBConnector) => <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded truncate block max-w-[160px]">{c.send_url?.split('/')[2] || c.send_url?.slice(0, 30) || '-'}</code> },
    { key: 'status', header: 'Status', render: (c: DBConnector) => getStatusBadge(c) },
    { key: 'actions', header: 'Actions', render: (c: DBConnector) => <div className="flex gap-0.5 flex-wrap">
      {!c.sup_id && <button onClick={() => handleRegisterSupplier(c.id)} className="p-1 rounded hover:bg-green-50" title="Register as Supplier"><UserPlus size={14} className="text-green-600" /></button>}
      {c.sup_id && <button onClick={() => window.location.href='/suppliers/' + c.sup_id} className="p-1 rounded hover:bg-blue-50" title="View Supplier"><ExternalLink size={14} className="text-blue-500" /></button>}
      <button onClick={() => { setSendConnector(c); setSendForm({ to: '', from: 'INFO', text: '' }); setSendResult(null); setShowSendModal(true); }} className="p-1 rounded hover:bg-purple-50" title="Send SMS"><Send size={14} className="text-purple-500" /></button>
      <button onClick={() => handleTest(c.id)} className="p-1 rounded hover:bg-gray-100" title="Test"><RefreshCw size={14} className="text-blue-500" /></button>
      <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-gray-100"><Edit size={14} className="text-gray-500" /></button>
      <button onClick={() => handleToggle(c.id, c.is_active)} className="p-1 rounded hover:bg-gray-100">{c.is_active ? <XCircle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}</button>
      <button onClick={() => handleDelete(c.id)} className="p-1 rounded hover:bg-gray-100"><Trash2 size={14} className="text-red-500" /></button>
    </div> },
  ];

  return (<div className="space-y-6">
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-bold text-gray-800">API Connectors — HTTP API</h1><p className="text-gray-500 mt-1">All connectors in database — Register as supplier to use in routing</p></div>
      <div className="flex gap-2">
        {connectors.length === 0 && <Button variant="secondary" icon={<Database size={16} />} onClick={handleImportDefaults}>Import {defaultConnectors.length} Defaults</Button>}
        <Button icon={<Plus size={18} />} onClick={openAdd}>Add Custom</Button>
      </div>
    </div>

    {message && <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{message.text}</div>}

    {/* Region Stats */}
    <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
      {REGIONS.map(r => {
        const count = r.key === 'all' ? connectors.length : connectors.filter(c => c.region === r.key).length;
        return <button key={r.key} onClick={() => { setRegionFilter(r.key); setCurrentPage(1); }}
          className={`p-2.5 rounded-xl border text-center transition ${regionFilter === r.key ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
          <span className="text-lg">{r.flag}</span>
          <p className="text-xs font-semibold mt-0.5">{r.label}</p>
          <p className="text-sm font-bold text-gray-800">{count}</p>
        </button>;
      })}
    </div>

    {/* Search */}
    <Card><div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search by name or provider..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm" /></div></Card>

    {/* Table */}
    <Card noPadding>
      {loading ? <div className="p-8 text-center text-gray-500"><RefreshCw size={24} className="mx-auto mb-2 animate-spin" /><p>Loading connectors from database...</p></div> :
        <>
          <Table columns={columns} data={paginated} keyExtractor={c => c.id} />
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={itemsPerPage} />
        </>
      }
    </Card>

    {connectors.length === 0 && !loading && (
      <Card><div className="text-center py-8">
        <Server size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">No API connectors in database</p>
        <p className="text-sm text-gray-400 mt-1 mb-4">Click "Import {defaultConnectors.length} Defaults" to load all pre-configured providers</p>
        <Button icon={<Database size={16} />} onClick={handleImportDefaults}>Import {defaultConnectors.length} Default Connectors</Button>
      </div></Card>
    )}

    {/* Add/Edit Modal */}
    <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit API Connector' : 'Add Custom API Connector'} size="lg" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave}>{editing ? 'Update' : 'Add'}</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          <Input label="Provider" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} />
          <Select label="Region" value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} options={REGIONS.filter(r => r.key !== 'all').map(r => ({ value: r.key, label: r.flag + ' ' + r.label }))} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Select label="Auth Type" value={form.auth_type} onChange={e => setForm(p => ({ ...p, auth_type: e.target.value }))} options={[{ value: 'API_KEY', label: 'API Key' }, { value: 'BASIC', label: 'Basic Auth' }, { value: 'BEARER', label: 'Bearer Token' }]} />
          <Select label="Method" value={form.http_method} onChange={e => setForm(p => ({ ...p, http_method: e.target.value }))} options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} />
          <Input label="API Key" value={form.api_key} onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))} />
          <Input label="API Secret" value={form.api_secret} onChange={e => setForm(p => ({ ...p, api_secret: e.target.value }))} placeholder="For BASIC auth" />
        </div>
        <Textarea label="Send URL *" value={form.send_url} onChange={e => setForm(p => ({ ...p, send_url: e.target.value }))} rows={2} placeholder="https://api.provider.com/send" required />
        <div className="grid grid-cols-2 gap-4">
          <Input label="DLR URL" value={form.dlr_url} onChange={e => setForm(p => ({ ...p, dlr_url: e.target.value }))} />
          <Input label="Params (comma-separated)" value={form.params} onChange={e => setForm(p => ({ ...p, params: e.target.value }))} placeholder="to,from,text" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Submit Success Pattern" value={form.submit_pattern} onChange={e => setForm(p => ({ ...p, submit_pattern: e.target.value }))} />
          <Input label="DLR Pattern" value={form.dlr_pattern} onChange={e => setForm(p => ({ ...p, dlr_pattern: e.target.value }))} />
          <Input label="DLR Success Value" value={form.dlr_value} onChange={e => setForm(p => ({ ...p, dlr_value: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded" /><span className="text-sm">Active</span></label>
      </div>
    </Modal>

    {/* Send SMS via Connector Modal */}
    <Modal isOpen={showSendModal} onClose={() => setShowSendModal(false)} title={`Send SMS via ${sendConnector?.name || 'Connector'}`} size="md" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setShowSendModal(false)}>Close</Button><Button icon={<Send size={14} />} onClick={handleSendViaConnector}>Send</Button></div>}>
      <div className="space-y-4">
        {sendConnector && <div className="bg-blue-50 p-3 rounded-lg text-sm"><strong>{sendConnector.name}</strong> — {sendConnector.provider} ({sendConnector.region})<br /><code className="text-[10px]">{sendConnector.send_url?.slice(0, 60)}</code></div>}
        <Input label="Destination" value={sendForm.to} onChange={e => setSendForm(p => ({ ...p, to: e.target.value }))} placeholder="+1234567890" required />
        <Input label="Sender ID" value={sendForm.from} onChange={e => setSendForm(p => ({ ...p, from: e.target.value }))} placeholder="INFO" />
        <Textarea label="Message" value={sendForm.text} onChange={e => setSendForm(p => ({ ...p, text: e.target.value }))} rows={4} placeholder="Your SMS text..." required />
        {sendResult && <div className={`p-3 rounded-lg text-sm ${sendResult.includes('✅') ? 'bg-green-50 text-green-700' : sendResult.includes('❌') || sendResult.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{sendResult}</div>}
      </div>
    </Modal>
  </div>);
};
