import Event from "../models/Event.js";
import Seat from "../models/Seat.js";

export async function createEvent(organiserId, data) {
  // Save the event, owned by the logged-in organiser
  const event = await Event.create({ ...data, organiser: organiserId });

  // Build one seat per row/number: rows 0,1,2... become "A","B","C"...
  const seats = [];
  for (let r = 0; r < event.rows; r++) {
    const row = String.fromCharCode(65 + r); // 65 is the char code for "A"
    for (let number = 1; number <= event.seatsPerRow; number++) {
      seats.push({ event: event._id, label: `${row}${number}`, row, number });
    }
  }

  // Save all seats in one database call instead of one call per seat
  await Seat.insertMany(seats);

  return event;
}

export async function listEvents({ page, limit, city }) {
  // Only upcoming events that haven't been cancelled
  const filter = { status: "scheduled", startTime: { $gte: new Date() } };
  if (city) filter.city = city; // optional city filter

  const skip = (page - 1) * limit; // page 1 skips 0, page 2 skips `limit`, ...

  // Run both queries at the same time instead of one after the other
  const [data, total] = await Promise.all([
    Event.find(filter).sort({ startTime: 1 }).skip(skip).limit(limit), // soonest first
    Event.countDocuments(filter), // total matches, so the client knows how many pages exist
  ]);

  return { data, page, limit, total };
}

export async function getEventById(id) {
  const event = await Event.findById(id);

  if (!event) {
    const err = new Error("Event not found");
    err.status = 404; // the controller turns this into the HTTP status
    throw err;
  }

  // Only send the seat fields the client needs, in seat-map order (A1, A2, ... B1, ...)
  const seats = await Seat.find({ event: event._id })
    .select("label row number status")
    .sort({ row: 1, number: 1 });

  return { event, seats };
}
