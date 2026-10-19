import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Accessibility, ArrowLeft, CircleAlert, Loader2, MapPin, RefreshCw, Save, Trash2 } from 'lucide-react';
import { api } from '@/api/client';

function rowLabel(index) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function categoryFromName(name) {
  const value = name.toLowerCase();
  if (value.includes('vip')) return 'vip';
  if (value.includes('premium')) return 'premium';
  if (value.includes('balcony')) return 'balcony';
  return 'standard';
}

function countSeats(layout) {
  return (layout?.sections || []).reduce((sum, section) => sum + (section.rows || []).reduce((rowSum, row) => rowSum + (row.seats || []).length, 0), 0);
}

function buildLayout(sectionInput, rows, seatsPerRow, aisleAfter, stageLabel, accessibleEdges) {
  const definitions = sectionInput.split('\n').map((line) => {
    const [rawName, ...rawCategory] = line.split('|');
    const name = rawName.trim();
    return { name, category: rawCategory.join('|').trim().toLowerCase() || categoryFromName(name) };
  }).filter((section) => section.name);
  const sections = definitions.map(({ name, category }) => ({
    name,
    rows: Array.from({ length: rows }, (_, rowIndex) => {
      const row = rowLabel(rowIndex);
      return {
        label: row,
        aisleAfter: aisleAfter > 0 && aisleAfter < seatsPerRow ? [aisleAfter] : [],
        seats: Array.from({ length: seatsPerRow }, (_, seatIndex) => ({
          label: row + (seatIndex + 1),
          number: seatIndex + 1,
          category,
          accessible: accessibleEdges && seatIndex < 2,
          blocked: false,
        })),
      };
    }),
  }));
  return { stageLabel: stageLabel.trim() || 'Stage', sections };
}

const EMPTY_FORM = {
  name: '', line1: '', line2: '', city: '', state: '', country: 'India', postalCode: '',
  capacity: '192', inventoryKind: 'assigned', stageLabel: 'Stage',
};

export default function VenueManagerPage() {
  const [venues, setVenues] = useState([]);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [sectionInput, setSectionInput] = useState('Main Floor');
  const [rowCount, setRowCount] = useState(12);
  const [seatsPerRow, setSeatsPerRow] = useState(16);
  const [aisleAfter, setAisleAfter] = useState(8);
  const [accessibleEdges, setAccessibleEdges] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState(null);
  const [editMode, setEditMode] = useState('preview');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const loadVenues = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await api.get('/venues');
      setVenues(response.data.venues || []);
      setPhase('ready');
    } catch (loadError) {
      setError(loadError.message || 'Could not load venues.');
      setPhase('error');
    }
  }, []);

  useEffect(() => { loadVenues(); }, [loadVenues, reload]);

  const seatTotal = useMemo(() => countSeats(layoutDraft), [layoutDraft]);
  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const generatePreview = (event) => {
    event.preventDefault();
    const rows = Math.min(100, Math.max(1, Number(rowCount) || 1));
    const seats = Math.min(500, Math.max(1, Number(seatsPerRow) || 1));
    const layout = buildLayout(sectionInput, rows, seats, Number(aisleAfter) || 0, form.stageLabel, accessibleEdges);
    setLayoutDraft(layout);
    const total = countSeats(layout);
    setForm((current) => ({ ...current, capacity: String(Math.max(Number(current.capacity) || 0, total)) }));
    setError('');
    setNotice('Layout preview generated. You can mark seats accessible or blocked before saving.');
  };

  const toggleSeat = (sectionIndex, rowIndex, seatIndex) => {
    if (editMode === 'preview') return;
    setLayoutDraft((current) => {
      if (!current) return current;
      const sections = current.sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) return section;
        return {
          ...section,
          rows: section.rows.map((row, currentRowIndex) => {
            if (currentRowIndex !== rowIndex) return row;
            return {
              ...row,
              seats: row.seats.map((seat, currentSeatIndex) => {
                if (currentSeatIndex !== seatIndex) return seat;
                return editMode === 'accessible'
                  ? { ...seat, accessible: !seat.accessible }
                  : { ...seat, blocked: !seat.blocked };
              }),
            };
          }),
        };
      });
      return { ...current, sections };
    });
  };

  const startEdit = (venue) => {
    setEditingId(venue._id);
    setForm({
      name: venue.name,
      line1: venue.address?.line1 || '',
      line2: venue.address?.line2 || '',
      city: venue.address?.city || '',
      state: venue.address?.state || '',
      country: venue.address?.country || 'India',
      postalCode: venue.address?.postalCode || '',
      capacity: String(venue.capacity),
      inventoryKind: venue.inventoryKind,
      stageLabel: venue.layout?.stageLabel || 'Stage',
    });
    setLayoutDraft(venue.layout || { stageLabel: 'Stage', sections: [] });
    setSectionInput((venue.layout?.sections || []).map((section) => {
      const category = section.rows?.[0]?.seats?.[0]?.category;
      return category ? section.name + ' | ' + category : section.name;
    }).join('\n') || 'Main Floor');
    setRowCount(venue.layout?.sections?.[0]?.rows?.length || 12);
    setSeatsPerRow(venue.layout?.sections?.[0]?.rows?.[0]?.seats?.length || 16);
    setAisleAfter(venue.layout?.sections?.[0]?.rows?.[0]?.aisleAfter?.[0] || 0);
    setAccessibleEdges(false);
    setEditMode('preview');
    setError('');
    setNotice('Editing venue configuration. Existing performances keep their saved layout snapshot.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSectionInput('Main Floor');
    setRowCount(12);
    setSeatsPerRow(16);
    setAisleAfter(8);
    setAccessibleEdges(false);
    setLayoutDraft(null);
    setEditMode('preview');
    setNotice('');
    setError('');
  };

  const saveVenue = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const inventoryKind = form.inventoryKind;
      const layout = inventoryKind === 'general'
        ? { stageLabel: form.stageLabel || 'Stage', sections: [] }
        : layoutDraft;
      if (inventoryKind !== 'general' && (!layout || !layout.sections?.length)) {
        throw new Error('Generate and preview a seating layout before saving this venue.');
      }
      const payload = {
        name: form.name.trim(),
        address: {
          line1: form.line1.trim(),
          line2: form.line2.trim() || undefined,
          city: form.city.trim(),
          state: form.state.trim() || undefined,
          country: form.country.trim() || 'India',
          postalCode: form.postalCode.trim() || undefined,
        },
        capacity: Number(form.capacity),
        inventoryKind,
        layout,
      };
      if (editingId) await api.patch('/venues/' + editingId, payload);
      else await api.post('/venues', payload);
      await loadVenues();
      resetForm();
      setNotice(editingId ? 'Venue configuration saved.' : 'Venue created. Your layout is ready to use for performances.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save venue.');
    } finally {
      setSaving(false);
    }
  };

  const deactivateVenue = async (venue) => {
    if (!window.confirm('Deactivate ' + venue.name + '? Scheduled performances must be cancelled first.')) return;
    setError('');
    setNotice('');
    try {
      await api.delete('/venues/' + venue._id);
      setNotice('Venue deactivated.');
      setReload((value) => value + 1);
    } catch (deactivateError) {
      setError(deactivateError.message || 'Could not deactivate venue.');
    }
  };

  return (
    <div className="min-h-dvh bg-surface text-white">
      <header className="border-b border-surface-border bg-surface-card/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link to="/organizer" className="flex items-center gap-2 text-sm text-gray-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Organizer studio</Link>
          <Link to="/" className="font-display font-bold">EventHive</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-5 py-9 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] lg:px-8 lg:py-12">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Venue setup</p>
          <h1 className="font-display text-3xl font-bold">{editingId ? 'Edit venue' : 'Add a venue'}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Create a reusable venue with its own capacity and seating plan. Performances save a snapshot so later venue edits do not rewrite their map.</p>

          {error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {notice && <div className="mt-5 rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-sm text-brand-200">{notice}</div>}

          <form onSubmit={saveVenue} className="mt-6 flex flex-col gap-5">
            <div className="card grid gap-4 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-400">Venue name</span><input required minLength="2" maxLength="120" value={form.name} onChange={(event) => updateField('name', event.target.value)} className="input" placeholder="Riverside Arts Hall" /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-400">Street address</span><input required value={form.line1} onChange={(event) => updateField('line1', event.target.value)} className="input" placeholder="42 Park Street" /></label>
              <label><span className="mb-1.5 block text-xs font-medium text-gray-400">City</span><input required value={form.city} onChange={(event) => updateField('city', event.target.value)} className="input" placeholder="Mumbai" /></label>
              <label><span className="mb-1.5 block text-xs font-medium text-gray-400">State</span><input value={form.state} onChange={(event) => updateField('state', event.target.value)} className="input" placeholder="Maharashtra" /></label>
              <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Country</span><input required value={form.country} onChange={(event) => updateField('country', event.target.value)} className="input" /></label>
              <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Postal code</span><input value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} className="input" /></label>
              <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Inventory style</span><select value={form.inventoryKind} onChange={(event) => updateField('inventoryKind', event.target.value)} className="input"><option value="assigned">Assigned seating</option><option value="general">General admission</option><option value="mixed">Mixed venue</option></select></label>
              <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Venue capacity</span><input required type="number" min="1" max="100000" value={form.capacity} onChange={(event) => updateField('capacity', event.target.value)} className="input" /></label>
            </div>

            {form.inventoryKind !== 'general' && (
              <div className="card p-5">
                <div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-semibold">Seat-map designer</h2><p className="mt-1 text-xs leading-5 text-gray-500">Generate rows in bulk, add sections, place aisles, then preview or mark accessible and blocked seats.</p></div><Accessibility className="h-5 w-5 shrink-0 text-brand-300" /></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium text-gray-400">Sections (one per line, optional “name | category”)</span><textarea value={sectionInput} onChange={(event) => setSectionInput(event.target.value)} rows="2" className="input resize-y" placeholder={'Main Floor | standard\nBalcony | balcony'} /></label>
                  <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Rows per section</span><input type="number" min="1" max="100" value={rowCount} onChange={(event) => setRowCount(event.target.value)} className="input" /></label>
                  <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Seats per row</span><input type="number" min="1" max="500" value={seatsPerRow} onChange={(event) => setSeatsPerRow(event.target.value)} className="input" /></label>
                  <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Aisle after seat number</span><input type="number" min="0" max={Number(seatsPerRow) - 1} value={aisleAfter} onChange={(event) => setAisleAfter(event.target.value)} className="input" /></label>
                  <label><span className="mb-1.5 block text-xs font-medium text-gray-400">Stage or screen label</span><input maxLength="60" value={form.stageLabel} onChange={(event) => updateField('stageLabel', event.target.value)} className="input" placeholder="Main stage" /></label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 sm:col-span-2"><input type="checkbox" checked={accessibleEdges} onChange={(event) => setAccessibleEdges(event.target.checked)} className="accent-fuchsia-500" />Mark the first two seats in each row accessible when generating</label>
                </div>
                <button type="button" onClick={generatePreview} className="btn-secondary mt-4"><RefreshCw className="h-4 w-4" /> Generate layout preview</button>
                {layoutDraft && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs text-gray-500">Click seats to edit:</span><button type="button" onClick={() => setEditMode('preview')} className={'rounded-full border px-3 py-1.5 text-xs ' + (editMode === 'preview' ? 'border-brand-400/40 bg-brand-500/10 text-brand-200' : 'border-surface-border text-gray-400')}>Preview</button><button type="button" onClick={() => setEditMode('accessible')} className={'rounded-full border px-3 py-1.5 text-xs ' + (editMode === 'accessible' ? 'border-brand-400/40 bg-brand-500/10 text-brand-200' : 'border-surface-border text-gray-400')}>Toggle accessible</button><button type="button" onClick={() => setEditMode('blocked')} className={'rounded-full border px-3 py-1.5 text-xs ' + (editMode === 'blocked' ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-surface-border text-gray-400')}>Toggle blocked</button><span className="ml-auto text-xs text-gray-500">{seatTotal} seats</span></div>}
              </div>
            )}

            <div className="flex flex-wrap gap-3"><button type="submit" disabled={saving} className="btn-primary"><Save className="h-4 w-4" />{saving ? 'Saving…' : editingId ? 'Save venue' : 'Create venue'}</button>{editingId && <button type="button" onClick={resetForm} className="btn-secondary">Cancel edit</button>}</div>
          </form>
        </section>

        <aside className="space-y-6">
          {layoutDraft && form.inventoryKind !== 'general' && <SeatMapPreview layout={layoutDraft} editMode={editMode} onToggle={toggleSeat} />}
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Your venues</h2><button type="button" onClick={() => setReload((value) => value + 1)} className="btn-ghost !px-2" aria-label="Refresh venues"><RefreshCw className="h-4 w-4" /></button></div>
            {phase === 'loading' && <div className="card flex items-center justify-center gap-2 p-7 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin text-brand-300" /> Loading venues…</div>}
            {phase === 'error' && <div className="card p-5 text-sm text-red-300">{error || 'Could not load venues.'}</div>}
            {phase === 'ready' && venues.length === 0 && <div className="card p-6 text-sm leading-6 text-gray-400">No venues yet. Create a reusable venue configuration to add performances to an event.</div>}
            {phase === 'ready' && venues.length > 0 && <div className="space-y-3">{venues.map((venue) => <VenueCard key={venue._id} venue={venue} onEdit={startEdit} onDeactivate={deactivateVenue} />)}</div>}
          </section>
        </aside>
      </main>
    </div>
  );
}

function SeatMapPreview({ layout, editMode, onToggle }) {
  return (
    <section className="card p-5" aria-label="Seating layout preview">
      <div className="mb-4 rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">{layout.stageLabel || 'Stage'}</div>
      <div className="max-h-[28rem] space-y-5 overflow-auto pr-1">
        {layout.sections.map((section, sectionIndex) => (
          <div key={section.id || section.name}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{section.name}</h3>
              <span className="text-[10px] capitalize text-gray-600">{[...new Set(section.rows.flatMap((row) => row.seats.map((seat) => seat.category)))].join(' · ')}</span>
            </div>
            <div className="space-y-2">
              {section.rows.map((row, rowIndex) => (
                <div key={row.id || row.label} className="flex min-w-max items-center gap-1.5">
                  <span className="w-6 text-[10px] text-gray-600">{row.label}</span>
                  {row.seats.map((seat, seatIndex) => (
                    <span key={seat.id || seat.label} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => onToggle(sectionIndex, rowIndex, seatIndex)}
                        title={seat.label + (seat.accessible ? ' · accessible' : '') + (seat.blocked ? ' · blocked' : '')}
                        aria-label={seat.label + (seat.accessible ? ', accessible' : '') + (seat.blocked ? ', blocked' : '')}
                        className={'flex h-7 w-7 items-center justify-center rounded-md border text-[9px] transition focus:outline-none focus:ring-2 focus:ring-brand-400 ' + (seat.blocked ? 'border-red-500/40 bg-red-500/15 text-red-300' : seat.accessible ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200' : 'border-surface-border bg-surface-elevated text-gray-400 hover:border-brand-400/50')}
                      >
                        {seat.number}
                      </button>
                      {row.aisleAfter?.includes(seat.number) && <span className="mx-2 h-6 border-l border-dashed border-gray-700" aria-label="Aisle" />}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 border-t border-surface-border pt-3 text-[10px] text-gray-500"><span>Standard</span><span className="text-cyan-300">Accessible</span><span className="text-red-300">Blocked</span><span className="ml-auto">{countSeats(layout)} seats</span></div>
    </section>
  );
}

function VenueCard({ venue, onEdit, onDeactivate }) {
  const seatCount = countSeats(venue.layout);
  return (
    <article className="rounded-2xl border border-surface-border bg-surface-card p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{venue.name}</h3><p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><MapPin className="h-3.5 w-3.5" />{venue.address?.city}, {venue.address?.country}</p></div><span className="rounded-full border border-surface-border px-2.5 py-1 text-[10px] capitalize text-gray-400">{venue.inventoryKind}</span></div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500"><span>{venue.capacity} capacity</span>{venue.inventoryKind !== 'general' && <span>· {seatCount} configured seats</span>}<span>· Layout v{venue.layoutVersion}</span></div>
      {!venue.isActive && <p className="mt-3 text-xs text-amber-300">Inactive venue</p>}
      <div className="mt-4 flex gap-2 border-t border-surface-border pt-3"><button type="button" onClick={() => onEdit(venue)} className="btn-secondary flex-1 justify-center !px-3 !py-2 text-xs"><MapPin className="h-3.5 w-3.5" /> Edit</button>{venue.isActive && <button type="button" onClick={() => onDeactivate(venue)} className="btn-ghost !px-3 !py-2 text-xs text-gray-500 hover:text-red-300" aria-label={'Deactivate ' + venue.name}><Trash2 className="h-3.5 w-3.5" /></button>}</div>
    </article>
  );
}
