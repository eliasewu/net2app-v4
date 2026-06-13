import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Client, Supplier, Trunk, Route, RoutePlan, Rate, MCCMNC, Invoice, Payment, SMSLog, EmailTemplate, OTTDevice, APIConnector, User, DashboardStats, Notification, Campaign, Translation, VoiceOTPConfig } from '../types';
import { mockRoutes, mockUsers, hourlyTrafficData, dailyRevenueData, topDestinations } from './mockData';
import dbService from '../services/databaseService';

// ==================== LOCALSTORAGE FALLBACK ====================
const DB = {
  clients: 'clients_db', suppliers: 'suppliers_db', sms_logs: 'sms_logs_db',
  trunks: 'trunks_db', routes: 'routes_db', route_plans: 'route_plans_db',
  rates: 'rates_db', mccmnc: 'mccmnc_db', invoices: 'invoices_db', payments: 'payments_db',
  campaigns: 'campaigns_db', translations: 'translations_db', notifications: 'notifications_db',
  ott_devices: 'ott_devices_db', platform_settings: 'platform_settings_db', smtp_config: 'smtp_config_db',
  voice_otp_configs: 'voice_otp_configs_db', email_templates: 'email_templates_db',
};
function loadLocal<T>(key: string, fallback: T): T { try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch {} localStorage.setItem(key, JSON.stringify(fallback)); return fallback; }
function saveLocal(key: string, v: any) { localStorage.setItem(key, JSON.stringify(v)); }

const ONE_CLIENT: Client = { id:'1',client_code:'CLT001',company_name:'TechCorp Global',contact_person:'John Smith',email:'john@techcorp.com',phone:'+1234567890',address:'123 Tech Street, Silicon Valley',country:'USA',smpp_username:'techcorp_smpp',smpp_password:'secure123',smpp_ip:'0.0.0.0',smpp_port:2775,system_type:'SMPP',max_tps:100,billing_mode:'dlr',currency:'EUR',balance:5000,credit_limit:10000,api_enabled:true,webhook_url:'',force_dlr:true,routing_plan_id:'1',rate_plan_id:'1',status:'active',created_at:'2024-01-15T10:00:00Z',updated_at:'2024-01-15T10:00:00Z'};
const ONE_SUPPLIER: Supplier = { id:'1',supplier_code:'SUP001',company_name:'GlobalSMS Gateway',contact_person:'Alex Turner',email:'alex@globalsms.com',phone:'+1111222233',connection_type:'smpp',smpp_host:'smpp.globalsms.com',smpp_port:2775,smpp_username:'net2app_client',smpp_password:'gateway123',system_id:'NET2APP',api_url:'',api_key:'',api_method:'POST',balance:50000,credit_limit:100000,currency:'EUR',bind_status:'bound',status:'active',consecutive_failures:0,created_at:'2024-01-01T00:00:00Z',updated_at:'2024-03-20T12:00:00Z'};

interface DataContextType {
  clients: Client[]; suppliers: Supplier[]; trunks: Trunk[]; routes: Route[]; routePlans: RoutePlan[];
  rates: Rate[]; mccmnc: MCCMNC[]; invoices: Invoice[]; payments: Payment[]; smsLogs: SMSLog[];
  ottDevices: OTTDevice[]; apiConnectors: APIConnector[]; users: User[];
  emailTemplates: EmailTemplate[]; notifications: Notification[]; campaigns: Campaign[];
  translations: Translation[]; voiceOTPConfigs: VoiceOTPConfig[];
  dashboardStats: DashboardStats; hourlyTraffic: typeof hourlyTrafficData; dailyRevenue: typeof dailyRevenueData; topDest: typeof topDestinations;
  loading: boolean;
  addClient:(c:Omit<Client,'id'|'created_at'|'updated_at'>)=>void; updateClient:(id:string,c:Partial<Client>)=>void; deleteClient:(id:string)=>void;
  addSupplier:(s:Omit<Supplier,'id'|'created_at'|'updated_at'>)=>void; updateSupplier:(id:string,s:Partial<Supplier>)=>void; deleteSupplier:(id:string)=>void;
  addSMSLog:(log:Omit<SMSLog,'id'|'created_at'|'submit_time'>)=>void;
  addTrunk:(t:Omit<Trunk,'id'|'created_at'>)=>void; updateTrunk:(id:string,t:Partial<Trunk>)=>void; deleteTrunk:(id:string)=>void;
  addRoute:(r:Omit<Route,'id'|'created_at'>)=>void; updateRoute:(id:string,r:Partial<Route>)=>void; deleteRoute:(id:string)=>void;
  addRoutePlan:(p:Omit<RoutePlan,'id'|'created_at'>)=>void; updateRoutePlan:(id:string,p:Partial<RoutePlan>)=>void; deleteRoutePlan:(id:string)=>void;
  addRate:(r:Omit<Rate,'id'>)=>void; updateRate:(id:string,r:Partial<Rate>)=>void; deleteRate:(id:string)=>void;
  addMCCMNC:(m:Omit<MCCMNC,'id'>)=>void; updateMCCMNC:(id:string,m:Partial<MCCMNC>)=>void; deleteMCCMNC:(id:string)=>void;
  addInvoice:(i:Omit<Invoice,'id'|'created_at'>)=>void; updateInvoice:(id:string,i:Partial<Invoice>)=>void;
  addPayment:(p:Omit<Payment,'id'|'created_at'>)=>void;
  addOTTDevice:(d:Omit<OTTDevice,'id'|'created_at'>)=>void; updateOTTDevice:(id:string,d:Partial<OTTDevice>)=>void; deleteOTTDevice:(id:string)=>void;
  markNotificationRead:(id:string)=>void;
  addCampaign:(c:Omit<Campaign,'id'|'created_at'>)=>void; updateCampaign:(id:string,c:Partial<Campaign>)=>void; deleteCampaign:(id:string)=>void;
  addTranslation:(t:Omit<Translation,'id'|'created_at'>)=>void; updateTranslation:(id:string,t:Partial<Translation>)=>void; deleteTranslation:(id:string)=>void;
  getClientById:(id:string)=>Client|undefined; getSupplierById:(id:string)=>Supplier|undefined; getTrunkById:(id:string)=>Trunk|undefined;
  updateEmailTemplate:(id:string,data:Partial<EmailTemplate>)=>void;
  platformSettings:Record<string,string>; updatePlatformSetting:(key:string,value:string)=>void;
  smtpConfig:any; updateSMTPConfig:(data:any)=>void;
}

const DataContext = createContext<DataContextType|undefined>(undefined);
const gid=()=>'rec_'+Date.now()+'_'+Math.random().toString(36).substr(2,9);
const nw=()=>new Date().toISOString();

export const DataProvider:React.FC<{children:ReactNode}> = ({children}) => {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>(()=>loadLocal(DB.clients,[ONE_CLIENT]));
  const [suppliers, setSuppliers] = useState<Supplier[]>(()=>loadLocal(DB.suppliers,[ONE_SUPPLIER]));
  const [trunks, setTrunks] = useState<Trunk[]>(()=>loadLocal(DB.trunks,[]));
  const [routes, setRoutes] = useState<Route[]>(()=>loadLocal(DB.routes,mockRoutes));
  const [routePlans, setRoutePlans] = useState<RoutePlan[]>(()=>loadLocal(DB.route_plans,[]));
  const [rates, setRates] = useState<Rate[]>(()=>loadLocal(DB.rates,[]));
  const [mccmnc, setMCCMNC] = useState<MCCMNC[]>(()=>loadLocal(DB.mccmnc,[]));
  const [invoices, setInvoices] = useState<Invoice[]>(()=>loadLocal(DB.invoices,[]));
  const [payments, setPayments] = useState<Payment[]>(()=>loadLocal(DB.payments,[]));
  const [smsLogs, setSMSLogs] = useState<SMSLog[]>(()=>loadLocal(DB.sms_logs,[]));
  const [ottDevices, setOTTDevices] = useState<OTTDevice[]>(()=>loadLocal(DB.ott_devices,[]));
  const [notifications, setNotifications] = useState<Notification[]>(()=>loadLocal(DB.notifications,[]));
  const [campaigns, setCampaigns] = useState<Campaign[]>(()=>loadLocal(DB.campaigns,[]));
  const [translations, setTranslations] = useState<Translation[]>(()=>loadLocal(DB.translations,[]));
  const [voiceOTPConfigs] = useState<VoiceOTPConfig[]>(()=>loadLocal(DB.voice_otp_configs,[]));
  const [platformSettings, setPlatformSettings] = useState<Record<string,string>>(()=>loadLocal(DB.platform_settings,{platform_name:'NET2APP Hub',currency:'EUR',default_tax_rate:'19.00'}));
  const [smtpConfig, setSMTPConfig] = useState<any>(()=>loadLocal(DB.smtp_config,{host:'smtp.gmail.com',port:587,encryption:'tls'}));
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(()=>loadLocal(DB.email_templates,[]));

  // ==================== LOAD ALL DATA FROM PG ON MOUNT ====================
  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      try {
        const [c, sup, t, r, rp, ra, mcc, inv, pay, sms, ott, notif, camp, trans, ps, smtp, et] = await Promise.all([
          dbService.getClients(), dbService.getSuppliers(), dbService.getTrunks(),
          dbService.getRoutes(), dbService.getRoutePlans(), dbService.getRates(),
          dbService.getMCCMNC(), dbService.getInvoices(), dbService.getPayments(),
          dbService.getSMSLogs(), dbService.getOTTDevices(), dbService.getNotifications(),
          dbService.getCampaigns(), dbService.getTranslations(),
          dbService.getPlatformSettings(), dbService.getSMTPConfig(), dbService.getEmailTemplates(),
        ]);
        if (!mounted) return;
        if (c.length > 0) setClients(c as Client[]);
        if (sup.length > 0) setSuppliers(sup as Supplier[]);
        if (t.length > 0) setTrunks(t as Trunk[]);
        if (r.length > 0) setRoutes(r as Route[]);
        if (rp.length > 0) setRoutePlans(rp as RoutePlan[]);
        if (ra.length > 0) setRates(ra as Rate[]);
        if (mcc.length > 0) setMCCMNC(mcc as MCCMNC[]);
        if (inv.length > 0) setInvoices(inv as Invoice[]);
        if (pay.length > 0) setPayments(pay as Payment[]);
        if (sms.length > 0) setSMSLogs(sms as SMSLog[]);
        if (ott.length > 0) setOTTDevices(ott as OTTDevice[]);
        if (notif.length > 0) setNotifications(notif as Notification[]);
        if (camp.length > 0) setCampaigns(camp as Campaign[]);
        if (trans.length > 0) setTranslations(trans as Translation[]);
        if (Object.keys(ps).length > 0) setPlatformSettings(ps);
        if (smtp && smtp.host) setSMTPConfig(smtp);
        if (et.length > 0) setEmailTemplates(et as EmailTemplate[]);
      } catch (e) { console.warn('DataContext: Using localStorage fallback', e); }
      if (mounted) setLoading(false);
    };
    loadAll();
    return () => { mounted = false; };
  }, []);

  // ==================== CLIENT CRUD ====================
  const addClient=useCallback((c:Omit<Client,'id'|'created_at'|'updated_at'>)=>{
    const nc = {...c, id:gid(), created_at:nw(), updated_at:nw()} as Client;
    setClients(p=>{const n=[...p,nc]; saveLocal(DB.clients,n); return n;});
    dbService.createClient(c).then(r => { if (r && r.id) { setClients(p=>p.map(x=>x.id===nc.id?{...x,id:r.id}:x)); } }).catch(e=>console.warn('API createClient error:',e));
  },[]);
  const updateClient=useCallback((id:string,c:Partial<Client>)=>{
    setClients(p=>{const n=p.map(x=>x.id===id?{...x,...c,updated_at:nw()}:x); saveLocal(DB.clients,n); return n;});
    dbService.updateClient(id, c).catch(e=>console.warn('API updateClient error:',e));
  },[]);
  const deleteClient=useCallback((id:string)=>{
    setClients(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.clients,n); return n;});
    dbService.deleteClient(id).catch(e=>console.warn('API deleteClient error:',e));
  },[]);

  // ==================== SUPPLIER CRUD ====================
  const addSupplier=useCallback((s:Omit<Supplier,'id'|'created_at'|'updated_at'>)=>{
    const ns = {...s, id:gid(), created_at:nw(), updated_at:nw()} as Supplier;
    setSuppliers(p=>{const n=[...p,ns]; saveLocal(DB.suppliers,n); return n;});
    dbService.createSupplier(s).then(r=>{if(r&&r.id)setSuppliers(p=>p.map(x=>x.id===ns.id?{...x,id:r.id}:x));}).catch(e=>console.warn('API createSupplier error:',e));
  },[]);
  const updateSupplier=useCallback((id:string,s:Partial<Supplier>)=>{
    setSuppliers(p=>{const n=p.map(x=>x.id===id?{...x,...s,updated_at:nw()}:x); saveLocal(DB.suppliers,n); return n;});
    dbService.updateSupplier(id, s).catch(e=>console.warn('API updateSupplier error:',e));
  },[]);
  const deleteSupplier=useCallback((id:string)=>{
    setSuppliers(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.suppliers,n); return n;});
    dbService.deleteSupplier(id).catch(e=>console.warn('API deleteSupplier error:',e));
  },[]);

  // ==================== SMS LOGS ====================
  const addSMSLog=useCallback((log:Omit<SMSLog,'id'|'created_at'|'submit_time'>)=>{
    const nl:SMSLog={...log,id:gid(),submit_time:nw(),created_at:nw(),supplier_id:log.supplier_id??null,supplier_code:log.supplier_code??null,dlr_status:log.dlr_status??null,dlr_timestamp:log.dlr_timestamp??null,delivery_time:log.delivery_time??null,error_code:log.error_code??null,error_message:log.error_message??null,route_name:log.route_name??null,trunk_name:log.trunk_name??null};
    setSMSLogs(p=>{const n=[nl,...p]; saveLocal(DB.sms_logs,n); return n;});
    dbService.createSMSLog(nl).then(r=>{if(r&&r.id)setSMSLogs(prev=>prev.map(x=>x.id===nl.id?{...x,id:r.id}:x));}).catch(e=>console.warn('API createSMSLog error:',e));
  },[]);

  // ==================== TRUNKS ====================
  const addTrunk=useCallback((t:Omit<Trunk,'id'|'created_at'>)=>{
    const nt = {...t, id:gid(), created_at:nw()} as Trunk;
    setTrunks(p=>{const n=[...p,nt]; saveLocal(DB.trunks,n); return n;});
    dbService.createTrunk(t).then(r=>{if(r&&r.id)setTrunks(prev=>prev.map(x=>x.id===nt.id?{...x,id:r.id}:x));}).catch(e=>console.warn('API createTrunk error:',e));
  },[]);
  const updateTrunk=useCallback((id:string,t:Partial<Trunk>)=>{
    setTrunks(p=>{const n=p.map(x=>x.id===id?{...x,...t}:x); saveLocal(DB.trunks,n); return n;});
    dbService.updateTrunk(id, t).catch(e=>console.warn('API updateTrunk error:',e));
  },[]);
  const deleteTrunk=useCallback((id:string)=>{
    setTrunks(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.trunks,n); return n;});
    dbService.deleteTrunk(id).catch(e=>console.warn('API deleteTrunk error:',e));
  },[]);

  // ==================== ROUTES ====================
  const addRoute=useCallback((r:Omit<Route,'id'|'created_at'>)=>{
    const nr = {...r, id:gid(), created_at:nw()} as Route;
    setRoutes(p=>{const n=[...p,nr]; saveLocal(DB.routes,n); return n;});
    dbService.createRoute(r).then(rd=>{if(rd&&rd.id)setRoutes(prev=>prev.map(x=>x.id===nr.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createRoute error:',e));
  },[]);
  const updateRoute=useCallback((id:string,r:Partial<Route>)=>{
    setRoutes(p=>{const n=p.map(x=>x.id===id?{...x,...r}:x); saveLocal(DB.routes,n); return n;});
    dbService.updateRoute(id, r).catch(e=>console.warn('API updateRoute error:',e));
  },[]);
  const deleteRoute=useCallback((id:string)=>{
    setRoutes(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.routes,n); return n;});
    dbService.deleteRoute(id).catch(e=>console.warn('API deleteRoute error:',e));
  },[]);

  // ==================== ROUTE PLANS ====================
  const addRoutePlan=useCallback((p:Omit<RoutePlan,'id'|'created_at'>)=>{
    const np = {...p, id:gid(), created_at:nw()} as RoutePlan;
    setRoutePlans(prev=>{const n=[...prev,np]; saveLocal(DB.route_plans,n); return n;});
    dbService.createRoutePlan(p).then(rd=>{if(rd&&rd.id)setRoutePlans(prev=>prev.map(x=>x.id===np.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createRoutePlan error:',e));
  },[]);
  const updateRoutePlan=useCallback((id:string,p:Partial<RoutePlan>)=>{
    setRoutePlans(prev=>{const n=prev.map(x=>x.id===id?{...x,...p}:x); saveLocal(DB.route_plans,n); return n;});
    dbService.updateRoutePlan(id, p).catch(e=>console.warn('API updateRoutePlan error:',e));
  },[]);
  const deleteRoutePlan=useCallback((id:string)=>{
    setRoutePlans(prev=>{const n=prev.filter(x=>x.id!==id); saveLocal(DB.route_plans,n); return n;});
    dbService.deleteRoutePlan(id).catch(e=>console.warn('API deleteRoutePlan error:',e));
  },[]);

  // ==================== RATES ====================
  const addRate=useCallback((r:Omit<Rate,'id'>)=>{
    const nr = {...r, id:gid()} as Rate;
    setRates(p=>{const n=[...p,nr]; saveLocal(DB.rates,n); return n;});
    dbService.createRate(r).then(rd=>{if(rd&&rd.id)setRates(prev=>prev.map(x=>x.id===nr.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createRate error:',e));
  },[]);
  const updateRate=useCallback((id:string,r:Partial<Rate>)=>{
    setRates(p=>{const n=p.map(x=>x.id===id?{...x,...r}:x); saveLocal(DB.rates,n); return n;});
    dbService.updateRate(id, r).catch(e=>console.warn('API updateRate error:',e));
  },[]);
  const deleteRate=useCallback((id:string)=>{
    setRates(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.rates,n); return n;});
    dbService.deleteRate(id).catch(e=>console.warn('API deleteRate error:',e));
  },[]);

  // ==================== MCCMNC ====================
  const addMCCMNC=useCallback((m:Omit<MCCMNC,'id'>)=>{
    const nm = {...m, id:gid()} as MCCMNC;
    setMCCMNC(p=>{const n=[...p,nm]; saveLocal(DB.mccmnc,n); return n;});
    dbService.createMCCMNC(m).then(rd=>{if(rd&&rd.id)setMCCMNC(prev=>prev.map(x=>x.id===nm.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createMCCMNC error:',e));
  },[]);
  const updateMCCMNC=useCallback((id:string,m:Partial<MCCMNC>)=>{
    setMCCMNC(p=>{const n=p.map(x=>x.id===id?{...x,...m}:x); saveLocal(DB.mccmnc,n); return n;});
    dbService.updateMCCMNC(id, m).catch(e=>console.warn('API updateMCCMNC error:',e));
  },[]);
  const deleteMCCMNC=useCallback((id:string)=>{
    setMCCMNC(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.mccmnc,n); return n;});
    dbService.deleteMCCMNC(id).catch(e=>console.warn('API deleteMCCMNC error:',e));
  },[]);

  // ==================== INVOICES ====================
  const addInvoice=useCallback((i:Omit<Invoice,'id'|'created_at'>)=>{
    const ni = {...i, id:gid(), created_at:nw()} as Invoice;
    setInvoices(p=>{const n=[...p,ni]; saveLocal(DB.invoices,n); return n;});
    dbService.createInvoice(i).then(rd=>{if(rd&&rd.id)setInvoices(prev=>prev.map(x=>x.id===ni.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createInvoice error:',e));
  },[]);
  const updateInvoice=useCallback((id:string,i:Partial<Invoice>)=>{
    setInvoices(p=>{const n=p.map(x=>x.id===id?{...x,...i}:x); saveLocal(DB.invoices,n); return n;});
    dbService.updateInvoice(id, i).catch(e=>console.warn('API updateInvoice error:',e));
  },[]);

  // ==================== PAYMENTS ====================
  const addPayment=useCallback((p:Omit<Payment,'id'|'created_at'>)=>{
    const np = {...p, id:gid(), created_at:nw()} as Payment;
    setPayments(prev=>{const n=[...prev,np]; saveLocal(DB.payments,n); return n;});
    dbService.createPayment(p).then(rd=>{if(rd&&rd.id)setPayments(prev=>prev.map(x=>x.id===np.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createPayment error:',e));
  },[]);

  // ==================== OTT DEVICES ====================
  const addOTTDevice=useCallback((d:Omit<OTTDevice,'id'|'created_at'>)=>{
    const nd = {...d, id:gid(), created_at:nw()} as OTTDevice;
    setOTTDevices(p=>{const n=[...p,nd]; saveLocal(DB.ott_devices,n); return n;});
    dbService.createOTTDevice(d).then(rd=>{if(rd&&rd.id)setOTTDevices(prev=>prev.map(x=>x.id===nd.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createOTTDevice error:',e));
  },[]);
  const updateOTTDevice=useCallback((id:string,d:Partial<OTTDevice>)=>{
    setOTTDevices(p=>{const n=p.map(x=>x.id===id?{...x,...d}:x); saveLocal(DB.ott_devices,n); return n;});
    dbService.updateOTTDevice(id, d).catch(e=>console.warn('API updateOTTDevice error:',e));
  },[]);
  const deleteOTTDevice=useCallback((id:string)=>{
    setOTTDevices(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.ott_devices,n); return n;});
    dbService.deleteOTTDevice(id).catch(e=>console.warn('API deleteOTTDevice error:',e));
  },[]);

  // ==================== NOTIFICATIONS ====================
  const markNotificationRead=useCallback((id:string)=>{
    setNotifications(p=>{const n=p.map(x=>x.id===id?{...x,is_read:true}:x); saveLocal(DB.notifications,n); return n;});
    dbService.markNotificationRead(id).catch(e=>console.warn('API markNotificationRead error:',e));
  },[]);

  // ==================== CAMPAIGNS ====================
  const addCampaign=useCallback((c:Omit<Campaign,'id'|'created_at'>)=>{
    const nc = {...c, id:gid(), created_at:nw()} as Campaign;
    setCampaigns(p=>{const n=[...p,nc]; saveLocal(DB.campaigns,n); return n;});
    dbService.createCampaign(c).then(rd=>{if(rd&&rd.id)setCampaigns(prev=>prev.map(x=>x.id===nc.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createCampaign error:',e));
  },[]);
  const updateCampaign=useCallback((id:string,c:Partial<Campaign>)=>{
    setCampaigns(p=>{const n=p.map(x=>x.id===id?{...x,...c}:x); saveLocal(DB.campaigns,n); return n;});
    dbService.updateCampaign(id, c).catch(e=>console.warn('API updateCampaign error:',e));
  },[]);
  const deleteCampaign=useCallback((id:string)=>{
    setCampaigns(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.campaigns,n); return n;});
    dbService.deleteCampaign(id).catch(e=>console.warn('API deleteCampaign error:',e));
  },[]);

  // ==================== TRANSLATIONS ====================
  const addTranslation=useCallback((t:Omit<Translation,'id'|'created_at'>)=>{
    const nt = {...t, id:gid(), created_at:nw()} as Translation;
    setTranslations(p=>{const n=[...p,nt]; saveLocal(DB.translations,n); return n;});
    dbService.createTranslation(t).then(rd=>{if(rd&&rd.id)setTranslations(prev=>prev.map(x=>x.id===nt.id?{...x,id:rd.id}:x));}).catch(e=>console.warn('API createTranslation error:',e));
  },[]);
  const updateTranslation=useCallback((id:string,t:Partial<Translation>)=>{
    setTranslations(p=>{const n=p.map(x=>x.id===id?{...x,...t}:x); saveLocal(DB.translations,n); return n;});
    dbService.updateTranslation(id, t).catch(e=>console.warn('API updateTranslation error:',e));
  },[]);
  const deleteTranslation=useCallback((id:string)=>{
    setTranslations(p=>{const n=p.filter(x=>x.id!==id); saveLocal(DB.translations,n); return n;});
    dbService.deleteTranslation(id).catch(e=>console.warn('API deleteTranslation error:',e));
  },[]);

  // ==================== SETTINGS ====================
  const updatePlatformSetting=useCallback((key:string,value:string)=>{
    setPlatformSettings(p=>{const n={...p,[key]:value}; saveLocal(DB.platform_settings,n); return n;});
    dbService.updatePlatformSetting(key, value).catch(e=>console.warn('API updatePlatformSetting error:',e));
  },[]);
  const updateSMTPConfig=useCallback((data:any)=>{
    setSMTPConfig((prev:any)=>{const n={...prev,...data}; saveLocal(DB.smtp_config,n); return n;});
    dbService.updateSMTPConfig(data).catch(e=>console.warn('API updateSMTPConfig error:',e));
  },[]);
  const updateEmailTemplate=useCallback((id:string,data:Partial<EmailTemplate>)=>{
    setEmailTemplates(p=>{const n=p.map(t=>t.id===id?{...t,...data}:t); saveLocal(DB.email_templates,n); return n;});
    dbService.updateEmailTemplate(id, data).catch(e=>console.warn('API updateEmailTemplate error:',e));
  },[]);

  // ==================== HELPERS ====================
  const getClientById=(id:string)=>clients.find(c=>c.id===id);
  const getSupplierById=(id:string)=>suppliers.find(s=>s.id===id);
  const getTrunkById=(id:string)=>trunks.find(t=>t.id===id);

  // ==================== DASHBOARD STATS (computed from current data) ====================
  const dashboardStats: DashboardStats = {
    total_clients:clients.length,active_clients:clients.filter(c=>c.status==='active').length,
    total_suppliers:suppliers.length,active_suppliers:suppliers.filter(s=>s.status==='active').length,
    total_sms_today:smsLogs.length,total_sms_month:smsLogs.length,
    delivered_percentage:smsLogs.length>0?(smsLogs.filter(l=>l.status==='delivered').length/smsLogs.length)*100:0,
    failed_percentage:smsLogs.length>0?(smsLogs.filter(l=>l.status==='failed').length/smsLogs.length)*100:0,
    revenue_today:smsLogs.reduce((s,l)=>s+((l.client_rate||0)*(l.message_parts||1)),0),
    revenue_month:smsLogs.reduce((s,l)=>s+((l.client_rate||0)*(l.message_parts||1)),0)*30,
    cost_today:smsLogs.reduce((s,l)=>s+((l.supplier_rate||0)*(l.message_parts||1)),0),
    cost_month:smsLogs.reduce((s,l)=>s+((l.supplier_rate||0)*(l.message_parts||1)),0)*30,
    profit_today:smsLogs.reduce((s,l)=>s+(l.profit||0),0),
    profit_month:smsLogs.reduce((s,l)=>s+(l.profit||0),0)*30,
    active_binds:suppliers.filter(s=>s.bind_status==='bound').length,total_binds:suppliers.length,
  };

  return (<DataContext.Provider value={{loading,clients,suppliers,trunks,routes,routePlans,rates,mccmnc,invoices,payments,smsLogs,ottDevices,apiConnectors:[],users:mockUsers as User[],emailTemplates,notifications,campaigns,translations,voiceOTPConfigs,dashboardStats,hourlyTraffic:hourlyTrafficData,dailyRevenue:dailyRevenueData,topDest:topDestinations,addClient,updateClient,deleteClient,addSupplier,updateSupplier,deleteSupplier,addSMSLog,addTrunk,updateTrunk,deleteTrunk,addRoute,updateRoute,deleteRoute,addRoutePlan,updateRoutePlan,deleteRoutePlan,addRate,updateRate,deleteRate,addMCCMNC,updateMCCMNC,deleteMCCMNC,addInvoice,updateInvoice,addPayment,addOTTDevice,updateOTTDevice,deleteOTTDevice,markNotificationRead,addCampaign,updateCampaign,deleteCampaign,addTranslation,updateTranslation,deleteTranslation,getClientById,getSupplierById,getTrunkById,updateEmailTemplate,platformSettings,updatePlatformSetting,smtpConfig,updateSMTPConfig}}>{children}</DataContext.Provider>);
};

export const useData = () => { const c=useContext(DataContext); if(!c) throw new Error('useData required'); return c; };
