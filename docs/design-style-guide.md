# Design & Style Guide

## Product Identity
This is the official Koinonia Children and Teens event access product. It must feel premium, calm, official, warm, excellent, and parent-friendly.

## Design Principles
- Mobile-first for parent and staff screens
- Desktop-first for admin screens
- Parent screens must feel like a real mobile app
- Admin screens must feel like a serious event command centre
- Do not use generic SaaS layouts
- Do not use AI-looking visuals
- Do not use childish graphics

## Colour Rules
- Warm off-white for main parent screens
- Deep Koinonia charcoal for official dark sections, event cards, admin sidebar, and safety sections
- Charcoal for primary text
- Soft grey for supporting text
- Antique gold and deep gold for buttons, active states, borders, and accents
- Controlled orange only for attention states
- Controlled green only for completed or success states
- Controlled red only for serious warnings

## Typography
- Use clean readable typography
- Headings can have a refined editorial feel
- Body text must remain simple and legible
- No overly decorative fonts
- No generic AI-looking type treatment

## Parent-Facing Wording Rules

### Do Not Use
- registration
- registry
- portal
- workflow
- dashboard
- system
- token
- validation
- authentication
- audit log
- submit application
- application approved
- seamless
- all-in-one
- smart system

### Use
- Parent Access
- Begin Parent Access
- Home
- Children
- Status
- Passes
- Profile
- Add a child
- Add each child
- Send details for review
- Details sent
- Under review
- Selected
- Not selected
- Waiting list
- Pass ready
- Event pass
- Entry
- Pickup
- Child photo check
- Parent profile
- Approved pickup person
- Pickup record

## Image Rules
- Use real uploaded Koinonia event images only
- Do not use stock, generated, placeholder, or unrelated office/coding images
- Use object-fit cover
- Avoid awkward face cropping
- Use fallback initials where profile images are unavailable
- Do not show broken images or alt text inside image boxes

## Motion Rules
- Motion must be premium and calm
- Allowed: fade-up, gentle slide, subtle hover lift, soft image scale, smooth carousel drag
- Not allowed: blinking, bouncing, flashing, pulsing dots, noisy spinning, childish animation
- Respect reduced motion settings

## Component Rules
- Forms use one vertical aligned column
- Labels sit above inputs
- Helper/error text sits below input
- Cards use warm backgrounds, thin borders, soft shadows
- Buttons must be clear and consistent
- Bottom navigation is fixed on parent/staff mobile screens and must not cover content
- Admin tables must be readable and not raw spreadsheet-like

## Architectural & No Demo Data UI Rules
- **No Hardcoded Demo Records:** Production UI components must never display mock sample children, dummy parent profiles, or fake QR codes in production.
- **Intentional Empty States:** When a data collection is empty (e.g., no children added yet, no active event passes), the UI must display a clean, reassuring empty card with clear typography and a direct call-to-action button.
- **Media Upload UI & Fallbacks:** Photo upload containers must maintain aspect ratios and show clean loading spinners or progress indicators during upload. If a photo fails to load or is unassigned, render an elegant circular or square badge displaying the user's initials on a warm background (`#EFECE4` with `#715D3A` text). Never display broken image browser icons.
