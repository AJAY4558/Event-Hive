import { Check, Accessibility, Ban, Armchair } from 'lucide-react';

function priceLabel(value) {
  if (!Number.isFinite(Number(value))) return 'Unavailable';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default function SeatSelector({ availability, selectedSeatIds, onToggle, disabled }) {
  const seatsById = new Map((availability?.seats || []).map((seat) => [seat.seatId, seat]));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-surface-border bg-surface-elevated/50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Stage</p>
        <div className="mx-auto mt-2 h-1.5 max-w-xs rounded-full bg-gradient-brand opacity-80" />
      </div>

      {(availability?.seatMap?.sections || []).map((section) => (
        <section key={section.id || section.name} aria-label={section.name} className="rounded-2xl border border-surface-border bg-surface-elevated/30 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="font-semibold">{section.name}</h4>
            <span className="text-[11px] text-gray-500">Section</span>
          </div>
          <div className="space-y-3 overflow-x-auto pb-1">
            {(section.rows || []).map((row) => (
              <div key={row.id || row.label} className="flex min-w-max items-center gap-3">
                <span className="w-7 shrink-0 text-xs font-semibold text-gray-500">{row.label}</span>
                <div className="flex items-center gap-1.5">
                  {(row.seats || []).map((seat, index) => {
                    const liveSeat = seatsById.get(seat.id);
                    if (!liveSeat) return null;
                    const selected = selectedSeatIds.includes(liveSeat.seatId);
                    const unavailable = !liveSeat.available && !selected;
                    const status = liveSeat.blocked ? 'blocked' : liveSeat.booked ? 'booked' : unavailable ? 'unavailable' : selected ? 'selected' : 'available';
                    const visibleStatus = liveSeat.blocked ? 'Blocked' : liveSeat.booked ? 'Booked' : selected ? 'Selected' : unavailable ? 'Unavailable' : 'Available';
                    const ariaLabel = `Seat ${liveSeat.label}, ${liveSeat.category}, ${priceLabel(liveSeat.price)}, ${status}${liveSeat.accessible ? ', accessible' : ''}`;
                    return (
                      <span key={liveSeat.seatId} className="inline-flex items-center">
                        <button
                          type="button"
                          aria-label={ariaLabel}
                          aria-pressed={selected}
                          disabled={disabled || unavailable || liveSeat.blocked || !availability.isBookable}
                          onClick={() => onToggle(liveSeat)}
                          className={'group flex min-h-14 w-[4.5rem] flex-col items-center justify-center rounded-xl border px-1.5 py-1 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ' + (
                            selected
                              ? 'border-brand-300 bg-brand-500/20 text-white ring-1 ring-brand-300/50'
                              : liveSeat.booked
                                ? 'border-surface-border bg-surface-card text-gray-500'
                                : liveSeat.blocked
                                  ? 'border-surface-border bg-black/30 text-gray-600'
                                : unavailable
                                  ? 'border-surface-border bg-surface-card text-gray-500'
                                  : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100 hover:border-emerald-300/60 hover:bg-emerald-500/10'
                          )}
                        >
                          <span className="flex items-center gap-1 text-xs">
                            {liveSeat.accessible && <Accessibility className="h-3 w-3" aria-hidden="true" />}
                            {selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                            {liveSeat.label}
                          </span>
                          <span className="mt-0.5 font-normal">{priceLabel(liveSeat.price)}</span>
                          <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide">{visibleStatus}</span>
                        </button>
                        {row.aisleAfter?.includes(index + 1) && <span aria-hidden="true" className="w-3 shrink-0" />}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-gray-400" aria-label="Seat availability legend">
        <span className="inline-flex items-center gap-1.5"><Armchair className="h-3.5 w-3.5 text-emerald-300" /> Available</span>
        <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-brand-300" /> Selected</span>
        <span className="inline-flex items-center gap-1.5"><Ban className="h-3.5 w-3.5 text-gray-500" /> Booked or blocked</span>
        <span className="inline-flex items-center gap-1.5"><Accessibility className="h-3.5 w-3.5 text-sky-300" /> Accessible</span>
      </div>
      <p className="text-xs text-gray-500">Availability is confirmed by the server when you book. A seat may be taken after you select it.</p>
    </div>
  );
}
