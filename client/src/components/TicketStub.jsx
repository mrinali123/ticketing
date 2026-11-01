import { formatDateTime, formatPrice } from '../utils/format.js';
import { seatList } from '../utils/booking.js';

// A confirmed booking shown as a simple ticket stub: event details on top, a dashed tear line,
// then seats and the booking reference.
export default function TicketStub({ booking }) {
  const { event } = booking;

  return (
    <div className="relative mx-auto max-w-md overflow-hidden rounded-md border border-line bg-white">
      <div className="p-5">
        <p className="text-xs tracking-widest text-muted uppercase">MySeat ticket</p>
        <h2 className="mt-1 text-lg leading-snug">{event?.title ?? 'Event removed'}</h2>
        {event && (
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="When">{formatDateTime(event.startTime)}</Row>
            <Row label="Where">
              {event.venue}, {event.city}
            </Row>
          </dl>
        )}
      </div>

      {/* Tear line: dashed border with two half-circle notches cut into the sides */}
      <div className="relative">
        <div className="border-t border-dashed border-line" />
        <span className="absolute top-0 -left-2 h-4 w-4 -translate-y-1/2 rounded-full border border-line bg-page" />
        <span className="absolute top-0 -right-2 h-4 w-4 -translate-y-1/2 rounded-full border border-line bg-page" />
      </div>

      <dl className="space-y-2 p-5 text-sm">
        <Row label="Seats">
          <span className="font-medium">{seatList(booking)}</span>
        </Row>
        <Row label="Paid">{formatPrice(booking.amountPaise)}</Row>
        <Row label="Booking">
          <span className="font-mono text-xs break-all">{booking._id}</span>
        </Row>
      </dl>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
