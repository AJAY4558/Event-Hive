import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Ticket,
} from 'lucide-react';
import { api } from '@/api/client';
import SeatSelector from '@/components/ui/SeatSelector';
import { useAuthStore } from '@/store/authStore';

function formatDate(value, options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

function formatPrice(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

function performancePrice(performance) {
  if (performance.inventoryKind === 'general') {
    const price = Number(performance.generalAdmission?.price);
    return Number.isFinite(price) ? price : null;
  }
  const values = (performance.priceTiers || []).map((tier) => Number(tier.price)).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export default function EventDetailPage() {
  const { eventId } = useParams();
  const { user, isAuthenticated } = useAuthStore();
  const [phase, setPhase] = useState('loading');
  const [event, setEvent] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedPerformanceId, setSelectedPerformanceId] = useState('');
  const [availability, setAvailability] = useState(null);
  const [availabilityPhase, setAvailabilityPhase] = useState('idle');
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const idempotencyRef = useRef(null);

  useEffect(() => {
    let active = true;
    setPhase('loading');
    api.get('/events/' + eventId)
      .then((response) => {
        if (active) {
          const nextEvent = response.data.event;
          setEvent(nextEvent);
          setSelectedPerformanceId((nextEvent.performances || []).find((performance) =>
            performance.status === 'scheduled' && new Date(performance.startsAt) > new Date()
          )?._id || '');
          setPhase('ready');
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(error.message || 'This event could not be found.');
          setPhase('error');
        }
      });
    return () => { active = false; };
  }, [eventId]);

  const performances = useMemo(() => (event?.performances || [])
    .filter((performance) => performance.status === 'scheduled' && new Date(performance.startsAt) > new Date())
    .sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt)), [event]);
  const selectedPerformance = performances.find((performance) => performance._id === selectedPerformanceId);

  useEffect(() => {
    setSelectedSeatIds([]);
    setQuantity(1);
    setAvailability(null);
    setConfirmedBooking(null);
    setBookingError('');
  }, [selectedPerformanceId]);

  useEffect(() => {
    if (!selectedPerformanceId || !eventId) return undefined;
    let active = true;
    setAvailabilityPhase('loading');
    setAvailabilityError('');
    api.get(`/events/${eventId}/performances/${selectedPerformanceId}/availability`)
      .then((response) => {
        if (!active) return;
        const nextAvailability = response.data;
        setAvailability(nextAvailability);
        setSelectedSeatIds((current) => current.filter((seatId) =>
          nextAvailability.seats?.some((seat) => seat.seatId === seatId && seat.available)
        ));
        setQuantity((current) => Math.min(current, Math.max(1, nextAvailability.generalAdmission?.available || 1)));
        setAvailabilityPhase('ready');
      })
      .catch((error) => {
        if (active) {
          setAvailabilityError(error.message || 'Could not load performance availability.');
          setAvailabilityPhase('error');
        }
      });
    return () => { active = false; };
  }, [eventId, selectedPerformanceId, availabilityRefresh]);

  const selectedSeats = useMemo(() => {
    const byId = new Map((availability?.seats || []).map((seat) => [seat.seatId, seat]));
    return selectedSeatIds.map((seatId) => byId.get(seatId)).filter(Boolean);
  }, [availability, selectedSeatIds]);
  const totalPaise = availability?.inventoryKind === 'general'
    ? Math.round(Number(availability.generalAdmission?.price || 0) * 100) * quantity
    : selectedSeats.reduce((total, seat) => total + Math.round(Number(seat.price || 0) * 100), 0);
  const canBook = isAuthenticated && user?.role === 'customer';

  const toggleSeat = (seat) => {
    setBookingError('');
    setSelectedSeatIds((current) => current.includes(seat.seatId)
      ? current.filter((seatId) => seatId !== seat.seatId)
      : current.length < 20 ? [...current, seat.seatId] : current);
  };

  const refreshAvailability = () => setAvailabilityRefresh((value) => value + 1);

  const submitBooking = async () => {
    if (!selectedPerformance || !availability || !canBook || bookingBusy) return;
    setBookingError('');
    setConfirmedBooking(null);

    const body = availability.inventoryKind === 'general'
      ? { eventId, performanceId: selectedPerformanceId, quantity }
      : { eventId, performanceId: selectedPerformanceId, seatIds: [...selectedSeatIds].sort() };
    const fingerprint = JSON.stringify(body);
    if (!idempotencyRef.current || idempotencyRef.current.fingerprint !== fingerprint) {
      idempotencyRef.current = { fingerprint, key: newIdempotencyKey() };
    }

    setBookingBusy(true);
    try {
      const response = await api.post('/bookings', body, {
        headers: { 'X-Idempotency-Key': idempotencyRef.current.key },
      });
      setConfirmedBooking(response.data.booking);
      setSelectedSeatIds([]);
      idempotencyRef.current = null;
    } catch (error) {
      if (error.status === 409) {
        setBookingError(availability.inventoryKind === 'assigned'
          ? 'Sorry, a selected seat was just booked. Availability has been refreshed; please choose another seat.'
          : error.message || 'The remaining tickets changed. Refresh availability and try again.');
        refreshAvailability();
      } else {
        setBookingError(error.message || 'Booking could not be completed. Retry safely; the same request key will be reused.');
      }
    } finally {
      setBookingBusy(false);
    }
  };

  if (phase === 'loading') {
    return <div className="min-h-dvh bg-surface flex items-center justify-center gap-3 text-gray-400" role="status"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /> Loading event…</div>;
  }

  if (phase === 'error' || !event) {
    return (
      <div className="min-h-dvh bg-surface px-5 py-16 text-white">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <CircleAlert className="mx-auto mb-3 h-7 w-7 text-amber-300" />
          <h1 className="font-display text-xl font-semibold">Event unavailable</h1>
          <p className="mt-2 text-sm text-gray-400">{message}</p>
          <Link className="btn-secondary mt-5" to="/">Back to discover</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand font-display font-bold">E</span><span className="font-display font-bold">EventHive</span></Link>
          <div className="flex items-center gap-1"><Link to="/" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Discover</Link>{canBook && <Link to="/profile" className="btn-ghost">My bookings</Link>}</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:pt-12">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-3xl border border-surface-border bg-gradient-to-br from-brand-950 via-surface-elevated to-surface-card">
              {event.bannerUrl || event.posterUrl ? (
                <img src={event.bannerUrl || event.posterUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-end p-7 sm:p-10"><span className="max-w-xl font-display text-4xl font-bold leading-tight text-white/80 sm:text-5xl">{event.title}</span></div>
              )}
              <span className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur">{event.category}</span>
            </div>
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Event details</p>
              <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-5xl">{event.title}</h1>
              <p className="mt-5 whitespace-pre-line text-base leading-7 text-gray-300">{event.description}</p>
              {event.tags?.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{event.tags.map((tag) => <span key={tag} className="rounded-full border border-surface-border px-3 py-1 text-xs text-gray-400">{tag}</span>)}</div>}
            </div>
          </div>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-surface-border bg-surface-card p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Schedule</p><h2 className="mt-2 font-display text-2xl font-bold">Choose a performance</h2></div>
                <CalendarDays className="h-6 w-6 text-brand-300" />
              </div>
              {performances.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-surface-border p-5 text-sm text-gray-400">No scheduled performances are currently listed.</div>
              ) : (
                <div className="mt-6 flex flex-col gap-3">
                  {performances.map((performance) => {
                    const price = performancePrice(performance);
                    const selected = performance._id === selectedPerformanceId;
                    return (
                      <button
                        key={performance._id}
                        type="button"
                        onClick={() => setSelectedPerformanceId(performance._id)}
                        aria-pressed={selected}
                        className={'w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ' + (selected ? 'border-brand-400/60 bg-brand-500/10' : 'border-surface-border bg-surface-elevated/60 hover:border-gray-600')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div><h3 className="font-semibold">{performance.label}</h3><p className="mt-1 text-sm text-brand-200">{formatDate(performance.startsAt)}</p></div>
                          {price !== null && <span className="shrink-0 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200">From {formatPrice(price)}</span>}
                        </div>
                        <div className="mt-4 grid gap-2 text-xs text-gray-400">
                          <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />{formatDate(performance.startsAt, { hour: 'numeric', minute: '2-digit' })} – {formatDate(performance.endsAt, { hour: 'numeric', minute: '2-digit' })}</p>
                          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" /><span>{performance.venueName}<br />{performance.venueAddress?.line1}, {performance.venueAddress?.city}</span></p>
                          <p className="flex items-center gap-2"><Ticket className="h-3.5 w-3.5 text-gray-500" />{performance.inventoryKind === 'general' ? 'General admission' : 'Assigned seating'}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {selectedPerformance && (
              <section className="rounded-3xl border border-surface-border bg-surface-card p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Tickets</p><h2 className="mt-2 font-display text-xl font-bold">{selectedPerformance.label}</h2></div>
                  <button type="button" onClick={refreshAvailability} className="btn-ghost !px-2" aria-label="Refresh availability"><RefreshCw className="h-4 w-4" /></button>
                </div>

                {availabilityPhase === 'loading' && <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-gray-400" role="status"><Loader2 className="h-4 w-4 animate-spin text-brand-300" /> Checking live availability…</div>}
                {availabilityPhase === 'error' && <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><p>{availabilityError}</p><button type="button" onClick={refreshAvailability} className="btn-secondary mt-3 !px-3 !py-2 text-xs">Try again</button></div>}

                {availabilityPhase === 'ready' && availability?.inventoryKind === 'assigned' && (
                  <div className="mt-5"><SeatSelector availability={availability} selectedSeatIds={selectedSeatIds} onToggle={toggleSeat} disabled={!canBook || bookingBusy} /></div>
                )}

                {availabilityPhase === 'ready' && availability?.inventoryKind === 'general' && (
                  <div className="mt-5 rounded-2xl border border-surface-border bg-surface-elevated/50 p-4">
                    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">General admission</h3><p className="mt-1 text-sm text-gray-400">{availability.generalAdmission.available} {availability.generalAdmission.available === 1 ? 'ticket' : 'tickets'} available</p></div><span className="font-semibold text-brand-200">{formatPrice(availability.generalAdmission.price)} each</span></div>
                    <label className="mt-5 flex items-center justify-between gap-4 text-sm"><span className="text-gray-300">Quantity</span><input aria-label="Ticket quantity" type="number" min="1" max={Math.min(20, availability.generalAdmission.available)} value={quantity} disabled={!canBook || availability.generalAdmission.available < 1 || bookingBusy} onChange={(change) => setQuantity(Math.min(Math.max(1, Number(change.target.value) || 1), Math.min(20, availability.generalAdmission.available)))} className="input !w-24 text-center" /></label>
                  </div>
                )}

                {availabilityPhase === 'ready' && (
                  <div className="mt-5 border-t border-surface-border pt-4">
                    {bookingError && <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100" role="alert">{bookingError}</div>}
                    {confirmedBooking ? (
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4" role="status">
                        <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /><div><h3 className="font-semibold text-emerald-100">Booking confirmed</h3><p className="mt-1 text-sm text-gray-300">Reference <span className="font-mono font-semibold text-white">{confirmedBooking.bookingReference}</span></p></div></div>
                        <p className="mt-3 text-sm text-gray-300">{confirmedBooking.eventSnapshot.title} · {confirmedBooking.performanceSnapshot.label}</p>
                        <p className="mt-1 text-xs text-gray-400">{confirmedBooking.inventoryKind === 'assigned' ? confirmedBooking.seats.map((seat) => `${seat.label} — ${formatPrice(seat.unitPricePaise / 100)}`).join(', ') : `${confirmedBooking.quantity} ${confirmedBooking.ticketType} ticket${confirmedBooking.quantity === 1 ? '' : 's'}`}</p>
                        <div className="mt-3 flex items-center justify-between border-t border-emerald-500/15 pt-3 text-sm"><span className="text-gray-300">Total</span><strong>{formatPrice(confirmedBooking.totalPaise / 100)}</strong></div>
                        <Link to={'/profile/bookings/' + confirmedBooking._id} className="btn-secondary mt-4 w-full justify-center">Open My Bookings</Link>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3" aria-live="polite"><span className="text-sm text-gray-300">{availability.inventoryKind === 'assigned' ? `${selectedSeats.length} seat${selectedSeats.length === 1 ? '' : 's'} selected` : `${quantity} ticket${quantity === 1 ? '' : 's'}`}</span><strong className="text-lg">{formatPrice(totalPaise / 100)}</strong></div>
                        {canBook ? (
                          <button type="button" disabled={bookingBusy || !availability.isBookable || (availability.inventoryKind === 'assigned' ? selectedSeatIds.length === 0 : availability.generalAdmission.available < quantity)} onClick={submitBooking} className="btn-primary mt-4 w-full justify-center">
                            {bookingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                            {bookingBusy ? 'Confirming booking…' : 'Book Now'}
                          </button>
                        ) : isAuthenticated ? (
                          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">Only customer accounts can make bookings.</p>
                        ) : (
                          <Link to="/login" state={{ from: { pathname: `/events/${eventId}` } }} className="btn-primary mt-4 w-full justify-center">Sign in to book</Link>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
