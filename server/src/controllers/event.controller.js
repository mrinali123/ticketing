import {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  cancelEvent,
} from '../services/event.service.js';

export async function create(req, res) {
  try {
    // Pick only the fields we allow, so a client can't sneak in e.g. "organiser" or "status"
    const { title, venue, city, startTime, rows, seatsPerRow, pricePaise } = req.body;

    // pricePaise uses === undefined so a free event (price 0) is still allowed
    if (
      !title ||
      !venue ||
      !city ||
      !startTime ||
      !rows ||
      !seatsPerRow ||
      pricePaise === undefined
    ) {
      return res.status(400).json({
        message: 'Please provide title, venue, city, startTime, rows, seatsPerRow, and pricePaise',
      });
    }

    // req.user was set by the requireAuth middleware
    const event = await createEvent(req.user.id, {
      title,
      venue,
      city,
      startTime,
      rows,
      seatsPerRow,
      pricePaise,
    });
    return res.status(201).json(event);
  } catch (err) {
    // Schema rules failed (e.g. rows < 1 or negative price)
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

export async function list(req, res) {
  try {
    // Query strings are always text, so convert to numbers and keep them in a safe range
    const page = Math.max(Number(req.query.page) || 1, 1); // at least page 1
    const limit = Math.min(Number(req.query.limit) || 10, 50); // default 10, never more than 50
    const { city } = req.query;

    const result = await listEvents({ page, limit, city });
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

export async function getOne(req, res) {
  try {
    const result = await getEventById(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    // Mongoose throws CastError when the id isn't a valid ObjectId (e.g. "abc")
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

export async function update(req, res) {
  try {
    // Only these fields may change. rows/seatsPerRow are left out because seats already exist.
    const allowed = ['title', 'venue', 'city', 'startTime', 'pricePaise'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'Please provide at least one of: title, venue, city, startTime, pricePaise',
      });
    }

    const event = await updateEvent(req.params.id, req.user.id, updates);
    return res.status(200).json(event);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}

export async function cancel(req, res) {
  try {
    const result = await cancelEvent(req.params.id, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
}
