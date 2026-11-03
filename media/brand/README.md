# BerthIQ graphics kit

Preview cards rendered from code: HTML/CSS templates in
[`frontend/scripts/media/cards/`](../../frontend/scripts/media/cards/) and
`render-cards.mjs` (Playwright). They use the app's own fonts (Big Shoulders, IBM Plex
Sans and Mono, the families `next/font` loads), colours (`app/site.css`), Q-flag mark and
dark ProvenanceBadge pill. Every picture of the product is a crop of the real running
application (`crops/`), and every number appears in the product or the README. Each card
carries "Synthetic operations on real port geography" and the OpenStreetMap credit.

```sh
just cards               # re-render from the committed crops
CAPTURE=1 just cards     # refresh the crops from the running app first (API :8000, Next :3000)
```

All files are JPEG quality 90 and under 1 MB. Each renders at exactly its size; only the
README hero renders at 2x. Text contrast meets WCAG AA (lowest pair: muted text on a
panel, 5.98:1), and every headline stays readable with the card shown 300 px wide.

| File | Size (px) | Weight | Use | Alt text |
| --- | --- | --- | --- | --- |
| [`og-home.jpg`](og-home.jpg) | 1200×630 | 103 KB | Open Graph / Twitter card for `/` (installed as `frontend/app/opengraph-image.jpg` and `twitter-image.jpg`) | BerthIQ: "Why is this ship waiting?" The Khalifa Port harbor map with yellow ships at anchor, a simulated verdict cutting the average wait from 62.9 to 45.1 hours, and 17 of 26 open calls predicted at risk. |
| [`og-case-study.jpg`](og-case-study.jpg) | 1200×630 | 103 KB | Open Graph / Twitter card for `/case-study` (installed under `frontend/app/case-study/`) | BerthIQ case study: "43 hours at anchor. A berth that fit stood idle." KHL-0592's timeline shows its paperwork returned three times while the ship waited at anchor; a simulated fix cuts the average wait by 28%. |
| [`github-social.jpg`](github-social.jpg) | 1280×640 | 96 KB | GitHub social preview, 40 px safe margin (Settings → Social preview, uploaded by hand) | BerthIQ: "Why is this ship waiting?" Port-call decision support with process mining, a risk model, CP-SAT scheduling and matched simulation, shown over the Khalifa Port harbor map and a simulated verdict of 62.9 to 45.1 hours. |
| [`linkedin-post.jpg`](linkedin-post.jpg) | 1080×1350 | 150 KB | LinkedIn portrait post | BerthIQ: "Why is this ship waiting?" The Khalifa Port harbor map with KHL-0592 highlighted, 43 hours at anchor. Simulated verdict: five reviewers instead of three cut the average wait from 62.9 to 45.1 hours, paid for in 168 more reviewer hours. |
| [`square.jpg`](square.jpg) | 1080×1080 | 101 KB | Square post or profile feature image | BerthIQ: "Why is this ship waiting?" The Khalifa Port harbor map with yellow ships waiting at anchor beside empty berths. berth-iq.vercel.app |
| [`video-thumbnail.jpg`](video-thumbnail.jpg) | 1280×720 | 90 KB | Thumbnail for the 60-second tour on YouTube (not linked yet) | BerthIQ 60-second tour: "Why is this ship waiting?" over the Khalifa Port harbor map with yellow ships at anchor. |
| [`readme-hero.jpg`](readme-hero.jpg) | 1600×800 at 2x (3200×1600) | 333 KB | Top of the repository README, linked to the live app | BerthIQ: "Why is this ship waiting?" Replay a week at Khalifa Port, see what held each ship, and test a fix before the port changes anything. Shown with the harbor map, a simulated verdict of 62.9 to 45.1 hours, and 17 of 26 open calls predicted at risk. |
