import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CircleAlert, Loader2, MapPin, RefreshCw, Ticket, XCircle } from 'lucide-react';
import { api } from '@/api/client';

function dateLabel(value) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function priceLabel(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
}

export default function MyBookingsPage() {
  const { bookingId } = useParams();
  const [bookings, setBookings] = useState([]);
  const [phase, setPhase] = useState('loading');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reload, setReload] = useState(0);

  const loadBookings = useCallback(async () => {
    setPhase('loading');
    setMessage('');
    try {
      const response = await api.get('/bookings/mine', { params: { page: 1, limit: 50 } });
      setBookings(response.data.bookings || []);
      setPhase('ready');
    } catch (error) {
      setMessage(error.message || 'Could not load your bookings.');
      setPhase('error');
    }
  }, []);

  useEffect(() => { loadBookings(); }, [loadBookings, reload]);

  const groups = useMemo(() => {
    const now = Date.now();
    return {
      upcoming: bookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.performanceSnapshot.startsAt).getTime() >= now),
      past: bookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.performanceSnapshot.startsAt).getTime() < now),
      cancelled: bookings.filter((booking) => booking.status === 'cancelled'),
    };
  }, [bookings]);

  const cancelBooking = async (booking) => {
    setBusyId(booking._id);
    setMessage('');
    try {
      const response = await api.post(`/bookings/${booking._id}/cancel`);
      setBookings((current) => current.map((item) => item._id === booking._id ? response.data.booking : item));
    } catch (error) {
      setMessage(error.message || 'This booking could not be cancelled.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="border-b border-surface-border bg-surface-card/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand font-display font-bold">E</span><span className="font-display font-bold">EventHive <span className="text-gray-500">/ My bookings</span></span></Link>
          <div className="flex items-center gap-2"><Link to="/" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Discover</Link><button type="button" onClick={() => setReload((value) => value + 1)} className="btn-secondary !px-3 !py-2" aria-label="Refresh bookings"><RefreshCw className="h-4 w-4" /></button></div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-9 sm:py-12">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Your tickets</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">My bookings</h1>
          <p className="mt-2 text-sm text-gray-400">Confirmed tickets and saved booking details for your account.</p>
        </div>

        {message && <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100" role="alert">{message}</div>}
        {phase === 'loading' && <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-gray-400" role="status"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /> Loading your bookings…</div>}
        {phase === 'error' && <div className="card mx-auto flex max-w-xl flex-col items-center p-8 text-center"><CircleAlert className="mb-3 h-7 w-7 text-amber-300" /><h2 className="font-semibold">Bookings unavailable</h2><p className="mt-2 text-sm text-gray-400">{message}</p><button type="button" onClick={() => setReload((value) => value + 1)} className="btn-secondary mt-5">Try again</button></div>}
        {phase === 'ready' && bookings.length === 0 && <div className="card flex flex-col items-center p-9 text-center"><Ticket className="mb-3 h-7 w-7 text-brand-300" /><h2 className="font-display text-xl font-semibold">No bookings yet</h2><p className="mt-2 max-w-md text-sm leading-6 text-gray-400">When you book an event, your reference and ticket details will be kept here.</p><Link to="/" className="btn-primary mt-5">Explore events</Link></div>}
        {phase === 'ready' && bookings.length > 0 && (
          <div className="space-y-10">
            <BookingGroup title="Upcoming" bookings={groups.upcoming} activeBookingId={bookingId} busyId={busyId} onCancel={cancelBooking} />
            <BookingGroup title="Past" bookings={groups.past} activeBookingId={bookingId} busyId={busyId} onCancel={cancelBooking} />
            <BookingGroup title="Cancelled" bookings={groups.cancelled} activeBookingId={bookingId} busyId={busyId} onCancel={cancelBooking} />
          </div>
        )}
      </main>
    </div>
  );
}

function BookingGroup({ title, bookings, activeBookingId, busyId, onCancel }) {
  if (!bookings.length) return null;
  return (
    <section aria-label={title + ' bookings'}>
      <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">{title}</h2><span className="text-xs text-gray-500">{bookings.length} ticket{bookings.length === 1 ? '' : 's'}</span></div>
      <div className="space-y-4">
        {bookings.map((booking) => {
          const start = new Date(booking.performanceSnapshot.startsAt);
          const canCancel = booking.status === 'confirmed' && start.getTime() > Date.now();
          const highlighted = booking._id === activeBookingId;
          return (
            <article key={booking._id} className={'rounded-2xl border bg-surface-card p-5 sm:p-6 ' + (highlighted ? 'border-brand-400/60 ring-1 ring-brand-400/20' : 'border-surface-border')}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className={'rounded-full border px-2.5 py-1 text-[11px] capitalize ' + (booking.status === 'confirmed' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-gray-600 bg-gray-500/10 text-gray-400')}>{booking.status}</span><span className="text-xs text-gray-500">{booking.inventoryKind === 'assigned' ? 'Assigned seats' : 'General admission'}</span></div>
                  <h3 className="mt-3 font-display text-xl font-semibold">{booking.eventSnapshot.title}</h3>
                  <p className="mt-1 text-sm text-brand-200">{booking.performanceSnapshot.label}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface-elevated/60 px-4 py-3 sm:text-right"><p className="text-[10px] uppercase tracking-widest text-gray-500">Booking reference</p><p className="mt-1 font-mono text-sm font-semibold text-white">{booking.bookingReference}</p></div>
              </div>

              <div className="mt-5 grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-2">
                <p className="flex items-start gap-2 text-sm text-gray-300"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />{dateLabel(booking.performanceSnapshot.startsAt)}</p>
                <p className="flex items-start gap-2 text-sm text-gray-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" /><span>{booking.performanceSnapshot.venueName}<br /><span className="text-xs text-gray-500">{booking.performanceSnapshot.venueAddress?.line1}, {booking.performanceSnapshot.venueAddress?.city}</span></span></p>
              </div>

              <div className="mt-4 rounded-xl border border-surface-border bg-surface-elevated/40 p-4">
                <div className="flex items-center justify-between gap-3 text-sm"><span className="text-gray-400">{booking.inventoryKind === 'assigned' ? 'Seats' : booking.ticketType}</span><span className="font-medium">{booking.inventoryKind === 'assigned' ? booking.seats.map((seat) => `${seat.label} (${priceLabel(seat.unitPricePaise)})`).join(', ') : `× ${booking.quantity} · ${priceLabel(booking.unitPricePaise)} each`}</span></div>
                <div className="mt-3 flex items-center justify-between border-t border-surface-border pt-3"><span className="text-sm text-gray-400">Total</span><strong>{priceLabel(booking.totalPaise)}</strong></div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Link to={'/profile/bookings/' + booking._id} className="text-sm font-semibold text-brand-300 hover:text-brand-200">View ticket details</Link>
                {canCancel && <button type="button" disabled={busyId === booking._id} onClick={() => onCancel(booking)} className="btn-secondary !border-red-500/25 !px-3 !py-2 text-xs text-red-200 hover:!border-red-400/50">{busyId === booking._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Cancel booking</button>}
                {!canCancel && booking.status === 'confirmed' && <span className="text-xs text-gray-500">Cancellation is unavailable after the performance starts.</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
