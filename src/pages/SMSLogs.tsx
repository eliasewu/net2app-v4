import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Download, RefreshCw, Eye, MessageSquare, Radio, Globe, Mic, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { useData } from '../store/DataContext';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { Table, Pagination } from '../components/UI/Table';
import { Modal } from '../components/UI/Modal';
import dbService from '../services/databaseService';

// Extended log with all fields matching the user's detail view
interface LogDetail {
  id: string;
  message_id: string;
  consumer_user: string;
  alias: string;
  src_type: string;
  type: string;
  business_type: string;
  send_type: string;
  job_submit_success: number;
  job_submit_fail: number;
  deliver_success: number;
  deliver_fail: number;
  cost: number;
  pay: number;
  route: string;
  channel: string;
  device: string;
  ports: string;
  slot: string;
  iccid: string;
  charged_points: number;
  send_result: string;
  reason: string;
  deliver_result: string;
  deliver_fail_reason: string;
  deliver_time: string;
  deliver_duration: number;
  ori_receiver: string;
  sender: string;
  recipients: string;
  dst_receiver: string;
  mcc: string;
  mnc: string;
  send_time: string;
  done_time: string;
  duration: number;
  supplier_user: string;
  in_msg_id: string;
  out_msg_id: string;
  mms_attachment: string;
  mms_title: string;
  sms_content: string;
  sms_bytes: number;
  dest_sms: string;
  dest_sms_bytes: number;
  create_time: string;
  ip: string;
  status: string;
  dlr_status: string;
  client_code?: string;
  supplier_code?: string;
  client_rate?: number;
  supplier_rate?: number;
  profit?: number;
  currency?: string;
  submit_time: string;
  error_message?: string;
  source: string;
}

// Tab filter types
type LogTab = 'all' | 'client' | 'supplier' | 'campaign' | 'testing';

export const SMSLogs: React.FC = () => {
  const { smsLogs: contextLogs, clients, suppliers } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<LogTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [detailModal, setDetailModal] = useState<LogDetail | null>(null);
  const [logs, setLogs] = useState<LogDetail[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const itemsPerPage = 25;

  // Build log entries from context + API polling
  useEffect(() => {
    const buildLogs = () => {
      const entries = contextLogs.map(l => {
        const s = String(l.status);
        return {
          id: l.id,
          message_id: l.message_id,
          consumer_user: l.client_code || '',
          alias: l.client_code || '',
          src_type: 'SMPP',
          type: 'SMS',
          business_type: 'Default type',
          send_type: 'SMPP',
          job_submit_success: s === 'delivered' || s === 'submitted' ? 1 : 0,
          job_submit_fail: s === 'failed' ? 1 : 0,
          deliver_success: s === 'delivered' ? 1 : 0,
          deliver_fail: s === 'failed' ? 1 : 0,
          cost: l.supplier_rate || 0,
          pay: l.client_rate || 0,
          route: l.route_name || '',
          channel: l.trunk_name || '',
          device: l.trunk_name || '',
          ports: '0',
          slot: '0',
          iccid: '',
          charged_points: l.message_parts || 1,
          send_result: s === 'submitted' ? 'success' : s === 'delivered' ? 'success' : s === 'failed' ? 'failed' : 'pending',
          reason: s === 'delivered' ? 'success' : l.error_message || '',
          deliver_result: l.dlr_status === 'DELIVRD' ? 'Success' : l.dlr_status && l.dlr_status !== 'TIMEOUT' ? 'Failed' : '',
          deliver_fail_reason: s === 'failed' ? (l.error_message || 'No DLR received') : '',
          deliver_time: l.delivery_time || '',
          deliver_duration: l.delivery_time && l.submit_time ? Math.round((new Date(l.delivery_time).getTime() - new Date(l.submit_time).getTime()) / 1000) : 0,
          ori_receiver: l.destination,
          sender: l.sender_id,
          recipients: l.destination,
          dst_receiver: l.destination,
          mcc: l.mcc || '',
          mnc: l.mnc || '',
          send_time: l.submit_time,
          done_time: l.delivery_time || l.submit_time,
          duration: l.delivery_time && l.submit_time ? Math.round((new Date(l.delivery_time).getTime() - new Date(l.submit_time).getTime()) / 1000) : 0,
          supplier_user: l.supplier_code || '',
          in_msg_id: l.message_id,
          out_msg_id: l.message_id,
          mms_attachment: '',
          mms_title: '',
          sms_content: l.message,
          sms_bytes: l.message ? l.message.length : 0,
          dest_sms: l.destination,
          dest_sms_bytes: l.destination ? l.destination.length : 0,
          create_time: l.submit_time,
          ip: '',
          status: l.status,
          dlr_status: l.dlr_status || '',
          client_code: l.client_code,
          supplier_code: l.supplier_code,
          client_rate: l.client_rate,
          supplier_rate: l.supplier_rate,
          profit: l.profit,
          currency: l.currency,
          submit_time: l.submit_time,
          error_message: l.error_message || '',
          source: 'smpp',
        };
      });
      setLogs(entries as LogDetail[]);
    };
    buildLogs();
  }, [contextLogs]);

  // Real-time polling - fetches updated DLR statuses every 5 seconds
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const poll = async () => {
      try {
        const recent = await dbService.getSMSLogs();
        if (recent && recent.length > 0) {
          // Merge API data with existing logs to update DLR status
          setLogs(prev => {
            const apiMap = new Map(recent.map((r: any) => [r.message_id, r]));
            return prev.map(log => {
              const apiLog = apiMap.get(log.message_id);
              if (apiLog) {
                return {
                  ...log,
                  status: apiLog.status || log.status,
                  dlr_status: apiLog.dlr_status || log.dlr_status,
                  deliver_time: apiLog.delivery_time || log.deliver_time,
                  deliver_result: apiLog.dlr_status === 'DELIVRD' ? 'Success' : apiLog.dlr_status && apiLog.dlr_status !== 'TIMEOUT' ? 'Failed' : log.deliver_result,
                  deliver_fail_reason: apiLog.status === 'failed' ? (apiLog.error_message || 'No DLR received') : log.deliver_fail_reason,
                  send_result: apiLog.status === 'submitted' ? 'success' : apiLog.status === 'delivered' ? 'success' : apiLog.status === 'failed' ? 'failed' : log.send_result,
                  cost: apiLog.supplier_rate || log.cost,
                  pay: apiLog.client_rate || log.pay,
                  deliver_duration: apiLog.delivery_time && apiLog.submit_time ? Math.round((new Date(apiLog.delivery_time).getTime() - new Date(apiLog.submit_time).getTime()) / 1000) : log.deliver_duration,
                  duration: apiLog.delivery_time && apiLog.submit_time ? Math.round((new Date(apiLog.delivery_time).getTime() - new Date(apiLog.submit_time).getTime()) / 1000) : log.duration,
                  done_time: apiLog.delivery_time || apiLog.submit_time || log.done_time,
                  route: apiLog.route_name || log.route,
                  channel: apiLog.trunk_name || log.channel,
                  device: apiLog.trunk_name || log.device,
                  error_message: apiLog.error_message || log.error_message,
                  mcc: apiLog.mcc || log.mcc,
                  mnc: apiLog.mnc || log.mnc,
                };
              }
              return log;
            });
          });
          setLastRefresh(new Date());
        }
      } catch (e) {
        // Silent fail - use context data
      }
    };
    intervalRef.current = setInterval(poll, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);



  // Filter by active tab
  const tabFiltered = useMemo(() => {
    switch (activeTab) {
      case 'client': return logs.filter(l => l.client_code && l.client_code !== '' && !l.client_code.startsWith('TEST'));
      case 'supplier': return logs.filter(l => l.supplier_code && l.supplier_code !== '');
      case 'campaign': return logs.filter(l => l.business_type === 'Campaign' || l.business_type === 'campaign');
      case 'testing': return logs.filter(l => l.client_code === 'TEST' || l.source === 'voice_otp_test');
      default: return logs;
    }
  }, [logs, activeTab]);

  // Apply search + filters
  const filtered = tabFiltered.filter(log => {
    const ms = !search ||
      log.recipients?.toLowerCase().includes(search.toLowerCase()) ||
      log.message_id?.toLowerCase().includes(search.toLowerCase()) ||
      log.sender?.toLowerCase().includes(search.toLowerCase()) ||
      log.client_code?.toLowerCase().includes(search.toLowerCase()) ||
      log.supplier_code?.toLowerCase().includes(search.toLowerCase());
    const st = statusFilter === 'all' || log.status === statusFilter;
    const cl = clientFilter === 'all' || log.client_code === clientFilter;
    const sp = supplierFilter === 'all' || log.supplier_code === supplierFilter;
    return ms && st && cl && sp;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const total = filtered.length;
  const delivered = filtered.filter(l => l.status === 'delivered').length;
  const failed = filtered.filter(l => l.status === 'failed' || l.dlr_status === 'TIMEOUT').length;
  const pending = filtered.filter(l => l.status === 'submitted' || l.status === 'pending').length;

  const getStatusBadge = (status: string) => {
    const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
      delivered: 'success', completed: 'success', sent: 'info', submitted: 'info',
      pending: 'warning', failed: 'danger', expired: 'danger', rejected: 'danger',
    };
    return <Badge variant={m[status] || 'default'} size="sm">{status.toUpperCase()}</Badge>;
  };

  const getDLRBadge = (dlr: string) => {
    if (!dlr || dlr === '') return <span className="text-xs text-gray-400">Awaiting...</span>;
    if (dlr === 'DELIVRD') return <Badge variant="success" size="sm">DELIVRD ✓</Badge>;
    if (dlr === 'TIMEOUT') return <Badge variant="danger" size="sm">TIMEOUT ⏰</Badge>;
    return <Badge variant="danger" size="sm">{dlr}</Badge>;
  };

  const columns = [
    { key: 'message_id', header: 'ID', render: (log: LogDetail) =>
      <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{log.message_id.slice(-12)}</span> },
    { key: 'consumer', header: 'Consumer', render: (log: LogDetail) =>
      <div><span className="text-[10px] font-medium">{log.client_code || '-'}</span>{log.alias && log.alias !== log.client_code && <p className="text-[9px] text-gray-400">{log.alias}</p>}</div> },
    { key: 'src_type', header: 'Src', render: (log: LogDetail) =>
      <Badge variant="info" size="sm">{log.src_type}</Badge> },
    { key: 'type', header: 'Type', render: (log: LogDetail) =>
      <span className="text-[10px]">{log.type}</span> },
    { key: 'send_type', header: 'Send', render: (log: LogDetail) =>
      <span className="text-[10px] font-mono">{log.send_type}</span> },
    { key: 'job', header: 'S/F', render: (log: LogDetail) =>
      <div className="text-[10px] text-center"><span className="text-green-600">{log.job_submit_success}</span>/<span className="text-red-600">{log.job_submit_fail}</span></div> },
    { key: 'dlr', header: 'DLR', render: (log: LogDetail) =>
      <div className="text-[10px] text-center"><span className="text-green-600">{log.deliver_success}</span>/<span className="text-red-600">{log.deliver_fail}</span></div> },
    { key: 'cost_pay', header: 'Cost/Pay', align: 'right' as const, render: (log: LogDetail) =>
      <div className="text-[10px] text-right"><p className="text-red-500">C:€{log.cost.toFixed(4)}</p><p className="text-green-600">P:€{log.pay.toFixed(4)}</p></div> },
    { key: 'route', header: 'Route', render: (log: LogDetail) =>
      <span className="text-[10px]">{log.route || '-'}</span> },
    { key: 'channel', header: 'Channel', render: (log: LogDetail) =>
      <span className="text-[10px]">{log.channel || '-'}</span> },
    { key: 'result', header: 'Result', render: (log: LogDetail) =>
      <div className="flex items-center gap-1">{log.send_result === 'success' ? <CheckCircle size={12} className="text-green-500"/> : log.send_result === 'failed' ? <XCircle size={12} className="text-red-500"/> : <Clock size={12} className="text-yellow-500"/>}<span className="text-[10px]">{log.send_result}</span></div> },
    { key: 'dlr_result', header: 'DLR Result', render: (log: LogDetail) =>
      getDLRBadge(log.dlr_status) },
    { key: 'send_time', header: 'Send Time', render: (log: LogDetail) =>
      <div><span className="text-[9px] text-gray-500">{log.send_time ? new Date(log.send_time).toLocaleDateString() : ''}</span><br/><span className="text-[9px] text-gray-400">{log.send_time ? new Date(log.send_time).toLocaleTimeString() : ''}</span></div> },
    { key: 'dlr_time', header: 'DLR Time', render: (log: LogDetail) =>
      log.deliver_time ? <span className="text-[9px] text-gray-500">{new Date(log.deliver_time).toLocaleString()}</span> : <span className="text-[9px] text-gray-400">—</span> },
    { key: 'supplier', header: 'Supplier', render: (log: LogDetail) =>
      <span className="text-[10px]">{log.supplier_code || '-'}</span> },
    { key: 'actions', header: '', render: (log: LogDetail) =>
      <button onClick={() => setDetailModal(log)} className="p-1 rounded hover:bg-gray-100"><Eye size={14} className="text-blue-500"/></button> },
  ];

  const renderTab = (tab: LogTab, label: string, icon: React.ReactNode, count: number) => (
    <button onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
      {icon}<span>{label}</span><span className="ml-1 text-[10px] opacity-60">({count})</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">SMS Logs</h1>
          <p className="text-gray-500 text-xs mt-0.5">{logs.length.toLocaleString()} total · Real-time DLR · {autoRefresh ? <span className="text-green-600">Live <span className="animate-pulse">●</span></span> : 'Paused'} · Last: {lastRefresh.toLocaleTimeString()}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={autoRefresh ? 'primary' : 'secondary'} icon={<RefreshCw size={14} className={autoRefresh ? 'animate-spin' : ''}/>}
            onClick={() => setAutoRefresh(!autoRefresh)}>{autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}</Button>
          <Button size="sm" variant="secondary" icon={<Download size={14}/>}>Export</Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-200"><p className="text-lg font-bold">{total.toLocaleString()}</p><p className="text-[10px] text-gray-500">Total Logs</p></div>
        <div className="bg-white rounded-xl p-3 border border-gray-200"><p className="text-lg font-bold text-green-600">{delivered.toLocaleString()}</p><p className="text-[10px] text-gray-500">Delivered {total > 0 ? `(${((delivered / total) * 100).toFixed(1)}%)` : ''}</p></div>
        <div className="bg-white rounded-xl p-3 border border-gray-200"><p className="text-lg font-bold text-red-600">{failed.toLocaleString()}</p><p className="text-[10px] text-gray-500">Failed + Timeout</p></div>
        <div className="bg-white rounded-xl p-3 border border-gray-200"><p className="text-lg font-bold text-yellow-600">{pending.toLocaleString()}</p><p className="text-[10px] text-gray-500">Pending DLR</p></div>
        <div className="bg-white rounded-xl p-3 border border-gray-200"><p className="text-lg font-bold text-blue-600">{logs.filter(l => l.dlr_status === 'TIMEOUT').length}</p><p className="text-[10px] text-gray-500">Timeout (10min)</p></div>
      </div>

      {/* Tab filters */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {renderTab('all', 'All SMS', <MessageSquare size={14}/>, logs.length)}
        {renderTab('client', 'Client SMS', <Radio size={14}/>, logs.filter(l => l.client_code && !l.client_code.startsWith('TEST')).length)}
        {renderTab('supplier', 'Supplier SMS', <Globe size={14}/>, logs.filter(l => l.supplier_code).length)}
        {renderTab('campaign', 'Campaign SMS', <Megaphone size={14}/>, logs.filter(l => l.business_type === 'campaign' || l.business_type === 'Campaign').length)}
        {renderTab('testing', 'Testing SMS', <Mic size={14}/>, logs.filter(l => l.client_code === 'TEST' || l.source === 'voice_otp_test').length)}
      </div>

      {/* Search + Filter bar */}
      <Card>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input type="text" placeholder="Search by ID, destination, sender, client, supplier..." value={search}
              onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs min-w-[120px]">
            <option value="all">All Status</option>
            <option value="delivered">Delivered</option>
            <option value="submitted">Submitted</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
          <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs">
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.client_code}>{c.client_code}</option>)}
          </select>
          <select value={supplierFilter} onChange={e => { setSupplierFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs">
            <option value="all">All Suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.supplier_code}>{s.supplier_code}</option>)}
          </select>
        </div>
      </Card>

      {/* Logs Table */}
      <Card noPadding>
        <div className="overflow-x-auto">
          <Table columns={columns} data={paginated} keyExtractor={l => l.id}/>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}
          totalItems={filtered.length} itemsPerPage={itemsPerPage}/>
      </Card>

      {/* DETAIL MODAL - Full detail view matching user's specification */}
      <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title="SMS Log Detail" size="xl">
        {detailModal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              {/* ID */}
              <DetailField label="ID" value={detailModal.message_id} mono/>
              <DetailField label="Consumer user" value={detailModal.client_code || '-'}/>
              <DetailField label="Alias" value={detailModal.alias || '-'}/>
              
              {/* Source & Type */}
              <DetailField label="Src type" value={detailModal.src_type}/>
              <DetailField label="Type" value={detailModal.type}/>
              <DetailField label="Business type" value={detailModal.business_type}/>
              
              {/* Send Info */}
              <DetailField label="Send type" value={detailModal.send_type}/>
              <DetailField label="Job Submit(S/F)" value={`${detailModal.job_submit_success}/${detailModal.job_submit_fail}`}/>
              <DetailField label="Deliver(S/F)" value={`${detailModal.deliver_success}/${detailModal.deliver_fail}`}/>
              
              {/* Financial */}
              <DetailField label="Cost" value={`€${detailModal.cost.toFixed(6)}`}/>
              <DetailField label="Pay" value={`€${detailModal.pay.toFixed(6)}`}/>
              <DetailField label="Profit" value={`€${(((detailModal.pay || 0) - (detailModal.cost || 0))).toFixed(6)}`} highlight={((detailModal.pay || 0) - (detailModal.cost || 0)) > 0 ? 'green' : 'red'}/>
              
              {/* Routing */}
              <DetailField label="Route" value={detailModal.route || '-'}/>
              <DetailField label="Channel" value={detailModal.channel || '-'}/>
              <DetailField label="Device" value={detailModal.device || '-'}/>
              
              {/* Technical */}
              <DetailField label="Ports" value={detailModal.ports}/>
              <DetailField label="Slot" value={detailModal.slot}/>
              <DetailField label="ICCID" value={detailModal.iccid || '-'}/>
              
              {/* Charging */}
              <DetailField label="Charged points" value={String(detailModal.charged_points)}/>
              <DetailField label="Send result" value={detailModal.send_result} badge={detailModal.send_result === 'success' ? 'success' : detailModal.send_result === 'failed' ? 'danger' : 'warning'}/>
              <DetailField label="Reason" value={detailModal.reason || '-'}/>
              
              {/* DLR */}
              <DetailField label="Deliver result" value={detailModal.deliver_result || '-'} badge={detailModal.deliver_result === 'Success' ? 'success' : 'default'}/>
              <DetailField label="Deliver fail reason" value={detailModal.deliver_fail_reason || '-'}/>
              <DetailField label="Deliver time" value={detailModal.deliver_time ? new Date(detailModal.deliver_time).toLocaleString() : '-'}/>
              
              {/* Timing */}
              <DetailField label="Deliver dur." value={detailModal.deliver_duration ? `${detailModal.deliver_duration}s` : '-'}/>
              <DetailField label="Send time" value={detailModal.send_time ? new Date(detailModal.send_time).toLocaleString() : '-'}/>
              <DetailField label="Done time" value={detailModal.done_time ? new Date(detailModal.done_time).toLocaleString() : '-'}/>
              
              {/* Duration */}
              <DetailField label="Duration" value={detailModal.duration ? `${detailModal.duration}s` : '-'}/>
              <DetailField label="Supplier user" value={detailModal.supplier_user || '-'}/>
              <DetailField label="In msg id" value={detailModal.in_msg_id ? detailModal.in_msg_id.slice(-16) : '-'} mono/>
              
              {/* Message IDs */}
              <DetailField label="Out msg id" value={detailModal.out_msg_id ? detailModal.out_msg_id.slice(-16) : '-'} mono/>
              <DetailField label="MMS attachment" value={detailModal.mms_attachment || '-'}/>
              <DetailField label="MMS title" value={detailModal.mms_title || '-'}/>
            </div>

            {/* SMS Content */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">SMS Content</p>
              <p className="text-sm font-mono bg-white p-2 rounded border">{detailModal.sms_content || '-'}</p>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div><span className="text-[10px] text-gray-500">SMS bytes</span><p className="text-xs font-mono">{detailModal.sms_bytes}</p></div>
                <div><span className="text-[10px] text-gray-500">Dest SMS bytes</span><p className="text-xs font-mono">{detailModal.dest_sms_bytes}</p></div>
              </div>
            </div>

            {/* Recipients + Destination */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">Recipients</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Ori receiver:</span><span className="font-mono">{detailModal.ori_receiver || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Recipients:</span><span className="font-mono">{detailModal.recipients || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Dst receiver:</span><span className="font-mono">{detailModal.dst_receiver || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Sender:</span><span className="font-mono">{detailModal.sender || '-'}</span></div>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">Network</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">MCC:</span><span className="font-mono">{detailModal.mcc || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">MNC:</span><span className="font-mono">{detailModal.mnc || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">IP:</span><span className="font-mono">{detailModal.ip || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Create time:</span><span className="text-[10px]">{detailModal.create_time ? new Date(detailModal.create_time).toLocaleString() : '-'}</span></div>
                </div>
              </div>
            </div>

            {/* Status Summary */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500">Status:</span>
                {getStatusBadge(detailModal.status)}
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500">DLR:</span>
                {getDLRBadge(detailModal.dlr_status)}
              </div>
              {detailModal.error_message && (
                <div className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertTriangle size={12}/>
                  <span>{detailModal.error_message}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// Helper component for detail field
function DetailField({ label, value, mono, badge, highlight }: {
  label: string; value: string; mono?: boolean; badge?: string; highlight?: string;
}) {
  const colorMap: Record<string, string> = { green: 'text-green-600', red: 'text-red-600', blue: 'text-blue-600' };
  return (
    <div className="border-b border-gray-100 pb-1.5">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
      {badge ? (
        <Badge variant={badge as any} size="sm">{value}</Badge>
      ) : (
        <p className={`text-xs ${mono ? 'font-mono' : ''} ${highlight ? colorMap[highlight] || '' : 'text-gray-800'}`}>{value}</p>
      )}
    </div>
  );
}

// Megaphone icon for campaign tab
function Megaphone({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
