# Connect deck copy, for owner review

Needs owner review.

This is the working file for the connect deck: the short question deck that
sits directly under the stage goal line on the Credit, Sector, Industry,
Comparative and Company pages. It is not imported by the app.

Every question names whole families of metrics rather than two or three
figures. The figures themselves reach the tutor through the cross-stage data
block, which is assembled only when the reader clicks "Explain using AI".

Each question carries its OWN hidden prompt, written for the families that
question asks about. The wording of both is the writer's, transferred word for
word from `docs/connect-questions.final.md`.

## One correction applied to the writer's text

In the hidden prompt of `sec.connect.readings` the clause "especially when
comparing a reading's ten-year percentile across sectors" described the data
block wrongly: a ten-year percentile belongs to an economic series, not to a
sector, so there is no percentile to compare across sectors. It now reads
"especially when you cite a reading's ten-year percentile or compare the
sectors' figures". Nothing else in any of the 25 questions or prompts was
changed.

## Where each key renders

| Key | Where it renders |
|---|---|
| `title.<stage>` | The heading of the deck on that stage's page. |
| `<id>` | The question text the reader sees. |
| `guidance.<id>` | Hidden. Sent ahead of that one question in the AI request, never shown on the page. |
| `credit.connect.<name>` | Two questions on the Credit and Banking page. |
| `sec.connect.<name>` | Six questions on a sector page. |
| `ind.connect.<name>` | Six questions on an industry page. |
| `comp.connect.<name>` | Five questions on a comparative page. |
| `indiv.connect.<name>` | Six questions on a company page. |
| `ai.gathering` | Replaces the "Explain using AI" label while the cross-stage figures load. |
| `ai.gatherFailed` | One small line under the button when those figures did not load. |
| `ai.abandoned` | What the panel says when the reader left the page before the figures were in. |

## Rules for the writer

1. The ids never change. A reader's saved answer is keyed by the id, so a
   reworded question keeps the answer that was typed under it.
2. The placeholders `{sector}`, `{industry}`, `{parentSector}` and `{company}`
   must survive a rewrite, in the question and in its hidden prompt. A test
   asserts that no placeholder is left unfilled once a deck is built.
3. A hidden prompt must describe the data block as it is. Its sections are
   ECONOMY, SECTOR, INDUSTRY, PEERS and COMPANY, and a prompt must not send the
   tutor to a section for a figure that sits in another one.
4. No em dash. No author names. No verdict language: a question asks, it does
   not conclude.

## Approved copy registry (machine-checked)

The 25 questions and their hidden prompts are NOT listed here. They are diffed,
word for word and in both directions, against `docs/connect-questions.final.md`,
which is where the writer writes them; a second copy of that text here could
only drift from it. What stays below is everything that document does not hold.

| Key | Approved text |
|---|---|
| `title.credit` | Connect the Economy to Credit Conditions |
| `title.sector` | Connect the Earlier Stages to This Sector |
| `title.industry` | Connect the Earlier Stages to This Industry |
| `title.comparative` | Connect the Earlier Stages to This Peer Group |
| `title.company` | Connect the Earlier Stages to This Company |
| `ai.gathering` | Gathering the figures |
| `ai.gatherFailed` | The cross-stage figures did not load, so the answer uses this page's figures only. |
| `ai.abandoned` | You moved to another page before the figures were gathered, so this question was not sent. Ask it again from the page it is about. |
