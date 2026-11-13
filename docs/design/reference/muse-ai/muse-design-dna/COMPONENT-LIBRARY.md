# COMPONENT-LIBRARY — Quiet Paper Glass

Status tags: [V] verified computed style, [O] observed visually only, [I] inferred, [?] not inspected. CSS for each lives in `examples/component-examples.css`.

| # | Component | Status |
|---|---|---|
| 1 | App shell with icon rail | V |
| 2 | Rail item | V |
| 3 | Floating glass pill (Chats, Invite) | V |
| 4 | Primary button | V |
| 5 | Neutral chip button ("Select") | O |
| 6 | Icon-only round button (filter, "...") | O |
| 7 | Assistant message bubble | V |
| 8 | Image-in-message | V |
| 9 | Timestamp divider | V |
| 10 | Link card | V |
| 11 | Composer capsule | V |
| 12 | Task-review tray above composer | O |
| 13 | Avatar name chip | V |
| 14 | Search field | V |
| 15 | Secondary sidebar nav row | V |
| 16 | Page header (title + lead) | V |
| 17 | Section heading | V |
| 18 | List row with round icon and overflow menu (Ideas) | V |
| 19 | Disclosure row with chevron (Goals "Create a goal") | O |
| 20 | Outlined content card + skeleton (Spaces) | O |
| 21 | Overlay sheet (Search) | O |
| 22 | Unread dot | O |
| 23 | Status label ("Tracking", green with dot) | O |

Total documented: **23**. Not found or not inspected: tabs, accordions, tooltips, toasts, dropdown menus, form inputs beyond the composer and search field, modals other than the Search overlay [?].

---

## 1. App shell
Fixed left rail 72px wide with a 1px `rgba(0,0,0,.1)` right border [V]. Main area has no background of its own (canvas #fcfcfc). Floating pills pin to the top corners of the main area. Composer pins to the bottom, centred, 768px max [V]. Secondary pane (Spaces page) adds a second column of 36px rows beside the rail [O].

## 2. Rail item
72x44 hit area [V] containing a 44x44 fully round hover/active backdrop [V]. Icons 32–34px, drawn as filled outline paths in a 320 viewBox, default colour #111112 [V]. Active item shows a light gray circle [O]. Items grouped with a short hairline divider between groups; utilities (download, menu) sit at the bottom [O]. Unread: small blue dot at the icon's top-right [O].

## 3. Floating glass pill
36px high, `border-radius:9999px`, bg `rgba(255,255,255,.76)`, text 14px/20 w500 (Invite) or 16px/22 w500 (Chats), padding `0 14px 0 10px` (Chats `0 14px 0 12px`), shadow `0 8px 40px rgba(0,0,0,.12)` plus a faint ring layer [V]. Leading 16–20px icon, 8px gap [O]. Transitions: box-shadow 200ms, colors 150ms [V declared].

## 4. Primary button
36px high, pill, fill #005bbf, white text 14/20 w500, padding `0 14px 0 8px` with a leading plus icon [V]. No shadow, no border [V]. Hover [?] (inferred: slight darken).

## 5–6. Neutral chip and round icon button
"Select" is a pill with a light gray fill (#f3f4f5 family) and 14px/500 label [O]. The filter and "..." buttons are 36–44px round with the same gray fill [O].

## 7. Assistant message bubble
Fill #e9eaeb, text #111112 16px/24px w400, padding 11px 15px, radius `22 22 22 6`, no border or shadow, max width about 619px of 768px (86% on narrow) [V]. Paragraphs separated by about 8–12px [O]. Lists use standard bullets [O]. User bubble [?] (none visible in the viewport; assume mirrored tail on the right, inferred).

## 8. Image in message
Image keeps the bubble geometry with the tail at the top-left (`6 22 22 22`) [V]. A pale blue tint frames the product mock-up inside it [O].

## 9. Timestamp divider
Centred text, 12px/16px, colour `rgba(0,4,9,.59)`, with about 24px vertical margin [V colour/size, O spacing]. Format "13 Nov, 22:28".

## 10. Link card
Fill #e9eaeb, radius 10px, about 313x69, no shadow [V]. Left: 40px white rounded-square tile with a brand glyph [O]. Title 15/20 w500; description 13/18 secondary; domain 11/13 secondary [V]. Whole card is the click target.

## 11. Composer
Capsule 768x58, radius 32px, glass fill with `blur(36px)`, 1px transparent border [V], no visible drop shadow in rest state [V]. Leading "+" icon, placeholder in secondary colour, trailing mic icon appears in the mock-up [O]. Inner row padding 12px, text padding `0 80px 0 40px` [V].

## 12. Task-review tray
A pale gray strip tucked under the top edge of the composer: left label "A task needs review", right link "Review" in blue [O]. Same radius family as the composer; appears conditionally.

## 13. Avatar name chip
Round 3D mascot illustration centred at the top, with a small white pill chip below it holding the name; chip radius 18px, padding 6px 10px [V].

## 14. Search field
215x36, pill, bg `rgba(255,255,255,.76)`, 1px `rgba(0,0,0,.1)` border, padding `0 16px 0 10px` [V]. Leading magnifier icon.

## 15. Sidebar nav row
36px high, padding `0 8px`, radius 12px; selected state bg `rgba(0,0,0,.025)` [V]; 16px label; leading 16px icon [O]. Small section labels ("Files", "Media") in 13px secondary [O].

## 16–17. Page header and sections
H1 34px/40px w600 [V]. Lead paragraph 18px/26px w400, primary colour [V]. H2 18px/26px w600 [V]. Sections are separated by about 32–40px [O].

## 18. List row (Ideas)
44px round placeholder icon (fill #f3f4f5-ish) at left, title 16/22 w500, 3-line description 14/20 secondary, overflow "..." aligned right [V/O]. Rows are separated by space alone (about 20–24px), no dividers [O].

## 19. Disclosure row (Goals)
Leading 16px icon, 15–16px label, trailing chevron in secondary colour, with space only (no borders) between rows [O].

## 20. Outlined card and skeleton
Cards use a 1px hairline border, large radius (about 20–24px, [I] from screenshot), white fill, with a gray top image area and a white text footer; loading shows pure skeleton blocks [O].

## 21. Overlay sheet
Centred sheet roughly 515x345 with large radius (about 24px [I]), glass fill, soft large shadow, and the underlying page visibly bleeding through during the entrance fade [O]. Contains a search input row, a hairline divider, "Recents" label, and 2-line result rows with round icons and a relative time on the right ("18m ago") [O].

## 22–23. Unread dot and status
Unread: about 8px blue circle with a white ring [O]. Status "Tracking": green dot plus green 15px/500 text [O].
