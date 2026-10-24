# Adding or changing a programme

The owner sends content however is easiest:
- a voice note (transcribed into the chat)
- typed text
- YouTube links
- photos

Claude builds it in.

## Steps
1. **Owner sends** the title, what it's for, the sections and exercises, YouTube links and images. Rough is fine.
2. **Claude writes it up professionally in the owner's voice**, keeping their meaning and adding no claims they didn't make, then drafts the programme in the standard structure:
   - **Overview:** sales-page summary, who it's for and not for, what's included. The philosophy is hinted at, not given away.
   - **Full Programme:** the complete teaching, philosophy first, then each stage and exercise with video, images, cues and common mistakes.
   - **Quick Run-Through:** key highlighted points for each stage.
   - **Price and package:** a placeholder until the owner confirms. Covers standalone, bundle or add-on.
3. **Draft goes onto the test site** (from Step 5: as a draft in admin). Claude sends the preview link.
4. **Owner checks** and replies with changes or "CH".
5. **Claude publishes** it on the live site and reports back.

## Where content lives
In `content/programmes/<slug>/` as one file per section, imported with `scripts/import-content.mjs`. The same files load into the test site and the live site.

## Exercise files
Copy `content/programmes/lower-body-regeneration/11-exercise-template.md`. Each exercise has:
- **Starting position:** the big part.
- **Conducting the exercise.**
- **Key points:** the short version.
- A suggested time, one line for the exercise sheet, and an optional YouTube demo link.

## Owner sends the concept, Claude fleshes it out (agreed 2026-10-24)
- The owner explains the concept in their own words and may not know the technical terms or exactly what each exercise targets.
- Claude researches and adds:
  - correct terminology in plain English (e.g. intrinsic foot muscles, foot tripod, proprioception),
  - what each exercise works and why,
  - cues and common mistakes that follow from the owner's concept.
- **The owner's concept leads.** Claude never changes what's taught.
- Use only well-established anatomy and movement science. No invented studies or statistics, and no medical or cure claims.
- **Every report lists what Claude added beyond the owner's words**, so the owner can confirm or correct it quickly.

## Rules
- Claude never invents results, testimonials or medical claims. Anything uncertain is marked `[PLACEHOLDER: …]` or `[OWNER TO CONFIRM: …]`.
- Videos are YouTube links shown in privacy mode (youtube-nocookie). Set them to **Unlisted** on YouTube so only buyers see them on the site.
- Images are uploaded to R2 storage, not hot-linked.

## Programme list (from the owner, 2026-10-23)
- **Lower Body Regeneration:** flagship. Feet, arches and toes → Achilles and calves → knees → hips.
- Upper Body
- Hips
- Breathwork & Regulation
- Full Body
- Stretching: Upper Body, Lower Body, Full Body
- _More packages to come (owner voice note pending)._
