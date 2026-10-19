import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CircleAlert, Loader2, MapPin, Plus, Save, Send, Trash2 } from 'lucide-react';
import { api } from '@/api/client';

const CATEGORIES = [
  ['movie', 'Cinema'], ['concert', 'Concert'], ['comedy', 'Comedy'], ['theatre', 'Theatre'],
  ['sports', 'Sports'], ['workshop', 'Workshop'], ['conference', 'Conference'],
  ['festival', 'Festival'], ['exhibition', 'Exhibition'], ['college', 'College event'], ['other', 'Other'],
];

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function priceLabel(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function collectCategories(layout) {
  const names = new Set();
  (layout?.sections || []).forEach((section) => (section.rows || []).forEach((row) => (row.seats || []).forEach((seat) => {
    if (!seat.blocked) names.add(seat.category);
  })));
  return [...names].sort();
}

const EMPTY_EVENT = { title: '', description: '', category: 'concert', tags: '', ageRating: '', posterUrl: '', bannerUrl: '' };
const EMPTY_PERFORMANCE = { label: 'Performance', venueId: '', inventoryKind: 'assigned', startsAt: '', endsAt: '', capacity: '', price: '0' };

export default function EventEditorPage() {
  const { eventId } = useParams();
  const isNew = !eventId;
  const navigate = useNavigate();
  const [phase, setPhase] = useState('loading');
  const [eventData, setEventData] = useState(null);
  const [venues, setVenues] = useState([]);
  const [eventForm, setEventForm] = useState(EMPTY_EVENT);
  const [performanceForm, setPerformanceForm] = useState(EMPTY_PERFORMANCE);
  const [editingPerformanceId, setEditingPerformanceId] = useState(null);
  const [priceTiers, setPriceTiers] = useState({});
  const [editingCategories, setEditingCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setPhase('loading');
    Promise.all([
      api.get('/venues'),
      isNew ? Promise.resolve({ data: { event: null } }) : api.get('/events/organizer/' + eventId),
    ]).then(([venueResponse, eventResponse]) => {
      if (!active) return;
      const loadedEvent = eventResponse.data.event;
      setVenues(venueResponse.data.venues || []);
      setEventData(loadedEvent);
      if (loadedEvent) {
        setEventForm({
          title: loadedEvent.title || '',
          description: loadedEvent.description || '',
          category: loadedEvent.category || 'other',
          tags: (loadedEvent.tags || []).join(', '),
          ageRating: loadedEvent.ageRating || '',
          posterUrl: loadedEvent.posterUrl || '',
          bannerUrl: loadedEvent.bannerUrl || '',
        });
      }
      setPhase('ready');
    }).catch((loadError) => {
      if (active) {
        setError(loadError.message || 'Could not load event setup.');
        setPhase('error');
      }
    });
    return () => { active = false; };
  }, [eventId, isNew]);

  const selectedVenue = useMemo(() => venues.find((venue) => venue._id === performanceForm.venueId), [venues, performanceForm.venueId]);
  const activeCategories = useMemo(() => editingPerformanceId ? editingCategories : collectCategories(selectedVenue?.layout), [editingPerformanceId, editingCategories, selectedVenue]);

  const setEventField = (key, value) => setEventForm((current) => ({ ...current, [key]: value }));
  const setPerformanceField = (key, value) => setPerformanceForm((current) => ({ ...current, [key]: value }));

  const refreshEvent = async () => {
    if (!eventId) return null;
    const response = await api.get('/events/organizer/' + eventId);
    setEventData(response.data.event);
    return response.data.event;
  };

  const saveEventDetails = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        category: eventForm.category,
        tags: eventForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        ageRating: eventForm.ageRating.trim() || undefined,
        posterUrl: eventForm.posterUrl.trim() || undefined,
        bannerUrl: eventForm.bannerUrl.trim() || undefined,
      };
      if (isNew) {
        const response = await api.post('/events', payload);
        navigate('/organizer/events/' + response.data.event._id + '/edit', { replace: true });
      } else {
        await api.patch('/events/' + eventId, payload);
        await refreshEvent();
        setNotice('Event details saved.');
      }
    } catch (saveError) {
      setError(saveError.message || 'Could not save event details.');
    } finally {
      setBusy(false);
    }
  };

  const selectVenue = (venueId) => {
    const venue = venues.find((item) => item._id === venueId);
    const inventoryKind = venue?.inventoryKind === 'general' ? 'general' : 'assigned';
    setPerformanceForm((current) => ({ ...current, venueId, inventoryKind, capacity: venue ? String(venue.capacity) : '' }));
    setEditingPerformanceId(null);
    setEditingCategories([]);
    setPriceTiers({});
  };

  const submitPerformance = async (event) => {
    event.preventDefault();
    if (!eventData?._id) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        label: performanceForm.label.trim(),
        startsAt: new Date(performanceForm.startsAt).toISOString(),
        endsAt: new Date(performanceForm.endsAt).toISOString(),
      };
      if (!editingPerformanceId) {
        payload.venueId = performanceForm.venueId;
        payload.inventoryKind = performanceForm.inventoryKind;
      }
      if (performanceForm.inventoryKind === 'general') {
        payload.capacity = Number(performanceForm.capacity);
        payload.price = Number(performanceForm.price);
      } else {
        payload.priceTiers = activeCategories.map((category) => ({ category, price: Number(priceTiers[category] ?? 0) }));
      }

      if (editingPerformanceId) {
        await api.patch('/events/' + eventId + '/performances/' + editingPerformanceId, payload);
      } else {
        await api.post('/events/' + eventId + '/performances', payload);
      }
      await refreshEvent();
      resetPerformanceForm();
      setNotice(editingPerformanceId ? 'Performance updated.' : 'Performance added with its own inventory configuration.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save this performance.');
    } finally {
      setBusy(false);
    }
  };

  const resetPerformanceForm = () => {
    setPerformanceForm(EMPTY_PERFORMANCE);
    setEditingPerformanceId(null);
    setEditingCategories([]);
    setPriceTiers({});
  };

  const editPerformance = (performance) => {
    setEditingPerformanceId(performance._id);
    setEditingCategories((performance.priceTiers || []).map((tier) => tier.category));
    setPriceTiers(Object.fromEntries((performance.priceTiers || []).map((tier) => [tier.category, String(tier.price)])));
    setPerformanceForm({
      label: performance.label || 'Performance',
      venueId: performance.venueId,
      inventoryKind: performance.inventoryKind,
      startsAt: localDateTime(performance.startsAt),
      endsAt: localDateTime(performance.endsAt),
      capacity: String(performance.generalAdmission?.capacity || ''),
      price: String(performance.generalAdmission?.price ?? 0),
    });
    setError('');
    setNotice('Editing performance schedule and organizer pricing. Its venue and saved seat map remain fixed.');
  };

  const publishEvent = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/events/' + eventId + '/publish');
      setEventData(response.data.event);
      setNotice('Event published and visible in discovery.');
    } catch (publishError) {
      setError(publishError.message || 'Could not publish event.');
    } finally {
      setBusy(false);
    }
  };

  const cancelEvent = async () => {
    if (!window.confirm('Cancel this event and all of its scheduled performances?')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/events/' + eventId + '/cancel');
      setEventData(response.data.event);
      setNotice('Event cancelled.');
    } catch (cancelError) {
      setError(cancelError.message || 'Could not cancel event.');
    } finally {
      setBusy(false);
    }
  };

  const cancelPerformance = async (performance) => {
    if (!window.confirm('Cancel ' + performance.label + '?')) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/events/' + eventId + '/performances/' + performance._id + '/cancel');
      await refreshEvent();
      setNotice('Performance cancelled.');
    } catch (cancelError) {
      setError(cancelError.message || 'Could not cancel performance.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading') return <div className="min-h-dvh bg-surface flex items-center justify-center gap-3 text-gray-400" role="status"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /> Loading event setup…</div>;
  if (phase === 'error') return <div className="min-h-dvh bg-surface px-5 py-14"><div className="card mx-auto max-w-xl p-7 text-center"><CircleAlert className="mx-auto mb-3 h-7 w-7 text-amber-300" /><h1 className="font-display text-xl font-semibold">Event setup unavailable</h1><p className="mt-2 text-sm text-gray-400">{error}</p><Link className="btn-secondary mt-5" to="/organizer">Back to studio</Link></div></div>;

  const activePerformances = (eventData?.performances || []).filter((performance) => performance.status === 'scheduled').sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt));

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="border-b border-surface-border bg-surface-card/70"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8"><Link to="/organizer" className="flex items-center gap-2 text-sm text-gray-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Organizer studio</Link><div className="flex items-center gap-3"><span className="font-display font-bold">EventHive</span>{eventData && <Link to={'/organizer/events/' + eventData._id + '/bookings'} className="btn-secondary !px-3 !py-2 text-xs">Booking report</Link>}</div></div></header>
      <main className="mx-auto max-w-5xl px-5 py-9 lg:px-8 lg:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Event wizard · Step 1 of 2</p><h1 className="font-display text-3xl font-bold sm:text-4xl">{isNew ? 'Create an event' : eventData?.title || 'Edit event'}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Build the event details, add one or more independently configured performances, then publish when ready.</p></div>{eventData && <span className="w-fit rounded-full border border-surface-border px-3 py-1.5 text-xs capitalize text-gray-300">{eventData.status}</span>}</div>

        {error && <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div className="mt-6 rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-sm text-brand-200">{notice}</div>}

        <form onSubmit={saveEventDetails} className="card mt-7 p-5 sm:p-7">
          <div className="mb-5"><h2 className="font-display text-xl font-semibold">Event details</h2><p className="mt-1 text-xs text-gray-500">This information appears on the public event page after publishing.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-400">Event title</span><input required minLength="3" maxLength="140" value={eventForm.title} onChange={(event) => setEventField('title', event.target.value)} className="input" placeholder="An evening of live jazz" /></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Category</span><select value={eventForm.category} onChange={(event) => setEventField('category', event.target.value)} className="input">{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Age rating (optional)</span><input maxLength="20" value={eventForm.ageRating} onChange={(event) => setEventField('ageRating', event.target.value)} className="input" placeholder="All ages" /></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-400">Description</span><textarea required minLength="20" maxLength="10000" rows="6" value={eventForm.description} onChange={(event) => setEventField('description', event.target.value)} className="input resize-y" placeholder="Tell people what to expect…" /><span className="mt-1 block text-right text-[10px] text-gray-600">{eventForm.description.length}/10000</span></label>
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-400">Tags (comma separated)</span><input value={eventForm.tags} onChange={(event) => setEventField('tags', event.target.value)} className="input" placeholder="live music, indie, evening" /></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Poster image URL (optional)</span><input type="url" value={eventForm.posterUrl} onChange={(event) => setEventField('posterUrl', event.target.value)} className="input" placeholder="https://…" /></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Banner image URL (optional)</span><input type="url" value={eventForm.bannerUrl} onChange={(event) => setEventField('bannerUrl', event.target.value)} className="input" placeholder="https://…" /></label>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3"><button type="submit" disabled={busy} className="btn-primary"><Save className="h-4 w-4" />{busy ? 'Saving…' : isNew ? 'Save draft and continue' : 'Save event details'}</button>{!isNew && eventData?.status !== 'cancelled' && <button type="button" onClick={publishEvent} disabled={busy || !activePerformances.length} className="btn-secondary"><Send className="h-4 w-4" />Publish event</button>}{!isNew && eventData?.status !== 'cancelled' && <button type="button" onClick={cancelEvent} disabled={busy} className="btn-ghost text-gray-500 hover:text-red-300"><Trash2 className="h-4 w-4" />Cancel event</button>}</div>
          {!isNew && eventData?.status === 'draft' && !activePerformances.length && <p className="mt-3 text-xs text-amber-300">Add a future performance before publishing.</p>}
        </form>

        {!isNew && eventData && eventData.status !== 'cancelled' && (
          <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_0.9fr]">
            <section className="card p-5 sm:p-7">
              <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Event wizard · Step 2 of 2</p><h2 className="mt-2 font-display text-xl font-semibold">Performances & inventory</h2><p className="mt-1 text-xs leading-5 text-gray-500">Each performance stores its own schedule, venue, capacity, prices, and seating snapshot.</p></div><CalendarDays className="h-5 w-5 shrink-0 text-brand-300" /></div>

              {venues.length === 0 ? <div className="rounded-xl border border-dashed border-surface-border p-5 text-sm text-gray-400">Add a venue before scheduling a performance.<br /><Link to="/organizer/venues" className="mt-3 inline-flex items-center gap-1 text-brand-300 hover:text-brand-200">Open venue manager <ArrowLeft className="h-3.5 w-3.5 rotate-180" /></Link></div> : (
                <form onSubmit={submitPerformance} className="flex flex-col gap-4">
                  <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Performance name</span><input required maxLength="100" value={performanceForm.label} onChange={(event) => setPerformanceField('label', event.target.value)} className="input" placeholder="Friday evening" /></label>
                  <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Venue</span><select required disabled={Boolean(editingPerformanceId)} value={performanceForm.venueId} onChange={(event) => selectVenue(event.target.value)} className="input"><option value="">Choose a venue</option>{venues.filter((venue) => venue.isActive).map((venue) => <option key={venue._id} value={venue._id}>{venue.name} · {venue.address?.city}</option>)}</select></label>
                  {selectedVenue?.inventoryKind === 'mixed' && !editingPerformanceId && <label><span className="mb-1.5 block text-xs font-medium text-gray-400">This performance uses</span><select value={performanceForm.inventoryKind} onChange={(event) => setPerformanceField('inventoryKind', event.target.value)} className="input"><option value="assigned">Assigned seating</option><option value="general">General admission</option></select></label>}
                  <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-medium text-gray-400">Starts</span><input required type="datetime-local" value={performanceForm.startsAt} onChange={(event) => setPerformanceField('startsAt', event.target.value)} className="input" /></label><label><span className="mb-1.5 block text-xs font-medium text-gray-400">Ends</span><input required type="datetime-local" value={performanceForm.endsAt} onChange={(event) => setPerformanceField('endsAt', event.target.value)} className="input" /></label></div>

                  {performanceForm.inventoryKind === 'general' && <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-medium text-gray-400">Capacity</span><input required type="number" min="1" max={selectedVenue?.capacity || 100000} value={performanceForm.capacity} onChange={(event) => setPerformanceField('capacity', event.target.value)} className="input" /></label><label><span className="mb-1.5 block text-xs font-medium text-gray-400">Ticket price (INR)</span><input required type="number" min="0" step="0.01" value={performanceForm.price} onChange={(event) => setPerformanceField('price', event.target.value)} className="input" /></label></div>}

                  {performanceForm.inventoryKind === 'assigned' && (activeCategories.length > 0 ? <div className="rounded-xl border border-surface-border bg-surface-elevated/50 p-4"><h3 className="text-sm font-semibold">Price by seat category</h3><p className="mt-1 text-xs text-gray-500">Prices are saved with this performance; each performance tracks its own seat availability.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{activeCategories.map((category) => <label key={category}><span className="mb-1.5 block text-xs capitalize text-gray-400">{category} · INR</span><input required type="number" min="0" step="0.01" value={priceTiers[category] ?? '0'} onChange={(event) => setPriceTiers((current) => ({ ...current, [category]: event.target.value }))} className="input" /></label>)}</div></div> : <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-200">The selected venue has no unblocked seats with a price category. Update its map first.</div>)}

                  {selectedVenue && <div className="rounded-xl border border-surface-border bg-surface-elevated/50 p-3 text-xs text-gray-400"><span className="inline-flex items-center gap-1.5 font-medium text-gray-300"><MapPin className="h-3.5 w-3.5" />{selectedVenue.name}</span><span className="ml-2">{selectedVenue.capacity} maximum capacity</span>{performanceForm.inventoryKind === 'assigned' && <span className="ml-2">· {collectCategories(selectedVenue.layout).length} seat categories</span>}</div>}

                  <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || (performanceForm.inventoryKind === 'assigned' && !activeCategories.length)} className="btn-primary"><Plus className="h-4 w-4" />{busy ? 'Saving…' : editingPerformanceId ? 'Save performance' : 'Add performance'}</button>{editingPerformanceId && <button type="button" onClick={resetPerformanceForm} className="btn-secondary">Stop editing</button>}</div>
                </form>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="font-display text-xl font-bold">Scheduled performances</h2><p className="mt-1 text-xs text-gray-500">{activePerformances.length} active · each has separate configuration</p></div><Link to="/organizer/venues" className="btn-ghost !px-2 text-xs"><MapPin className="h-4 w-4" /> Venues</Link></div>
              {activePerformances.length === 0 ? <div className="card p-6 text-sm leading-6 text-gray-400">No performances yet. Choose a venue and schedule the first date.</div> : <div className="space-y-3">{activePerformances.map((performance) => <PerformanceCard key={performance._id} performance={performance} busy={busy} onEdit={editPerformance} onCancel={cancelPerformance} />)}</div>}
              {(eventData.performances || []).some((performance) => performance.status === 'cancelled') && <div className="mt-4 text-xs text-gray-600">Cancelled performances remain in the event history.</div>}
            </section>
          </div>
        )}

        {isNew && <div className="mt-5 text-xs text-gray-500">Save the event draft to continue to venue and performance setup.</div>}
      </main>
    </div>
  );
}

function PerformanceCard({ performance, busy, onEdit, onCancel }) {
  const start = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(performance.startsAt));
  const price = performance.inventoryKind === 'general' ? performance.generalAdmission?.price : Math.min(...(performance.priceTiers || []).map((tier) => Number(tier.price)));
  return (
    <article className="rounded-2xl border border-surface-border bg-surface-card p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{performance.label}</h3><p className="mt-1 text-xs text-brand-200">{start}</p></div><span className="rounded-full border border-surface-border px-2.5 py-1 text-[10px] capitalize text-gray-400">{performance.inventoryKind}</span></div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400"><MapPin className="h-3.5 w-3.5" />{performance.venueName} · {performance.venueAddress?.city}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500"><span>Capacity {performance.inventoryKind === 'general' ? performance.generalAdmission?.capacity : (performance.seatMap?.sections || []).reduce((sum, section) => sum + section.rows.reduce((rowSum, row) => rowSum + row.seats.filter((seat) => !seat.blocked).length, 0), 0)}</span>{Number.isFinite(price) && <span>· From {priceLabel(price)}</span>}</div>
      <div className="mt-4 flex gap-2 border-t border-surface-border pt-3"><button type="button" onClick={() => onEdit(performance)} disabled={busy} className="btn-secondary flex-1 justify-center !px-3 !py-2 text-xs"><Save className="h-3.5 w-3.5" /> Edit schedule/prices</button><button type="button" onClick={() => onCancel(performance)} disabled={busy} className="btn-ghost !px-3 !py-2 text-xs text-gray-500 hover:text-red-300" aria-label={'Cancel ' + performance.label}><Trash2 className="h-3.5 w-3.5" /></button></div>
    </article>
  );
}
