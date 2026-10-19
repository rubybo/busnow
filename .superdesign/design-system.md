# BusNow design system

Phone-first schedule for Novopolotsk buses and minibuses. Public name BusNow, domain busnow.online. No live GPS. The home screen is the departure board for the morning stop before 14:00 and the evening stop from 14:00. A control on the page switches the view and does not erase the other stop. If that stop is empty, the page is a stop search. Schedule is readable without login. Reminders exist on the stop page, not on this home screen.

Style source: Superdesign prompt `softly-digital-wellness-app`, used only for a calm mobile column and soft elevation. Do not import its peach, lavender, sage, cursive, grain, blobs, looping floats, or marketing hero. Those conflict with this system.

## Principles

- Flat means a solid fill. No gradients, textures, skeuomorphic buttons, or colored glows.
- Proximity (Lebedev §136): related objects sit closer to each other than to the next group. A label belongs to the block under it. Inside a departure row the gaps are smaller than the gap between rows.
- Few distances. Module 8px. Allowed gaps: 8, 16, 24, 32, 48. Page inset 24. Inside a row 8. Between rows 16. Between the switch and the board 24. Between the board and the source note 32.
- Touch height at least 44px.
- iOS 7: clarity, deference to the timetable, depth through layers. Motion explains where the screen came from. Ornament that does not mark a layer or a transition is omitted.

## Color

- canvas `#EFEFEC`
- surface `#FFFFFF`
- ink `#1C1C1A`
- muted `#6B6B66`
- line `#E4E4DF` only for inputs and in-list dividers
- accent `#245C4A` — primary button, selected morning/evening segment, filled bus badge
- on-accent `#FFFFFF`
- error `#8C3A32` — form error text only
- A past departure uses muted ink. No second brand hue. A minibus badge is an outline in ink, with the word «маршрутка». A bus badge is accent fill with white text.

## Type

One family: Golos Text. No serif, no script, no second family.

- Stop name: 22px, weight 600, ink, line-height 28px
- Time: 20px, weight 600, tabular numbers
- Route code: 15px, weight 600
- Direction and day pattern: 14px, weight 400, muted
- Header wordmark: 17px, weight 600
- Footer: 13px, muted

## Radius

- 12 controls and fields
- 16 cards
- 20 sheets
- Capsule only for the morning/evening switch

## Shadow

Shadow color is ink `#1C1C1A` at low alpha. Never a colored glow.

- resting card: `0 1px 2px rgba(28,28,26,0.04), 0 8px 24px rgba(28,28,26,0.06)`
- raised control: `0 2px 6px rgba(28,28,26,0.06), 0 12px 28px rgba(28,28,26,0.08)`
- sheet: `0 16px 48px rgba(28,28,26,0.12)`

## Motion

Curve `cubic-bezier(0.2, 0, 0, 1)`. No spring, no loop.

- press and segment change: color and shadow, 200ms
- screen push: current view leaves left, previous view shifts about one third and dims, 350ms
- search sheet rises and its shadow thickens, 320ms
- `prefers-reduced-motion`: change at once

## Home screen

Width 390. Canvas background. One column.

1. Top bar, 24px inset: word «BusNow» at the left. No logo mark, no icon row.
2. 32px below: stop name «Молодёжная». Under it, 8px away, muted line «Утро · сегодня».
3. 24px below: capsule switch «Утро» (selected, accent fill, white text) and «Вечер» (surface, ink). The capsule sits on the canvas and uses the raised shadow. Height 44.
4. 24px below: one white card, radius 16, resting shadow. Rows separated by a 1px line. Each row is at least 64px tall, padding 16.
   - Past row, muted: 07:05 · badge «4» · «Подкастельцы → Гайдара» · «будни»
   - Next row, ink: 07:22 · badge «4А» · same direction · «будни»
   - 07:40 · outline badge «10Тк» and the word «маршрутка» · «Центр → Подкастельцы» · «ежедневно»
   - 07:55 · badge «4» · «Подкастельцы → Гайдара» · «будни»
   - 08:10 · outline badge «2Тк» and «маршрутка» · «Молодёжная → Полимир» · «будни»
5. 32px below the card: muted sentence «Расписание может измениться.»
6. Footer, 48px below that note: «Новополоцк», muted, 13px.

Do not add a marketing hero, illustrations, photos, gradient blobs, grain, a second accent, or a reminder button on this page.
