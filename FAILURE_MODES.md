# Failure modes

Twelve ways a verification step reports **pass** while the artifact is broken. Each one happened in a real automated production pipeline between July and September 2026 (see [PREEXISTING.md](PREEXISTING.md)). They are written up here in a general form so you can check your own guards for them.

Every entry has the same parts:

- **Symptom**: what went wrong.
- **Why it looked green**: which check passed, and why it could not see the problem.
- **Reproduce**: the falsegreen command that recreates it against your guard.
- **Fix**: what a guard that catches it actually checks.
- **Origin**: the incident it comes from.

They share one root cause. **The guard checked something that stands in for the property you care about, not the property itself.** Examples: the file's existence instead of its content, a summary field instead of the body it summarizes, the declared font instead of the rendered one.

| # | Family | Formats falsegreen mutates |
|---|---|---|
| 01 | [empty-input](#empty-input) | text, md, json, csv, svg, wav |
| 02 | [placeholder-as-content](#placeholder-as-content) | text, md, json, csv, svg |
| 03 | [occlusion](#occlusion) | svg |
| 04 | [overflow](#overflow) | svg |
| 05 | [declared-vs-rendered](#declared-vs-rendered) | svg, text, md, csv, json |
| 06 | [metadata-identity](#metadata-identity) | svg, md, json, wav |
| 07 | [stale-cache](#stale-cache) | json, md |
| 08 | [numeric-truncation](#numeric-truncation) | csv, json |
| 09 | [dead-regex](#dead-regex) | json |
| 10 | [silent-track](#silent-track) | wav |
| 11 | [self-referential-check](#self-referential-check) | json, md |
| 12 | [structured-overrides-body](#structured-overrides-body) | json, md |

---

## empty-input

**Family 01: the guard passes because it was given nothing to check.**

- **Symptom:** A rendering gate was supposed to refuse any output longer than the length limit in the brief. The extractor read the brief, found no limit it recognized, and returned "not found". The gate then skipped its check. The output happened to fit, but only by luck.
- **Why it looked green:**
  - The limit was an optional value. When it was missing, the validator returned early.
  - An early return looks exactly like "rule read and satisfied".
  - The extractor's unit tests used phrasings the author had imagined ("within 60 seconds"). Real briefs used noun phrases ("a 60-second film") and ranges ("55–60 seconds").
  - "Not found" was logged as an info line, not counted as a check.
  - The same shape shows up in any loop of the form `for each item: assert valid(item)`. Zero items means zero failures.
- **Reproduce:** `falsegreen run --mutators empty-input --guard "<your guard> {artifact}" --artifact <file>`. falsegreen keeps the structure and removes the content: JSON arrays become `[]` (every key is kept), CSV keeps only its header, Markdown keeps only its headings, SVG keeps an empty root, and a WAV file keeps a valid header with 0 frames.
- **Fix:**
  - Make "I could not read the rule" a separate state from "there is no rule", and fail on it, or at least surface it loudly.
  - Check that collections are non-empty before checking their elements.
  - Write your extractor's tests using real input phrasings.
  - If a rule has both a lower and an upper bound, check both. A rule with only one end checked lets half the bad outputs through.
- **Origin:** 2026-07-22, a video length gate that never fired.

## placeholder-as-content

**Family 02: a placeholder is text, so every emptiness check passes.**

- **Symptom:** A form was generated from an official template and submitted. One required field still held the template's own instruction text. The organizer caught it.
- **Why it looked green:**
  - Every pre-submission check asked some version of "is this field empty?": a length above zero, not null, required field present.
  - Instruction text passes all of them. It is real text, it renders, and it comes out of text extraction.
- **Reproduce:** `--mutators placeholder-as-content`. falsegreen replaces prose with template text of the same character length (`[Write the summary here] Lorem ipsum…`), so size-based checks stay quiet. The demo report changes size by only −0.5%.
- **Fix:**
  - Ask where the text came from, not whether text exists. If a required field still equals the template's text for that field, reject it.
  - As a fallback, reject known placeholder patterns (`lorem ipsum`, `[Insert … here]`, `TBD`, `TODO`).
  - If the original template is unavailable, report that the check could not run. Never count it as a pass.
- **Origin:** 2026-08-14, an application form submitted with an instruction string still in a required field.

## occlusion

**Family 03: the text is still in the file, painted over by a later opaque shape.**

- **Symptom:** Hand-authored SVG cards were rasterized. One line of text sat under an opaque panel that was drawn later in the file. It was not deleted, just invisible.
- **Why it looked green:**
  - The SVG was valid and the rasterizer succeeded.
  - "Is the text in the document?" checks passed, because the text is in the document.
  - In SVG, drawing order is stacking order. Nothing warns you about a shape that covers text.
- **Reproduce:** `--mutators occlusion` adds an opaque `<rect>` in the background colour, drawn after the text and covering every text box. Every character stays in the file.
- **Fix:** For each text element, check whether any opaque shape drawn **after** it covers a meaningful share of its bounding box. The reference guard uses 12%. Measure the boxes in the same engine that renders the final file; a different rasterizer measures something else.
- **Origin:** 2026-08-16, a card set where three lines went missing (17% occluded, 112 px overflow).

## overflow

**Family 04: the content runs past a box with a fixed size, and the box clips it silently.**

- **Symptom:** A document generator measured paragraph heights in an off-screen container, then packed them into fixed-height pages. The PDF had a valid page count, but text was cut off on 36 of 54 pages.
- **Why it looked green:**
  - The measuring container was 1280 px wide; the page body was 576 px. Text wraps into fewer lines in a wider box, so every height was underestimated.
  - The page box used `overflow: hidden`, so the extra text was clipped without any error.
  - The only gate counted pages. Both the broken count (54) and the fixed count (89) were inside the allowed 45–90 range.
  - SVG has the same property: it has no wrapping and no shrink-to-fit.
- **Reproduce:** `--mutators overflow` enlarges the longest line of an SVG until its estimated width runs past the canvas edge. On the bench fixture that is about 340 px over.
- **Fix:**
  - After layout, check each box: if `scrollHeight > clientHeight`, fail.
  - For SVG, check each text element's bounding box (`getBBox()`) against the canvas.
  - Measure in the same container width you render into.
  - Remember that clipping hides a defect, it does not fix it.
- **Origin:** 2026-09-04, a screenplay PDF with 36 of 54 pages truncated. Confirmed again on 2026-08-16 with SVG (112 px, 105 px and 9 px overflows).

## declared-vs-rendered

**Family 05: the file records what you asked for, not what was rendered.**

- **Symptom:** In two document formats on the same day, the required font was declared in the file, but a fallback font was used to typeset it.
  - In one, only the Latin font slot was set, so CJK text used the theme font.
  - In the other, the font's declared type did not match the font file, so the application silently substituted a similar font.
- **Why it looked green:**
  - The generator reported "font set in 7 places".
  - The missing-glyph check found 0 missing, because the fallback font covers every character.
  - Even the page count was identical, because the fallback has similar metrics.
  - No number anywhere showed the problem.
- **Reproduce:** `--mutators declared-vs-rendered`.
  - For SVG, falsegreen declares a font the renderer does not have.
  - For text formats, it re-encodes the file as Latin-1, while UTF-8 readers (including JSON parsers) still read it as UTF-8. Every accented character becomes U+FFFD, yet `JSON.parse` succeeds and the length barely changes.
- **Fix:** Judge the output, not the declaration.
  - Convert to PDF and list the embedded fonts.
  - Check declared fonts against the fonts actually installed for the renderer.
  - Decode text strictly (`new TextDecoder('utf-8', { fatal: true })`) instead of leniently.
- **Origin:** 2026-08-16, a 28-slide deck and a word-processor document, both typeset in fallback fonts.

## metadata-identity

**Family 06: the body has no name in it; the file does.**

- **Symptom:** A document for blind review was scrubbed until the body had zero identifying details. The file's embedded property stream still held the operating-system username as the author.
- **Why it looked green:** The body text search, the PDF text extraction and the visual review were all clean. Every check scanned the body, but the reviewer receives the whole file.
- **Reproduce:** `--mutators metadata-identity` adds a username and a home-directory path in a place a body check never reads:
  - a `<metadata>` element (SVG)
  - front matter (Markdown)
  - a `_meta` object (JSON)
  - a RIFF `LIST/INFO` chunk (WAV)
- **Fix:**
  - Scan every metadata stream in the container for identity strings: the OS username, machine name, home paths, and author/creator fields.
  - When you overwrite binary property sets, keep the byte length the same, then re-verify that the file still opens.
- **Origin:** 2026-08-16. 19 of the 20 documents the pipeline had generated carried the username in their metadata.

## stale-cache

**Family 07: the label stays the same while the content behind it changes.**

- **Symptom:** A public catalog filtered listings with `deadline > now()`. After incremental regeneration was enabled, the list froze: expired items stayed and new items never appeared.
- **Why it looked green:**
  - The database driver sent queries over HTTP, and the framework cached those requests keyed on the request body, which was the query text.
  - The text `now()` never changes, so every regeneration hit the same cache entry.
  - The cache key described the request, not the answer.
- **Reproduce:** `--mutators stale-cache` edits the content of a JSON or Markdown artifact but leaves its `content_sha256` / `etag` / `digest` field untouched.
- **Fix:**
  - Recompute the digest; do not trust it.
  - On the caching side, put the thing that varies into the key. Here that meant a time literal rounded down to the regeneration window instead of `now()`, so the key changes exactly when the answer should.
- **Origin:** 2026-08-07, a catalog site that showed two different moments in time in one build.

## numeric-truncation

**Family 08: scientific notation drops the largest values first.**

- **Symptom:** A large transaction dataset was aggregated with a strict integer parser. About 0.15% of rows failed to parse and were skipped. Those rows held values like `9.2e+07`, left behind when a spreadsheet saved its displayed values.
- **Why it looked green:**
  - Skipping 0.15% of rows looked negligible.
  - But a spreadsheet only switches to exponent display for long numbers, so the skipped rows were the largest ones. 0.148% of rows held 2.2% of the total amount, 15 times their share.
  - The largest single value in the dataset was among them.
- **Reproduce:** `--mutators numeric-truncation` rewrites the largest values (the top 10%, at least one) the way a spreadsheet displays them: `2150000000 → 2.2E+09`. Rows, columns and "is it a number?" all still pass. Declared totals are left unchanged.
- **Fix:**
  - Reject exponent notation where integers are expected, or count it explicitly and report the precision lost.
  - Reconcile against a total that comes from the source.
  - Measure missing data by the value it carries, not just by row count.
- **Origin:** 2026-08-05, about 102.5 million rows, where 151,442 rows held 2.2% of the money.

## dead-regex

**Family 09: a rule that can never match looks the same as a rule that never needed to.**

- **Symptom:** A text classifier had a rule alternative made of a non-ASCII word followed by `\b`. Every post that alternative was meant to catch (13 of them) went into the wrong category.
- **Why it looked green:**
  - In JavaScript (without the `u` flag, and even with it), `\b` only treats `[A-Za-z0-9_]` as word characters.
  - A letter like `é` is not a word character, so there is never a boundary after it, not even at the end of the string. The alternative was dead.
  - Other alternatives in the same regex still matched, so the category showed 36 hits and looked healthy. The unit test happened to exercise a live branch.
- **Reproduce:** `--mutators dead-regex` targets a rules file (JSON with `pattern` fields). It wraps patterns that contain non-ASCII text in `\b(?:…)\b`, and ASCII-only patterns in `^(?:…)$`, so they look *stricter*. On the bench fixture, `café` dies while `crème brûlée` survives (it ends in an ASCII `e`). That partial death is exactly the shape of the original incident.
- **Fix:**
  - Give every alternative at least one example it must match, and test them all.
  - Be suspicious of `\b`, `\w` and `\d` near non-ASCII text. Use lookarounds such as `(?<![\p{L}\p{N}])` with the `u` flag.
- **Origin:** 2026-08-02, a classifier with a dead branch: 0 detections before the fix, 13 after.

## silent-track

**Family 10: silence that nobody hears still counts toward the length.**

- **Symptom:** A code-driven video renderer guaranteed frame-exact length: 1740 frames, exactly 58.000 s of video. The container reported 58.05 s. Strict length rules are judged on the container.
- **Why it looked green:**
  - With no audio supplied, the renderer added a silent AAC track by default.
  - AAC uses 1024-sample frames, so the track does not end exactly where the video ends, and a container takes the length of its longest stream.
  - The measurement probed only the video stream.
- **Reproduce:** `--mutators silent-track` appends digital silence to a WAV file: at least 1 s, or 25% of its length if that is longer. The header stays valid and the original samples are untouched; the bench fixture goes from 2.00 s to 3.00 s.
- **Fix:**
  - Measure at the layer the consumer checks: the container or format duration, not one stream.
  - Check for trailing digital silence.
  - List every stream in the output at least once. Streams added automatically are the ones nobody looks at.
- **Origin:** 2026-07-22, a renderer that measured 58.000 s on the video stream and 58.050 s on the container.

## self-referential-check

**Family 11: the checker asks its own list instead of the disk.**

- **Symptom:** A route checker compared a declared list of paths against the files it had collected. But it only collected files matching its own hard-coded set of known types. Real files of other types were never collected, so they were reported missing.
- **Why it looked green:**
  - The original incident produced a false *red*, and it sat ignored for five work cycles because nobody believed the alarm.
  - The mirror image is the false green. A guard reads a manifest's `"exists": true` or `"status": "ok"` and never looks at the disk.
  - Either way, the checker answers from its own description of the world, not from the world.
- **Reproduce:** `--mutators self-referential-check` points one manifest entry (or one Markdown link) at a plausible file that does not exist, such as `chart.svg → chart.final.svg`. It leaves every status field that vouches for it unchanged.
- **Fix:** Answer existence questions with filesystem lookups, one per declared path. Use your own lists only for questions that really are about definitions.
- **Origin:** 2026-08-06, a route checker whose list of 32 hard-coded paths had drifted from the actual files.

## structured-overrides-body

**Family 12: a structured field overrides the body it summarizes.**

- **Symptom:** A screening step accepted a call for entries as "eligible, no restrictions". The structured eligibility field said "no restriction". The full text required several prior professional works, and months of in-person obligations after selection.
- **Why it looked green:**
  - The structured field only captured identity limits such as age and nationality.
  - Screening read that field first and stopped, even though the contradicting sentence was in the description it already had.
  - The summary won over its source, and anything the summary could not represent became invisible.
- **Reproduce:** `--mutators structured-overrides-body` shrinks the body and leaves the summary untouched. For example, `items` goes from 3 to 1 while `item_count` still says 3, or the front matter still says `sections: 4` over 2 sections.
- **Fix:**
  - Recompute summary fields from the body.
  - If a decision has to rely on the summary, require the decision to cite evidence from the body.
- **Origin:** 2026-07-25. Three cases were misjudged in two days; a manual check before production stopped six items in a single day.
