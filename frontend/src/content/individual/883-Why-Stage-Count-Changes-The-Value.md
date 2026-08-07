# Why Stage Count Changes The Value

## What it is

The stage count is the shape of a valuation in time: how many distinct phases the forecast passes through before the perpetuity begins. The engine computes the same company three ways. A one-stage model is a pure perpetuity that locks today's economics in forever, with no explicit forecast years at all. A two-stage model runs five years at the measured high growth and then drops to stable growth overnight. A three-stage model runs five high-growth years and then a five-year transition in which growth, reinvestment, and the discount rate all descend together to their stable levels.

The stage toggle exists because the three shapes can produce very different values from identical inputs. The difference is not noise. Each shape makes a specific claim about how long the company's current economics last and how they end, and picking a shape is picking a claim.

## The three shapes

| Shape | Explicit years | What it claims | Where it goes wrong |
|---|---|---|---|
| 1-stage | None. The perpetuity starts today | The company is already stable: growth at or below the risk-free rate and no meaningful excess returns | Applied to a fast grower, the shape ignores the entire growth phase and understates the value |
| 2-stage | 5 high-growth years, then an overnight drop | A moderate advantage that competition closes abruptly around year five | Applied to a very fast grower, the overnight drop from high to stable growth cuts off the transition years the decline actually takes, which understates the value |
| 3-stage | 5 high-growth years plus a 5-year transition | A durable advantage that erodes gradually, with growth, reinvestment, and risk fading in step | Applied to an already-stable firm, the shape invents a growth phase that does not exist and overstates the value |

Loss-making companies take a fourth shape: a revenue-driven path in which every input changes every year for a decade, because a company without profits has no stable base for the simpler shapes to stand on.

## How this section works

The engine recommends a stage count from observables: the life-cycle stage, the current excess returns, the company's size, and the measured growth rate. Growth above 25 percent forces three stages, since a rate that far above any stable rate cannot vanish overnight. The toggle then shows every shape anyway, each with its own intrinsic value, margin of safety, and a note on why the shape fits or misfits this company.

The three-stage transition is where the engine's machinery is most visible. Growth steps down in equal yearly increments, the reinvestment rate follows so that each year's growth is paid for at that year's return, and beta fades toward its stable level so the discount rate declines along the path. Each year is discounted at the cumulated product of every rate on the way, so the descent is priced consistently. The final explicit year already reinvests at the stable pair, which hands off into the terminal value without a seam.

## Why it matters

Reading the spread across the three values teaches more than any single value can. A company whose one-stage and three-stage values nearly agree carries little of its worth in the growth story, so the valuation survives structural doubt. A company whose values fan out widely is being priced mostly on how long its advantage lasts, and the stage question is the whole investment question.

The direction of the errors is worth memorizing. Too few stages on a fast grower biases the value down, because real transition years of above-stable growth are deleted. Too many stages on a settled firm biases the value up, because imaginary growth years are added. An analyst who knows which side the error lands on knows which variant is the conservative one for the company at hand.

| Company profile | Conservative variant | Aggressive variant |
|---|---|---|
| Very fast grower | 1-stage or 2-stage, which delete real growth years | 3-stage, which grants the full descent |
| Moderate grower | 1-stage, which ignores the five-year advantage | 3-stage, which adds a transition the gap does not need |
| Already stable | 1-stage, which is also the accurate one | Any variant with explicit years, which invents growth |

The table is a reading aid rather than a rule, because the accuracy note beside each variant already states the engine's judgment for this specific company. The value of the table is in bracketing: the conservative and aggressive variants bound what the structural choice alone can do to the number.

## Common traps

The first trap is choosing the stage count by the value it produces. The count should be argued from the company's life-cycle evidence, then the value read off, never the reverse. The accuracy note beside each variant states the structural argument so the choice can be made on those grounds.

The second trap is assuming more stages always means more accuracy. A three-stage model has more inputs, and every added input carries estimation error. For a moderate grower the transition phase adds noise rather than information, which is exactly why the engine recommends two stages for that profile.

The third trap is forgetting that all three shapes share the same stable-phase discipline. The stage count changes how the company travels to stability, never where it arrives. Terminal growth is capped at the risk-free rate and terminal reinvestment is forced to growth over return in every variant, so a disagreement between variants is always about the journey.
