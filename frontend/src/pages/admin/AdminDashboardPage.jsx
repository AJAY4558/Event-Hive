import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, CalendarDays, CircleAlert, Loader2, RefreshCw, ShieldCheck, Ticket, Users } from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';

const TABS = ['overview', 'users', 'events', 'audit'];

function money(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(paise || 0) / 100);
}

function dateLabel(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function AdminDashboardPage() {
  const currentUser = useAuthStore((state) => state.user);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [draftRoles, setDraftRoles] = useState({});
  const [search, setSearch] = useState('');
  const [bookingIdInput, setBookingIdInput] = useState('');
  const [supportBooking, setSupportBooking] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  const loadDashboard = useCallback(async () => {
    setPhase('loading');
    setMessage('');
    try {
      const [overviewResponse, userResponse, eventResponse, auditResponse] = await Promise.all([
        api.get('/admin/overview'),
        api.get('/admin/users', { params: { limit: 100, search: search || undefined } }),
        api.get('/events/organizer', { params: { limit: 100 } }),
        api.get('/admin/audit-logs', { params: { limit: 50 } }),
      ]);
      setOverview(overviewResponse.data);
      setUsers(userResponse.data.users || []);
      setEvents(eventResponse.data.events || []);
      setAuditLogs(auditResponse.data.logs || []);
      setPhase('ready');
    } catch (error) {
      setMessage(error.message || 'Admin data could not be loaded.');
      setPhase('error');
    }
  }, [search]);

  useEffect(() => { loadDashboard(); }, [loadDashboard, reload]);

  const updateRole = async (user) => {
    const role = draftRoles[user._id];
    if (!role || role === user.role) return;
    setBusyId(user._id);
    setMessage('');
    try {
      const response = await api.patch(`/admin/users/${user._id}/role`, { role });
      setUsers((current) => current.map((item) => item._id === user._id ? { ...item, role: response.data.user.role } : item));
      setDraftRoles((current) => ({ ...current, [user._id]: response.data.user.role }));
      setMessage('User role updated and recorded in the admin audit log.');
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error.message || 'Role update failed.');
    } finally {
      setBusyId('');
    }
  };

  const moderateEvent = async (event, action) => {
    if (action === 'cancel' && !window.confirm(`Cancel “${event.title}” and its scheduled performances?`)) return;
    setBusyId(event._id);
    setMessage('');
    try {
      await api.post(`/events/${event._id}/${action}`);
      setMessage(action === 'publish' ? 'Event published.' : 'Event cancelled.');
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error.message || 'Event moderation failed.');
    } finally {
      setBusyId('');
    }
  };

  const findSupportBooking = async (event) => {
    event.preventDefault();
    setSupportBooking(null);
    setMessage('');
    try {
      const response = await api.get(`/admin/bookings/${bookingIdInput.trim()}`);
      setSupportBooking(response.data.booking);
    } catch (error) {
      setMessage(error.message || 'Booking record could not be found. Enter its booking ID.');
    }
  };

  const cancelSupportBooking = async () => {
    if (!supportBooking || !window.confirm(`Cancel booking ${supportBooking.bookingReference}?`)) return;
    setBusyId(supportBooking._id);
    try {
      const response = await api.post(`/admin/bookings/${supportBooking._id}/cancel`);
      setSupportBooking(response.data.booking);
      setMessage('Booking cancelled and the inventory release was audited.');
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error.message || 'Support cancellation failed.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="border-b border-surface-border bg-surface-card/70"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8"><Link to="/" className="flex items-center gap-2 text-sm text-gray-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> EventHive</Link><button type="button" onClick={() => setReload((value) => value + 1)} className="btn-secondary !px-3 !py-2" aria-label="Refresh admin data"><RefreshCw className="h-4 w-4" /></button></div></header>
      <main className="mx-auto max-w-7xl px-5 py-9 lg:px-8 lg:py-12">
        <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Operations</p><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Admin console</h1><p className="mt-2 text-sm text-gray-400">Moderate listings, manage roles, and review audited support actions.</p></div>
        {message && <div className="mb-5 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 text-sm text-brand-100" role="status">{message}</div>}
        {phase === 'loading' && <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-gray-400" role="status"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /> Loading operations…</div>}
        {phase === 'error' && <div className="card mx-auto flex max-w-xl flex-col items-center p-8 text-center"><CircleAlert className="mb-3 h-7 w-7 text-amber-300" /><h2 className="font-semibold">Admin data unavailable</h2><p className="mt-2 text-sm text-gray-400">{message}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="btn-secondary mt-5">Try again</button></div>}
        {phase === 'ready' && overview && <>
          <nav className="mb-7 flex gap-2 overflow-x-auto border-b border-surface-border" aria-label="Admin sections">
            {TABS.map((tab) => <button type="button" key={tab} onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab} className={'shrink-0 border-b-2 px-4 py-3 text-sm capitalize transition ' + (activeTab === tab ? 'border-brand-400 text-brand-200' : 'border-transparent text-gray-400 hover:text-white')}>{tab}</button>)}
          </nav>
          {activeTab === 'overview' && <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={Users} label="Users" value={overview.users.total} detail={`${overview.users.byRole?.organizer || 0} organizers`} />
              <Metric icon={CalendarDays} label="Events" value={overview.events.total} detail={`${overview.events.upcoming} upcoming`} />
              <Metric icon={Ticket} label="Confirmed tickets" value={overview.bookings.ticketsConfirmed} detail={`${overview.bookings.confirmed} bookings`} />
              <Metric icon={Activity} label="Confirmed value" value={money(overview.bookings.confirmedValuePaise)} detail={`${overview.bookings.cancelled} cancelled bookings`} />
            </div>
            <section className="mt-8 rounded-2xl border border-surface-border bg-surface-card p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-300" /><h2 className="font-display text-xl font-semibold">Booking support</h2></div><form onSubmit={findSupportBooking} className="flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="support-booking-id">Booking ID</label><input id="support-booking-id" required value={bookingIdInput} onChange={(event) => setBookingIdInput(event.target.value)} className="input flex-1" placeholder="Enter booking ID" /><button type="submit" className="btn-secondary justify-center">Find booking</button></form>
              {supportBooking && <div className="mt-5 rounded-xl border border-surface-border bg-surface-elevated/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{supportBooking.bookingReference}</p><p className="mt-1 text-sm text-gray-300">{supportBooking.eventSnapshot.title} · {supportBooking.performanceSnapshot.label}</p></div><span className="text-xs capitalize text-gray-400">{supportBooking.status}</span></div><p className="mt-3 text-xs text-gray-400">{supportBooking.quantity} ticket{supportBooking.quantity === 1 ? '' : 's'} · {money(supportBooking.totalPaise)}</p>{supportBooking.status === 'confirmed' && <button type="button" onClick={cancelSupportBooking} disabled={busyId === supportBooking._id} className="btn-secondary mt-4 !border-red-500/25 !px-3 !py-2 text-xs text-red-200">{busyId === supportBooking._id ? 'Working…' : 'Cancel booking with audit record'}</button>}</div>}
            </section>
          </>}
          {activeTab === 'users' && <section><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display text-xl font-semibold">Users</h2><form onSubmit={(event) => { event.preventDefault(); setReload((value) => value + 1); }} className="flex gap-2"><input aria-label="Search users by name or email" value={search} onChange={(event) => setSearch(event.target.value)} className="input !w-64" placeholder="Search users" /><button type="submit" className="btn-secondary !px-3">Search</button></form></div><div className="space-y-3">{users.map((user) => <article key={user._id} className="flex flex-col justify-between gap-4 rounded-2xl border border-surface-border bg-surface-card p-4 sm:flex-row sm:items-center"><div><h3 className="font-semibold">{user.name}</h3><p className="mt-1 text-xs text-gray-500">{user.email} · joined {new Date(user.createdAt).toLocaleDateString()}</p></div><div className="flex items-center gap-2"><select aria-label={'Role for ' + user.name} value={draftRoles[user._id] ?? user.role} disabled={String(user._id) === currentUser?._id} onChange={(event) => setDraftRoles((current) => ({ ...current, [user._id]: event.target.value }))} className="input !w-36 !py-2"><option value="customer">Customer</option><option value="organizer">Organizer</option><option value="admin">Admin</option></select><button type="button" disabled={busyId === user._id || !draftRoles[user._id] || draftRoles[user._id] === user.role || String(user._id) === currentUser?._id} onClick={() => updateRole(user)} className="btn-secondary !px-3 !py-2 text-xs">{busyId === user._id ? 'Saving…' : 'Save role'}</button></div></article>)}</div></section>}
          {activeTab === 'events' && <section><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Event moderation</h2><span className="text-xs text-gray-500">{events.length} loaded</span></div><div className="space-y-3">{events.map((event) => <article key={event._id} className="flex flex-col justify-between gap-4 rounded-2xl border border-surface-border bg-surface-card p-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{event.title}</h3><span className="rounded-full border border-surface-border px-2 py-1 text-[10px] capitalize text-gray-400">{event.status}</span></div><p className="mt-1 text-xs text-gray-500">{event.category} · {event.performances?.length || 0} performances</p></div><div className="flex flex-wrap gap-2"><Link to={`/organizer/events/${event._id}/edit`} className="btn-ghost !px-3 !py-2 text-xs">Open event</Link>{event.status === 'draft' && <button type="button" onClick={() => moderateEvent(event, 'publish')} disabled={busyId === event._id} className="btn-secondary !px-3 !py-2 text-xs">Publish</button>}{event.status !== 'cancelled' && <button type="button" onClick={() => moderateEvent(event, 'cancel')} disabled={busyId === event._id} className="btn-secondary !border-red-500/25 !px-3 !py-2 text-xs text-red-200">Cancel</button>}</div></article>)}</div></section>}
          {activeTab === 'audit' && <section><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Admin audit log</h2><span className="text-xs text-gray-500">Latest {auditLogs.length}</span></div><div className="space-y-3">{auditLogs.map((log) => <article key={log._id} className="rounded-2xl border border-surface-border bg-surface-card p-4"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><p className="font-semibold">{log.action}</p><p className="mt-1 text-xs text-gray-500">{log.resourceType} · {log.resourceId}</p></div><time className="text-xs text-gray-500">{dateLabel(log.createdAt)}</time></div><pre className="mt-3 overflow-x-auto rounded-lg bg-surface-elevated/60 p-3 text-xs text-gray-400">{JSON.stringify(log.metadata || {}, null, 2)}</pre></article>)}</div></section>}
        </>}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }) {
  return <div className="rounded-2xl border border-surface-border bg-surface-card p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-widest text-gray-500">{label}</span><Icon className="h-4 w-4 text-brand-300" /></div><p className="mt-3 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>;
}
