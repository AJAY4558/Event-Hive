import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, CircleAlert, Loader2, MapPin, Plus, RefreshCw, Ticket, Banknote } from 'lucide-react';
import { api } from '@/api/client';

function dateLabel(value) {
  if (!value) return 'No date scheduled';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export default function OrganizerDashboardPage() {
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({ draft: 0, published: 0, cancelled: 0 });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  const loadEvents = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await api.get('/events/organizer', { params: { page, limit: 50 } });
      setEvents(response.data.events || []);
      setCounts(response.data.counts || { draft: 0, published: 0, cancelled: 0 });
      setPages(response.data.pages || 0);
      setTotal(response.data.total || 0);
      setPhase('ready');
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Could not load your events.');
      setPhase('error');
    }
  }, [page]);

  useEffect(() => { loadEvents(); }, [loadEvents, reload]);

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="border-b border-surface-border bg-surface-card/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand font-display font-bold">E</span><span className="font-display font-bold">EventHive <span className="text-gray-500">/ Studio</span></span></Link>
          <div className="flex items-center gap-2"><Link to="/organizer/venues" className="btn-secondary !px-3 !py-2 text-xs sm:!px-4 sm:text-sm"><MapPin className="h-4 w-4" /> Venues</Link><Link to="/organizer/events/new" className="btn-primary !px-3 !py-2 text-xs sm:!px-4 sm:text-sm"><Plus className="h-4 w-4" /> Create event</Link></div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Your workspace</p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">Organizer studio</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">Create events, manage performances, and configure venues and seating layouts.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/" className="btn-ghost">View discovery <ArrowRight className="h-4 w-4" /></Link>
            <button type="button" className="btn-secondary" onClick={() => setReload((value) => value + 1)} aria-label="Refresh events"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={Ticket} label="Events" value={phase === 'ready' ? total : '—'} detail="Your drafts and listings" />
          <SummaryCard icon={CalendarDays} label="Published" value={phase === 'ready' ? counts.published : '—'} detail="Visible in discovery" />
          <SummaryCard icon={Ticket} label="Tickets sold" value={phase === 'ready' ? events.reduce((sum, event) => sum + (event.metrics?.ticketsSold || 0), 0) : '—'} detail="Across this page" />
          <SummaryCard icon={Banknote} label="Confirmed value" value={phase === 'ready' ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(events.reduce((sum, event) => sum + (event.metrics?.revenuePaise || 0), 0) / 100) : '—'} detail="From confirmed bookings" />
          <SummaryCard icon={MapPin} label="Venues" value="Manage" detail="Layouts and capacities" href="/organizer/venues" />
        </div>

        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Your events</h2>{phase === 'ready' && <span className="text-xs text-gray-500">{events.length} total</span>}</div>

        {phase === 'loading' && <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-gray-400" role="status"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /> Loading your workspace…</div>}
        {phase === 'error' && <div className="card mx-auto flex max-w-xl flex-col items-center p-8 text-center"><CircleAlert className="mb-3 h-7 w-7 text-amber-300" /><h3 className="font-semibold">Workspace unavailable</h3><p className="mt-2 text-sm text-gray-400">{message}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="btn-secondary mt-5"><RefreshCw className="h-4 w-4" /> Try again</button></div>}
        {phase === 'ready' && events.length === 0 && <div className="card flex flex-col items-center p-10 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300"><Ticket className="h-6 w-6" /></div><h3 className="font-display text-xl font-semibold">Start with an event draft</h3><p className="mt-2 max-w-md text-sm leading-6 text-gray-400">Add the details, choose a venue, configure a performance, then publish it when it’s ready.</p><Link to="/organizer/events/new" className="btn-primary mt-5"><Plus className="h-4 w-4" /> Create your first event</Link></div>}
        {phase === 'ready' && events.length > 0 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <EventRow key={event._id} event={event} />)}</div>}
        {phase === 'ready' && pages > 1 && <nav className="mt-7 flex items-center justify-center gap-3" aria-label="Organizer event pages"><button type="button" className="btn-secondary !px-4 !py-2 text-xs" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="text-xs text-gray-500">Page {page} of {pages}</span><button type="button" className="btn-secondary !px-4 !py-2 text-xs" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
      </main>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, href }) {
  const content = <div className="rounded-2xl border border-surface-border bg-surface-card p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-widest text-gray-500">{label}</span><Icon className="h-4 w-4 text-brand-300" /></div><div className="mt-3 font-display text-3xl font-bold">{value}</div><p className="mt-1 text-xs text-gray-500">{detail}</p></div>;
  return href ? <Link to={href} className="transition hover:border-brand-500/30">{content}</Link> : content;
}

function EventRow({ event }) {
  const next = (event.performances || []).filter((performance) => performance.status === 'scheduled').sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];
  const statusClass = event.status === 'published' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : event.status === 'cancelled' ? 'border-red-500/25 bg-red-500/10 text-red-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300';
  return (
    <article className="rounded-2xl border border-surface-border bg-surface-card p-5 transition hover:border-brand-500/30">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-widest text-brand-300">{event.category}</p><h3 className="mt-2 line-clamp-2 font-display text-lg font-semibold">{event.title}</h3></div><span className={'rounded-full border px-2.5 py-1 text-[11px] capitalize ' + statusClass}>{event.status}</span></div>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-gray-400">{event.description}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{next ? dateLabel(next.startsAt) : 'No performance yet'}</span><span>{(event.performances || []).filter((performance) => performance.status === 'scheduled').length} scheduled</span></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><Link to={'/organizer/events/' + event._id + '/edit'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 hover:text-brand-200">Manage event <ArrowRight className="h-4 w-4" /></Link>{event.metrics?.bookingCount > 0 && <span className="text-xs text-gray-500">{event.metrics.bookingCount} booking{event.metrics.bookingCount === 1 ? '' : 's'} · {event.metrics.ticketsSold} tickets</span>}</div>
    </article>
  );
}
