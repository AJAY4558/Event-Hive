import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CalendarDays, CircleAlert, Loader2, RefreshCw, Ticket } from 'lucide-react';
import { api } from '@/api/client';

function priceLabel(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
}

function dateLabel(value) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function EventBookingsPage() {
  const { eventId } = useParams();
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await api.get(`/events/organizer/${eventId}/bookings`, { params: { limit: 100 } });
      setData(response.data);
      setPhase('ready');
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Could not load event bookings.');
      setPhase('error');
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load, reload]);

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="border-b border-surface-border bg-surface-card/70"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link to="/organizer" className="flex items-center gap-2 text-sm text-gray-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Organizer studio</Link><Link to={`/organizer/events/${eventId}/edit`} className="btn-secondary !px-3 !py-2 text-xs">Manage event</Link></div></header>
      <main className="mx-auto max-w-6xl px-5 py-9 lg:px-8 lg:py-12">
        {data && <><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Organizer reports</p><h1 className="mt-2 font-display text-3xl font-bold">{data.event.title} bookings</h1></>}
        <div className="mt-6 flex justify-end"><button type="button" onClick={() => setReload((value) => value + 1)} className="btn-secondary !px-3 !py-2" aria-label="Refresh booking report"><RefreshCw className="h-4 w-4" /></button></div>
        {phase === 'loading' && <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-gray-400" role="status"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /> Loading event bookings…</div>}
        {phase === 'error' && <div className="card mx-auto mt-5 flex max-w-xl flex-col items-center p-8 text-center"><CircleAlert className="mb-3 h-7 w-7 text-amber-300" /><h2 className="font-semibold">Booking report unavailable</h2><p className="mt-2 text-sm text-gray-400">{message}</p></div>}
        {phase === 'ready' && data && <>
          <div className="mb-8 grid gap-3 sm:grid-cols-3">
            <Metric icon={Ticket} label="Confirmed bookings" value={data.metrics.bookingCount} />
            <Metric icon={CalendarDays} label="Tickets sold" value={data.metrics.ticketsSold} />
            <Metric icon={Banknote} label="Confirmed value" value={priceLabel(data.metrics.revenuePaise)} />
          </div>
          {data.bookings.length === 0 ? <div className="card p-7 text-center"><h2 className="font-display text-lg font-semibold">No bookings yet</h2><p className="mt-2 text-sm text-gray-400">Confirmed ticket records will appear here.</p></div> : (
            <div className="space-y-3">
              {data.bookings.map((booking) => <article key={booking._id} className="rounded-2xl border border-surface-border bg-surface-card p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><span className={'rounded-full border px-2.5 py-1 text-[11px] capitalize ' + (booking.status === 'confirmed' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-gray-600 bg-gray-500/10 text-gray-400')}>{booking.status}</span><p className="mt-3 font-mono text-sm font-semibold">{booking.bookingReference}</p><p className="mt-1 text-sm text-gray-300">{booking.eventSnapshot.title} · {booking.performanceSnapshot.label}</p></div><div className="sm:text-right"><p className="font-semibold">{priceLabel(booking.totalPaise)}</p><p className="mt-1 text-xs text-gray-500">{booking.quantity} ticket{booking.quantity === 1 ? '' : 's'}</p></div></div>
                <div className="mt-4 grid gap-3 border-t border-surface-border pt-4 text-sm sm:grid-cols-2"><p className="flex items-center gap-2 text-gray-400"><CalendarDays className="h-4 w-4 text-brand-300" />{dateLabel(booking.performanceSnapshot.startsAt)}</p><p className="text-gray-400">{booking.performanceSnapshot.venueName} · {booking.performanceSnapshot.venueAddress?.city}</p></div>
                <p className="mt-3 text-xs text-gray-400">{booking.inventoryKind === 'assigned' ? booking.seats.map((seat) => `${seat.label} · ${seat.category} · ${priceLabel(seat.unitPricePaise)}`).join(' / ') : `${booking.ticketType} · ${priceLabel(booking.unitPricePaise)} each`}</p>
              </article>)}
            </div>
          )}
          {data.pages > 1 && <p className="mt-5 text-center text-xs text-gray-500">Showing page {data.page} of {data.pages}; use the API pagination query to inspect other pages.</p>}
        </>}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return <div className="rounded-2xl border border-surface-border bg-surface-card p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-widest text-gray-500">{label}</span><Icon className="h-4 w-4 text-brand-300" /></div><p className="mt-3 font-display text-2xl font-bold">{value}</p></div>;
}
