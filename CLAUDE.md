
# Project: Event Ticketing System (MERN)
Express + Mongoose (ES modules) in /server, React in /client (later).
You may write and modify any code. Rules:
- Follow the existing structure: routes → controllers → services → models.
- Keep the existing error style: services throw Error with err.status; controllers map err.status, CastError (400), ValidationError (400), duplicate key 11000 (409), else 500.
- Add short beginner-friendly comments on non-obvious lines.
- Never commit or push — I do git myself.
- The dev server runs with nodemon in another terminal — never start or stop it.
- After every task, give me a 3–5 line plain-English summary of what you built and why, so I can explain it in an interview.

## Frontend design rules

Goal: looks like a real, slightly opinionated student project — simple, practical, consistent. Not a template, not "AI-generated".

Never use:
- Dark/neon themes, purple or blue-purple gradients, glassmorphism, glowing shadows, animated gradient backgrounds
- Emojis anywhere (UI, buttons, toasts, headings, code comments, README)
- Generic marketing copy ("Seamless", "Experience the future", "Unlock", "Effortless", "Elevate")
- Hero sections with big taglines, testimonial blocks, fake stats, stock-style illustrations
- Icon-heavy UI; use text labels, add an icon only where it truly helps (max a few, from one set like lucide-react)
- Over-rounded "pill everything" styling and heavy drop shadows

Use instead:
- Light theme: warm off-white page background (#faf8f5), white cards, near-black text (#1c1c1c), grey secondary text
- ONE accent colour: deep green (#1f6f50) for primary buttons/links; a muted red (#b3412e) only for errors/destructive actions
- Typography: system font stack for body; headings slightly heavier, no fancy display fonts. Small, readable sizes
- Subtle 1px borders (#e5e1da), small radius (4–6px), shadows barely visible or none
- Ticket feel only where it fits: e.g. booking confirmation styled like a simple ticket stub with a dashed divider
- Seat map: plain squares with seat numbers, muted colours (available = white with border, selected = accent, held = light amber, booked = grey). Screen/stage label at the top
- Plain, direct copy written like a person: "Pick your seats", "Your seats are held for 5:00", "Couldn't book A5, someone just took it"
- Dense, practical layouts; tables where data is tabular (organiser dashboard, my bookings)
- Small imperfections are fine; consistency matters more than polish