import React, { useState, useMemo } from 'react';
import { Plus, Search, Download, Trash2, Edit, Send, CheckSquare, Square, Mail, Clock } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { Card } from '../../components/UI/Card';
import { Button } from '../../components/UI/Button';
import { Badge } from '../../components/UI/Badge';
import { Table, Pagination } from '../../components/UI/Table';
import { Modal } from '../../components/UI/Modal';
import { Input, Select } from '../../components/UI/Input';
import { Rate } from '../../types';
import { exportCSV } from '../../services/exportService';

export const SupplierRates: React.FC = () => {
  const { rates: allRates, suppliers, addRate, updateRate, deleteRate, mccmnc } = useData();
  const [search, setSearch] = useState(''); const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingRate, setEditingRate] = useState<Rate | null>(null);
  const [selectedRates, setSelectedRates] = useState<string[]>([]);

  const [historyRates, setHistoryRates] = useState<Rate[]>([]);
  const [sendNotification, setSendNotification] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notificationData, setNotificationData] = useState<{
    country: string; account: string; mcc: string; mncs: string; oldRate: number; newRate: number;
    direction: string; effectiveDate: string;
  } | null>(null);

  // Multi-select state
  const [selectedMncs, setSelectedMncs] = useState<string[]>(['*']);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [rateValue, setRateValue] = useState(0);

  const [formData, setFormData] = useState({ entity_id:'', mcc:'', country:'', rate:0, effective_from: new Date().toISOString().split('T')[0], effective_to:'', is_active:true });
  const itemsPerPage = 20;

  const supplierRates = allRates.filter(r => r.entity_type === 'supplier');
  const countries = useMemo(() => [...new Set(mccmnc.map(m => m.country))].sort(), [mccmnc]);

  const filteredRates = supplierRates.filter(rate => {
    const ms = rate.country.toLowerCase().includes(search.toLowerCase()) || rate.mcc.includes(search);
    const mc = supplierFilter === 'all' || rate.entity_id === supplierFilter;
    const mco = countryFilter === 'all' || rate.country === countryFilter;
    return ms && mc && mco;
  });
  const totalPages = Math.ceil(filteredRates.length / itemsPerPage);
  const paginatedRates = filteredRates.slice((currentPage-1)*itemsPerPage, currentPage*itemsPerPage);

  const getSupplierName = (id: string) => { const s = suppliers.find(x => x.id === id); return s ? `${s.supplier_code} - ${s.company_name}` : 'Unknown'; };
  const getSupplierEmail = (id: string) => { const s = suppliers.find(x => x.id === id); return s?.email || ''; };

  // Detect rate direction
  const getDirection = (oldRate: number, newRate: number): string => {
    if (oldRate === 0) return 'New';
    if (newRate > oldRate) return 'Increase';
    if (newRate < oldRate) return 'Decrease';
    return 'Unchanged';
  };

  const openModal = (rate?: Rate) => {
    setSelectedCountry(''); setSelectedMncs(['*']); setRateValue(0);
    if (rate) {
      setEditingRate(rate); setSendNotification(false);
      setFormData({ entity_id:rate.entity_id, mcc:rate.mcc, country:rate.country, rate:rate.rate, effective_from:rate.effective_from, effective_to:rate.effective_to||'', is_active:rate.is_active });
      setSelectedCountry(rate.country); setSelectedMncs([rate.mnc]); setRateValue(rate.rate);
    } else {
      setEditingRate(null); setSendNotification(true);
      setFormData({ entity_id:supplierFilter!=='all'?supplierFilter:'', mcc:'', country:'', rate:0, effective_from:new Date().toISOString().split('T')[0], effective_to:'', is_active:true });
    }
    setShowModal(true);
  };

  const onSelectCountry = (country: string) => {
    setSelectedCountry(country);
    setSelectedMncs(['*']);
    const mcc = mccmnc.find(m => m.country === country)?.mcc || '';
    setFormData(p => ({ ...p, country, mcc }));
  };

  const toggleMnc = (mnc: string) => {
    setSelectedMncs(prev => {
      if (mnc === '*') return ['*'];
      const withoutStar = prev.filter(m => m !== '*');
      if (withoutStar.includes(mnc)) return withoutStar.filter(m => m !== mnc).length === 0 ? ['*'] : withoutStar.filter(m => m !== mnc);
      return [...withoutStar, mnc];
    });
  };

  const handleSubmit = () => {
    if (!formData.entity_id || !selectedCountry || !rateValue) { alert('Please fill all fields'); return; }
    const mcc = formData.mcc || mccmnc.find(m => m.country === selectedCountry)?.mcc || '';
    let mncsToAdd = selectedMncs.includes('*') ? mccmnc.filter(m => m.country === selectedCountry && m.mcc === mcc).map(m => m.mnc) : selectedMncs;
    if (mncsToAdd.length === 0) mncsToAdd = ['*'];
    const now = new Date();
    const effectiveDT = `${formData.effective_from} ${now.toLocaleTimeString()}`;

    let count = 0;
    let lastOldRate = 0;
    for (const mnc of mncsToAdd) {
      const op = mccmnc.find(m => m.mcc === mcc && m.mnc === mnc);
      const opName = mnc === '*' ? 'All' : (op?.operator || 'All');
      // Find existing active rate to get old rate for notification
      const existing = supplierRates.find(r => r.entity_id === formData.entity_id && r.mcc === mcc && r.mnc === mnc && r.is_active);
      const oldRate = existing?.rate || 0;
      lastOldRate = oldRate;
      // Deactivate old rate with timestamp
      if (existing) updateRate(existing.id, { is_active: false, effective_to: now.toISOString().split('T')[0] });
      // Create new rate
      addRate({ entity_type: 'supplier', entity_id: formData.entity_id, mcc, mnc, country: selectedCountry, operator: opName, rate: rateValue, currency: 'EUR', effective_from: formData.effective_from, effective_to: formData.effective_to || null, is_active: true });
      count++;
    }

    setNotificationData({
      country: selectedCountry, account: getSupplierName(formData.entity_id), mcc, mncs: mncsToAdd.join(', '),
      oldRate: lastOldRate, newRate: rateValue, direction: getDirection(lastOldRate, rateValue), effectiveDate: effectiveDT,
    });

    if (sendNotification) {
      setNotifyEmail(getSupplierEmail(formData.entity_id));
      setShowNotifyModal(true);
    }
    setShowModal(false);
  };

  const handleBulkDelete = () => { selectedRates.forEach(id => deleteRate(id)); setSelectedRates([]); };
  const toggleSelect = (id: string) => setSelectedRates(p => p.includes(id) ? p.filter(i => i!==id) : [...p, id]);

  const showRateHistory = (rate: Rate) => {
    const hist = allRates.filter(r => r.entity_type==='supplier' && r.entity_id===rate.entity_id && r.mcc===rate.mcc && r.mnc===rate.mnc).sort((a,b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
    setHistoryRates(hist); setShowHistoryModal(true);
  };

  const handleSendNotification = (rate: Rate) => {
    setNotificationData({
      country:rate.country, account:getSupplierName(rate.entity_id), mcc:rate.mcc, mncs:rate.mnc,
      oldRate:0, newRate:rate.rate, direction:'New', effectiveDate:new Date().toLocaleString()
    });
    setNotifyEmail(getSupplierEmail(rate.entity_id));
    setShowNotifyModal(true);
  };

  const sendRateEmail = () => {
    alert(`✅ Rate notification email sent to ${notifyEmail}\n\nSupplier: ${notificationData?.account}\nCountry: ${notificationData?.country}\nMNC(s): ${notificationData?.mncs}\nOld Rate: €${notificationData?.oldRate.toFixed(4)}\nNew Rate: €${notificationData?.newRate.toFixed(4)}\nChange: ${notificationData?.direction}\nEffective: ${notificationData?.effectiveDate}`);
    setShowNotifyModal(false);
  };

  const handleExportCSV = () => {
    exportCSV('supplier_rates_export.csv',
      ['supplier_id','supplier_name','mcc','mnc','country','operator','rate','currency','effective_from','effective_to','is_active','status'],
      filteredRates.map(r => [r.entity_id, getSupplierName(r.entity_id), r.mcc, r.mnc, r.country, r.operator, r.rate.toFixed(6), r.currency, r.effective_from, r.effective_to||'', String(r.is_active), r.is_active?'Active':'Inactive'])
    );
  };

  const columns = [
    { key:'select', header:'☑', width:'40px', render:(rate:Rate) => <button onClick={(e)=>{e.stopPropagation();toggleSelect(rate.id);}} className="p-1">{selectedRates.includes(rate.id)?<CheckSquare size={16} className="text-blue-600"/>:<Square size={16} className="text-gray-400"/>}</button> },
    { key:'supplier', header:'Supplier', render:(rate:Rate) => <span className="text-sm">{getSupplierName(rate.entity_id)}</span> },
    { key:'destination', header:'Destination', render:(rate:Rate) => <div><p className="font-medium text-sm">{rate.country}</p><p className="text-xs text-gray-500">{rate.operator}</p></div> },
    { key:'mccmnc', header:'MCC/MNC', render:(rate:Rate) => <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">{rate.mcc}{rate.mnc}</span> },
    { key:'rate', header:'Rate (EUR)', align:'right' as const, render:(rate:Rate) => <div className="text-right"><p className={`font-semibold text-sm ${rate.is_active?'text-gray-800':'text-red-500 line-through'}`}>€{rate.rate.toFixed(4)}</p>{!rate.is_active&&rate.effective_to&&<p className="text-[10px] text-red-400">Ended {rate.effective_to}</p>}</div> },
    { key:'effective', header:'Effective', render:(rate:Rate) => <span className="text-xs">{rate.effective_from} {rate.is_active?<span className="text-green-500">● Active</span>:<span className="text-red-500">● Inactive</span>}</span> },
    { key:'status', header:'Status', render:(rate:Rate) => <Badge variant={rate.is_active?'success':'danger'} dot size="sm">{rate.is_active?'Active':'Inactive'}</Badge> },
    { key:'actions', header:'', render:(rate:Rate) => <div className="flex gap-1">{rate.is_active&&<><button onClick={(e)=>{e.stopPropagation();openModal(rate);}} className="p-1 rounded hover:bg-gray-100"><Edit size={14} className="text-gray-500"/></button><button onClick={(e)=>{e.stopPropagation();handleSendNotification(rate);}} className="p-1 rounded hover:bg-gray-100"><Mail size={14} className="text-blue-500"/></button></>}<button onClick={(e)=>{e.stopPropagation();showRateHistory(rate);}} className="p-1 rounded hover:bg-gray-100"><Clock size={14} className="text-purple-500"/></button><button onClick={(e)=>{e.stopPropagation();deleteRate(rate.id);}} className="p-1 rounded hover:bg-gray-100"><Trash2 size={14} className="text-red-500"/></button></div> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-800">Supplier Rates</h1><p className="text-gray-500 mt-1">{supplierRates.length} rates — Select supplier → Select country → Multi-select operators → Set rate</p></div>
        <div className="flex gap-2"><Button variant="secondary" icon={<Download size={16}/>} onClick={handleExportCSV}>Export CSV</Button><Button icon={<Plus size={18}/>} onClick={()=>openModal()}>Add Rate</Button></div>
      </div>

      {selectedRates.length > 0 && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between"><span className="text-blue-700 font-medium text-sm">{selectedRates.length} selected</span><div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Send size={14}/>} onClick={()=>handleSendNotification(supplierRates.find(r=>r.id===selectedRates[0])!)}>Send Notice</Button><Button size="sm" variant="danger" icon={<Trash2 size={14}/>} onClick={handleBulkDelete}>Delete</Button></div></div>}

      <Card><div className="flex flex-col md:flex-row gap-3"><div className="flex-1 relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input type="text" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/></div><select value={supplierFilter} onChange={e=>{setSupplierFilter(e.target.value);setCurrentPage(1);}} className="px-4 py-2 border border-gray-300 rounded-lg text-sm"><option value="all">All Suppliers</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.supplier_code} - {s.company_name}</option>)}</select><select value={countryFilter} onChange={e=>{setCountryFilter(e.target.value);setCurrentPage(1);}} className="px-4 py-2 border border-gray-300 rounded-lg text-sm"><option value="all">All Countries</option>{countries.map(c=><option key={c} value={c}>{c}</option>)}</select></div></Card>

      <Card noPadding><Table columns={columns} data={paginatedRates} keyExtractor={r=>r.id}/><Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredRates.length} itemsPerPage={itemsPerPage}/></Card>

      {/* Add Rate Modal - Multi Operator Select */}
      <Modal isOpen={showModal} onClose={()=>setShowModal(false)} title={editingRate?'Edit Rate':'Add New Supplier Rates (Multi-Operator)'} size="lg" footer={<div className="flex justify-between w-full"><span className="text-sm text-gray-500">{selectedMncs.includes('*') ? `All ${mccmnc.filter(m=>m.country===selectedCountry).length} operators` : `${selectedMncs.length} operators`} selected</span><div className="flex gap-3"><Button variant="secondary" onClick={()=>setShowModal(false)}>Cancel</Button><Button onClick={handleSubmit}>Add Rates</Button></div></div>}>
        <div className="space-y-4">
          {editingRate&&editingRate.is_active&&<div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-700">⚠ This will deactivate current rate (€{editingRate.rate.toFixed(4)}) and create a new version with timestamp.</div>}
          <Select label="Supplier *" value={formData.entity_id} onChange={e=>setFormData(p=>({...p,entity_id:e.target.value}))} options={[{value:'',label:'Select Supplier'},...suppliers.map(s=>({value:s.id,label:`${s.supplier_code} - ${s.company_name}`}))]} required/>
          <Select label="Country *" value={selectedCountry} onChange={e => onSelectCountry(e.target.value)} options={[{value:'',label:'Select Country'},...countries.map(c=>({value:c,label:c}))]} required/>
          {selectedCountry && (
            <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Operators in {selectedCountry}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={()=>{const all=mccmnc.filter(m=>m.country===selectedCountry).map(m=>m.mnc);setSelectedMncs(all);}} className="text-xs text-blue-600 hover:underline">Select All ({mccmnc.filter(m=>m.country===selectedCountry).length})</button>
                  <button type="button" onClick={()=>setSelectedMncs(['*'])} className="text-xs text-red-600 hover:underline">All (*)</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {mccmnc.filter(m => m.country === selectedCountry).map(op => (
                  <label key={op.mnc} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition text-sm ${selectedMncs.includes(op.mnc) || selectedMncs.includes('*') ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={selectedMncs.includes(op.mnc) || selectedMncs.includes('*')} onChange={() => toggleMnc(op.mnc)} className="w-4 h-4 rounded border-gray-300 text-blue-600"/>
                    <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><span className="font-mono font-semibold text-blue-700 text-sm">{op.mnc}</span><span className="text-gray-600 truncate text-sm">{op.operator}</span></div><span className="text-[10px] text-gray-400">MCC: {op.mcc} • {op.network_type}</span></div>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Input label="Rate (EUR) *" type="number" step="0.0001" value={rateValue} onChange={e=>setRateValue(parseFloat(e.target.value))} placeholder="0.0000" required/>
          <div className="grid grid-cols-2 gap-4"><Input label="Effective From" type="date" value={formData.effective_from} onChange={e=>setFormData(p=>({...p,effective_from:e.target.value}))}/><Input label="Effective To" type="date" value={formData.effective_to||''} onChange={e=>setFormData(p=>({...p,effective_to:e.target.value}))}/></div>
          {!editingRate && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><label className="flex items-center gap-2"><input type="checkbox" checked={sendNotification} onChange={e=>setSendNotification(e.target.checked)} className="w-4 h-4 rounded"/><span className="text-sm font-medium text-blue-700">Send rate notification email to supplier</span></label></div>}
        </div>
      </Modal>

      {/* Rate Notification Modal with full details */}
      <Modal isOpen={showNotifyModal} onClose={()=>setShowNotifyModal(false)} title="Send Rate Change Notification to Supplier" size="lg" footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={()=>setShowNotifyModal(false)}>Cancel</Button><Button icon={<Send size={14}/>} onClick={sendRateEmail}>Send Email</Button></div>}>
        <div className="space-y-4">
          {notificationData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-blue-800 text-sm">Rate Change Details</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-blue-600 text-xs block">Country</span><span className="font-medium">{notificationData.country}</span></div>
                <div><span className="text-blue-600 text-xs block">Supplier Account</span><span className="font-medium">{notificationData.account}</span></div>
                <div><span className="text-blue-600 text-xs block">MCC</span><span className="font-mono">{notificationData.mcc}</span></div>
                <div><span className="text-blue-600 text-xs block">MNC(s)</span><span className="font-mono">{notificationData.mncs}</span></div>
                <div><span className="text-blue-600 text-xs block">Old Rate</span><span className="text-red-600 line-through font-semibold">€{notificationData.oldRate.toFixed(4)}</span></div>
                <div><span className="text-blue-600 text-xs block">New Rate</span><span className="text-green-600 font-semibold text-lg">€{notificationData.newRate.toFixed(4)}</span></div>
                <div><span className="text-blue-600 text-xs block">Change</span><Badge variant={notificationData.direction==='New'?'info':notificationData.direction==='Increase'?'warning':'success'}>{notificationData.direction}</Badge></div>
                <div><span className="text-blue-600 text-xs block">Effective Date</span><span className="font-medium text-xs">{notificationData.effectiveDate}</span></div>
              </div>
            </div>
          )}
          <Input label="Supplier Email" value={notifyEmail} onChange={e=>setNotifyEmail(e.target.value)} placeholder="supplier@example.com"/>
          <p className="text-xs text-gray-500">The email will include: Country, Supplier Account, MCC, MNC(s), Old Rate, New Rate, Change Direction, Effective Date. Email info collected from supplier form.</p>
        </div>
      </Modal>

      {/* Rate History Modal with timestamps */}
      <Modal isOpen={showHistoryModal} onClose={()=>setShowHistoryModal(false)} title="Supplier Rate History (Version Timeline)" size="xl">
        <table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-medium">Version</th><th className="px-3 py-2 text-left text-xs font-medium">Old Rate</th><th className="px-3 py-2 text-left text-xs font-medium">New Rate</th><th className="px-3 py-2 text-left text-xs font-medium">Change</th><th className="px-3 py-2 text-left text-xs font-medium">Effective From</th><th className="px-3 py-2 text-left text-xs font-medium">Effective To</th><th className="px-3 py-2 text-left text-xs font-medium">Status</th><th className="px-3 py-2 text-left text-xs font-medium">Duration</th></tr></thead><tbody className="divide-y">
          {historyRates.map((r, i) => {
            const prev = historyRates[i+1];
            const oldRateVal = prev?.rate || 0;
            const newRateVal = r.rate;
            const dir = i === historyRates.length-1 ? 'New' : newRateVal > oldRateVal ? 'Increase' : newRateVal < oldRateVal ? 'Decrease' : 'Same';
            const duration = r.effective_to ? `${Math.round((new Date(r.effective_to).getTime() - new Date(r.effective_from).getTime()) / 86400000)} days` : 'Ongoing';
            return (
              <tr key={r.id} className={!r.is_active ? 'bg-red-50' : 'bg-green-50'}>
                <td className="px-3 py-2 font-mono text-xs font-bold">v{historyRates.length - i}</td>
                <td className="px-3 py-2 text-xs text-red-600 line-through">{i < historyRates.length-1 ? `€${oldRateVal.toFixed(4)}` : '—'}</td>
                <td className="px-3 py-2 font-semibold text-green-700 text-xs">€{newRateVal.toFixed(4)}</td>
                <td className="px-3 py-2"><Badge variant={dir==='New'?'info':dir==='Increase'?'warning':'success'} size="sm">{dir}</Badge></td>
                <td className="px-3 py-2 text-xs">{r.effective_from} {r.created_at ? <span className="text-[10px] text-gray-400 block">{new Date(r.created_at).toLocaleTimeString()}</span> : null}</td>
                <td className="px-3 py-2 text-xs">{r.effective_to || 'Present'}</td>
                <td className="px-3 py-2"><Badge variant={r.is_active?'success':'danger'} size="sm">{r.is_active?'ACTIVE':'Inactive'}</Badge></td>
                <td className="px-3 py-2 text-xs">{duration}</td>
              </tr>
            );
          })}
        </tbody></table>
        {historyRates.length === 0 && <p className="text-center py-4 text-gray-500">No rate history found</p>}
      </Modal>
    </div>
  );
};
