// The seat map: "Stage" at the top, one line per row (A, B, C...), seats as small numbered squares.
// Colours follow the design rules: available = white with border, selected = accent,
// held = light amber, booked = grey.

const seatStyles = {
  available: 'cursor-pointer border-line bg-white text-ink hover:border-accent',
  selected: 'cursor-pointer border-accent bg-accent text-white',
  held: 'cursor-not-allowed border-held bg-held text-held-ink',
  booked: 'cursor-not-allowed border-booked bg-booked text-muted',
};

const statusWords = {
  available: 'available',
  selected: 'selected',
  held: 'held by someone else',
  booked: 'booked',
};

// Groups the API's seat list (already sorted A1, A2... B1...) into rows
function groupByRow(seats) {
  const rows = new Map();
  for (const seat of seats) {
    if (!rows.has(seat.row)) rows.set(seat.row, []);
    rows.get(seat.row).push(seat);
  }
  return [...rows.entries()];
}

export default function SeatMap({ seats, selected, onToggle, disabled = false }) {
  const rows = groupByRow(seats);

  return (
    <div>
      {/* Wide halls scroll sideways on small phones instead of squashing the seats */}
      <div className="relative overflow-x-auto pb-2">
        <div className="mx-auto w-max">
          <div className="mb-4 rounded border border-line bg-page py-1 text-center text-xs tracking-widest text-muted uppercase">
            Stage
          </div>

          {/* Phones: 26px seats, tighter gaps, row letter on the left only, so a 10-seat row fits
              a 390px screen. Wider screens get 32px seats and the letter on both sides. */}
          <div className="space-y-1 sm:space-y-1.5">
            {rows.map(([row, rowSeats]) => (
              <div key={row} className="flex items-center gap-1 sm:gap-1.5">
                <span className="w-5 text-center text-xs font-medium text-muted">{row}</span>
                {rowSeats.map((seat) => {
                  const state = selected.has(seat.label) ? 'selected' : seat.status;
                  const clickable = !disabled && (state === 'available' || state === 'selected');
                  return (
                    <button
                      key={seat._id}
                      type="button"
                      disabled={!clickable}
                      onClick={() => onToggle(seat.label)}
                      aria-pressed={state === 'selected'}
                      aria-label={`Seat ${seat.label}, ${statusWords[state] ?? state}`}
                      title={`${seat.label}: ${statusWords[state] ?? state}`}
                      className={`size-6.5 shrink-0 rounded border text-xs sm:size-8 ${seatStyles[state]} ${
                        disabled && state === 'available' ? 'cursor-default opacity-60' : ''
                      }`}
                    >
                      {seat.number}
                    </button>
                  );
                })}
                <span className="hidden w-5 text-center text-xs font-medium text-muted sm:block">
                  {row}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    ['available', 'Available'],
    ['selected', 'Selected'],
    ['held', 'Held'],
    ['booked', 'Booked'],
  ];
  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted">
      {items.map(([state, label]) => (
        <li key={state} className="flex items-center gap-1.5">
          <span className={`inline-block h-3.5 w-3.5 rounded-sm border ${seatStyles[state]}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}
