import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Film,
  Heart,
  Loader2,
  MapPin,
  Mic2,
  Music2,
  RefreshCw,
  Search,
  Sparkles,
  Theater,
  Ticket,
} from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';

const CATEGORIES = [
  { value: '', label: 'Everything', icon: Sparkles },
  { value: 'concert', label: 'Music', icon: Music2 },
  { value: 'movie', label: 'Cinema', icon: Film },
  { value: 'comedy', label: 'Comedy', icon: Mic2 },
  { value: 'theatre', label: 'Theatre', icon: Theater },
  { value: 'sports', label: 'Sports', icon: Ticket },
  { value: 'festival', label: 'Festivals', icon: Sparkles },
  { value: 'workshop', label: 'Workshops', icon: CalendarDays },
  { value: 'conference', label: 'Conferences', icon: CalendarDays },
  { value: 'exhibition', label: 'Exhibitions', icon: Sparkles },
  { value: 'college', label: 'College events', icon: Ticket },
  { value: 'other', label: 'Other', icon: Sparkles },
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(({ value, label }) => [value, label]));

function nextPerformance(event) {
  return (event.performances || [])
    .filter((performance) => performance.status === 'scheduled' && new Date(performance.startsAt) > new Date())
    .sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt))[0];
}

function formatDate(value) {
  if (!value) return 'Date to be announced';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value));
}

function startingPrice(performance) {
  if (!performance) return null;
  const prices = performance.inventoryKind === 'general'
    ? [performance.generalAdmission?.price]
    : (performance.priceTiers || []).map((tier) => tier.price);
  const available = prices.filter((price) => Number.isFinite(Number(price)));
  return available.length ? Math.min(...available.map(Number)) : null;
}

function currency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function DiscoverPage() {
  const { user, isAuthenticated } = useAuthStore();
  const [events, setEvents] = useState([]);
  const [phase, setPhase] = useState('loading');
  const [message, setMessage] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [sortInput, setSortInput] = useState('dateAsc');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('dateAsc');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteEvents, setFavoriteEvents] = useState([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState('');
  const [favoriteError, setFavoriteError] = useState('');
  const isCustomer = isAuthenticated && user?.role === 'customer';

  const loadEvents = useCallback(async () => {
    setPhase('loading');
    setMessage('');
    try {
      const params = { limit: 24, page };
      if (search) params.search = search;
      if (city) params.city = city;
      if (from) params.from = from;
      if (to) params.to = to;
      if (category) params.category = category;
      if (minPrice !== '') params.minPrice = minPrice;
      if (maxPrice !== '') params.maxPrice = maxPrice;
      if (sort) params.sort = sort;
      const response = await api.get('/events', { params });
      setEvents(response.data.items || []);
      setPages(response.data.pages || 0);
      setTotal(response.data.total || 0);
      setPhase('ready');
    } catch (error) {
      setMessage(error.message || 'Could not load events.');
      setPhase('error');
    }
  }, [search, city, from, to, category, page, minPrice, maxPrice, sort]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, reload]);

  useEffect(() => {
    let active = true;
    if (!isCustomer) {
      setFavoriteIds([]);
      setFavoriteEvents([]);
      return () => { active = false; };
    }
    api.get('/favorites').then((response) => {
      if (active) {
        const favorites = response.data.favorites || [];
        setFavoriteIds(favorites.map((favorite) => String(favorite.eventId)));
        setFavoriteEvents(favorites.map((favorite) => favorite.event));
      }
    }).catch(() => {
      if (active) setFavoriteError('Your saved events could not be loaded.');
    });
    return () => { active = false; };
  }, [isCustomer]);

  const visibleEvents = showFavoritesOnly ? favoriteEvents : events;

  const submitSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setCity(cityInput.trim());
    setFrom(fromInput ? new Date(fromInput + 'T00:00:00').toISOString() : '');
    setTo(toInput ? new Date(toInput + 'T23:59:59.999').toISOString() : '');
    setMinPrice(minPriceInput.trim());
    setMaxPrice(maxPriceInput.trim());
    setSort(sortInput);
    setPage(1);
  };

  const toggleFavorite = async (event) => {
    if (!isCustomer || favoriteBusyId) return;
    const id = String(event._id);
    const isFavorite = favoriteIds.includes(id);
    setFavoriteBusyId(id);
    setFavoriteError('');
    try {
      if (isFavorite) {
        await api.delete('/favorites/' + id);
        setFavoriteIds((current) => current.filter((favoriteId) => favoriteId !== id));
        setFavoriteEvents((current) => current.filter((favoriteEvent) => String(favoriteEvent._id) !== id));
      } else {
        await api.put('/favorites/' + id);
        setFavoriteIds((current) => current.includes(id) ? current : [...current, id]);
        setFavoriteEvents((current) => current.some((favoriteEvent) => String(favoriteEvent._id) === id) ? current : [...current, event]);
      }
    } catch (error) {
      setFavoriteError(error.message || 'Could not update saved events.');
    } finally {
      setFavoriteBusyId('');
    }
  };

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="sticky top-0 z-20 border-b border-surface-border/80 bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="EventHive home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand font-display font-bold shadow-lg shadow-brand-500/25">E</span>
            <span className="font-display text-lg font-bold tracking-tight">EventHive</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <a href="#discover" className="hidden text-sm text-gray-300 transition hover:text-white sm:inline">Discover</a>
            {isAuthenticated && user?.role === 'organizer' && (
              <Link to="/organizer" className="hidden text-sm text-gray-300 transition hover:text-white sm:inline">Organizer studio</Link>
            )}
            {isAuthenticated ? (
              <Link to={user?.role === 'customer' ? '/profile' : user?.role === 'organizer' ? '/organizer' : '/admin'} className="btn-secondary !px-3 !py-2 text-xs sm:!px-4 sm:text-sm">{user?.name?.split(' ')[0] || 'Account'}</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost !px-3 text-sm">Sign in</Link>
                <Link to="/register" className="btn-primary !px-3 !py-2 text-xs sm:!px-4 sm:text-sm">Join EventHive</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-surface-border">
          <div className="pointer-events-none absolute -right-32 -top-48 h-[34rem] w-[34rem] rounded-full bg-brand-600/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-52 bottom-[-20rem] h-[38rem] w-[38rem] rounded-full bg-violet-600/10 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-16 sm:pb-20 sm:pt-24 lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-200">
                <Sparkles className="h-3.5 w-3.5" /> Find your next live moment
              </div>
              <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
                Make room for <span className="text-brand-300">something unforgettable.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-gray-400 sm:text-lg">
                Find the shows, screenings, and gatherings happening around you.
              </p>
            </div>

            <form onSubmit={submitSearch} className="mt-9 grid max-w-4xl gap-3 rounded-2xl border border-white/10 bg-surface-card/90 p-3 shadow-2xl shadow-black/20 sm:grid-cols-[1fr_220px_auto]">
              <label className="flex items-center gap-3 px-3">
                <Search className="h-5 w-5 shrink-0 text-brand-300" />
                <span className="sr-only">Search events</span>
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Artists, events, or experiences" className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-gray-500" />
              </label>
              <label className="flex items-center gap-3 border-t border-surface-border px-3 sm:border-l sm:border-t-0">
                <MapPin className="h-5 w-5 shrink-0 text-brand-300" />
                <span className="sr-only">City</span>
                <input value={cityInput} onChange={(event) => setCityInput(event.target.value)} placeholder="Any city" className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-gray-500" />
              </label>
              <button type="submit" className="btn-primary justify-center px-6">Explore events</button>
              <div className="grid gap-3 border-t border-surface-border px-3 pt-3 sm:col-span-3 sm:grid-cols-2">
                <label className="flex items-center gap-3"><CalendarDays className="h-4 w-4 shrink-0 text-brand-300" /><span className="sr-only">Events from</span><input type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} className="w-full bg-transparent py-1 text-sm text-gray-300 outline-none" /></label>
                <label className="flex items-center gap-3"><CalendarDays className="h-4 w-4 shrink-0 text-brand-300" /><span className="sr-only">Events through</span><input type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} className="w-full bg-transparent py-1 text-sm text-gray-300 outline-none" /></label>
              </div>
              <div className="grid gap-3 border-t border-surface-border px-3 pt-3 sm:col-span-3 sm:grid-cols-3">
                <label><span className="mb-1 block text-[11px] text-gray-500">Minimum price (INR)</span><input type="number" min="0" step="1" value={minPriceInput} onChange={(event) => setMinPriceInput(event.target.value)} placeholder="Any" className="input !py-2" /></label>
                <label><span className="mb-1 block text-[11px] text-gray-500">Maximum price (INR)</span><input type="number" min="0" step="1" value={maxPriceInput} onChange={(event) => setMaxPriceInput(event.target.value)} placeholder="Any" className="input !py-2" /></label>
                <label><span className="mb-1 block text-[11px] text-gray-500">Sort by</span><select value={sortInput} onChange={(event) => setSortInput(event.target.value)} className="input !py-2"><option value="dateAsc">Date: soonest</option><option value="dateDesc">Date: latest</option><option value="priceAsc">Price: low to high</option><option value="priceDesc">Price: high to low</option><option value="title">Title</option><option value="newest">Recently published</option></select></label>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Browse by city</span>
              <span className="text-surface-border">·</span>
              <span>Live listings from organizers</span>
            </div>
          </div>
        </section>

        <section id="discover" className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Go where the feeling is</p>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Explore by mood</h2>
            </div>
            <p className="text-sm text-gray-500">Fresh plans, straight from event organizers.</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Filter events by category">
            {CATEGORIES.map(({ value, label, icon: Icon }) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => { setCategory(value); setPage(1); }}
                aria-pressed={category === value}
                className={'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition ' + (category === value ? 'border-brand-400/50 bg-brand-500/15 text-brand-200' : 'border-surface-border bg-surface-card text-gray-400 hover:border-gray-600 hover:text-white')}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            {isCustomer && <button type="button" aria-pressed={showFavoritesOnly} onClick={() => setShowFavoritesOnly((value) => !value)} className={'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition ' + (showFavoritesOnly ? 'border-brand-400/50 bg-brand-500/15 text-brand-200' : 'border-surface-border bg-surface-card text-gray-400 hover:border-gray-600 hover:text-white')}><Heart className={'h-4 w-4 ' + (showFavoritesOnly ? 'fill-brand-300' : '')} /> Saved</button>}
          </div>

          <div className="mb-5 mt-10 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">{showFavoritesOnly ? 'Saved events' : 'Coming up'}</h2>
              <p className="mt-1 text-sm text-gray-500">{showFavoritesOnly ? 'Your customer-owned saved list' : city ? 'Events in ' + city : 'Upcoming events and performances'}</p>
            </div>
            {visibleEvents.length > 0 && phase === 'ready' && <span className="text-xs text-gray-500">{showFavoritesOnly ? visibleEvents.length : total} {visibleEvents.length === 1 ? 'event' : 'events'}</span>}
          </div>

          {favoriteError && <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100" role="status">{favoriteError}</div>}

          {phase === 'loading' && (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-gray-400" role="status">
              <Loader2 className="h-5 w-5 animate-spin text-brand-300" /> Finding events…
            </div>
          )}

          {phase === 'error' && (
            <div className="card mx-auto flex max-w-xl flex-col items-center p-8 text-center">
              <CircleAlert className="mb-3 h-7 w-7 text-amber-300" />
              <h3 className="font-semibold">Couldn’t load events</h3>
              <p className="mt-2 text-sm text-gray-400">{message}</p>
              <button type="button" onClick={() => setReload((value) => value + 1)} className="btn-secondary mt-5"><RefreshCw className="h-4 w-4" /> Try again</button>
            </div>
          )}

          {phase === 'ready' && visibleEvents.length === 0 && (
            <div className="card mx-auto flex max-w-xl flex-col items-center p-8 text-center sm:p-10">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300"><Ticket className="h-6 w-6" /></div>
              <h3 className="font-display text-xl font-semibold">{showFavoritesOnly ? 'No saved events yet' : 'No events match that search yet'}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">{showFavoritesOnly ? 'Save events with the heart button to find them here.' : 'Try another category or city. New listings will appear here when organizers publish them.'}</p>
              {(category || city || from || to || search || minPrice || maxPrice) && !showFavoritesOnly && <button type="button" className="btn-ghost mt-4" onClick={() => { setCategory(''); setSearch(''); setSearchInput(''); setCity(''); setCityInput(''); setFrom(''); setTo(''); setFromInput(''); setToInput(''); setMinPrice(''); setMaxPrice(''); setMinPriceInput(''); setMaxPriceInput(''); setPage(1); }}>Clear filters</button>}
            </div>
          )}

          {phase === 'ready' && visibleEvents.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleEvents.map((event) => <EventCard key={event._id} event={event} isCustomer={isCustomer} isFavorite={favoriteIds.includes(String(event._id))} favoriteBusy={favoriteBusyId === String(event._id)} onToggleFavorite={toggleFavorite} />)}
            </div>
          )}

          {phase === 'ready' && !showFavoritesOnly && pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Event pages">
              <button type="button" className="btn-secondary !px-4 !py-2 text-xs" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <span className="text-xs text-gray-500">Page {page} of {pages}</span>
              <button type="button" className="btn-secondary !px-4 !py-2 text-xs" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </nav>
          )}
        </section>
      </main>

      <footer className="border-t border-surface-border px-5 py-7 text-center text-xs text-gray-600">
        EventHive · Discover live experiences in your city
      </footer>
    </div>
  );
}

function EventCard({ event, isCustomer, isFavorite, favoriteBusy, onToggleFavorite }) {
  const performance = nextPerformance(event);
  const price = startingPrice(performance);
  const categoryLabel = CATEGORY_LABELS[event.category] || 'Event';

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-surface-border bg-surface-card transition duration-200 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-xl hover:shadow-brand-950/30">
      {isCustomer && <button type="button" disabled={favoriteBusy} onClick={() => onToggleFavorite(event)} aria-label={isFavorite ? 'Remove ' + event.title + ' from saved events' : 'Save ' + event.title} aria-pressed={isFavorite} className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"><Heart className={'h-4 w-4 ' + (isFavorite ? 'fill-brand-300 text-brand-300' : '')} /></button>}
      <Link to={'/events/' + event._id} className="block">
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-brand-950 via-surface-elevated to-surface-card">
        {event.posterUrl ? (
          <img src={event.posterUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" />
        ) : (
          <div className="flex h-full items-end p-5">
            <span className="font-display text-2xl font-bold leading-tight text-white/80">{event.title}</span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">{categoryLabel}</span>
        {performance && <span className="absolute bottom-3 right-3 rounded-lg bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur">{formatDate(performance.startsAt)}</span>}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 min-h-12 font-display text-lg font-semibold leading-6 text-white group-hover:text-brand-200">{event.title}</h3>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{performance?.venueAddress?.city || 'Location details coming soon'}</span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-3">
          <span className="text-xs text-gray-500">{price === null ? 'Price to be announced' : 'From ' + currency(price)}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300">Details <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
        </div>
      </div>
      </Link>
    </article>
  );
}
