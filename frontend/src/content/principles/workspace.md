# Principles: How This Software Thinks About Value

This page explains the ideas the rest of the app is built on. It teaches what investing is, what a share of stock really is, the difference between price and value, and how this software estimates what a company is worth. It also lays out the step by step framework the app follows, from the economy down to a single company. Read this first. Once you understand these ideas, every later page (economy, industry, comparative, individual, valuation) will make sense as one connected process instead of a pile of separate numbers.

## Investing is not the same as speculating

Investing means committing money after careful study, expecting to get your money back plus a fair return. Benjamin Graham, the teacher who shaped modern stock analysis, set the standard clearly: an investment operation is one which, on thorough analysis, promises safety of principal (you are unlikely to lose your money under normal conditions) and a satisfactory return. Anything that does not meet both tests is speculation (Benjamin Graham and David Dodd, Security Analysis).

Speculation is the attempt to turn a little money into a lot, quickly, usually by guessing where prices will go next (Fred Schwed, Where Are the Customers' Yachts). There is nothing secret about the difference. The investor studies the business and the price, then buys only when both make sense. The speculator watches the price and hopes.

This app is built for investing, not speculating. Every tool here points you back to the facts of the business and the price you would pay for it.

## A share of stock is a piece of a real business

When you buy a share, you are buying a small ownership slice of an actual company, with its factories, products, customers, and profits. You are not buying a ticker symbol to flip when the number moves.

Warren Buffett puts it plainly to his own shareholders: do not think of yourself as merely owning a piece of paper whose price wiggles around daily. Instead, picture yourself as a part owner of a business you expect to hold for a long time, the way you might own a farm or an apartment building with your family (Warren Buffett, The Essays of Warren Buffett).

This single shift in attitude changes everything. If you own a business, you care about what the business earns over years. You stop reacting to every twitch in the daily price.

## Price is what you pay, value is what you get

The price of a stock is the number quoted on the market right now. The value of a stock is what the business is actually worth based on the cash it can produce. These two numbers are related, but they are not the same, and they are often far apart.

Aswath Damodaran, who teaches valuation, warns against the cynic who knows the price of everything and the value of nothing. A sound rule of investing is that you do not pay more for an asset than it is worth. A price can never be justified just because someone else might pay even more later (Aswath Damodaran, Investment Valuation).

The whole point of analysis is to estimate value independently, then compare it to price. When value is clearly higher than price, you may have an opportunity. When price runs far above value, caution is in order.

## Intrinsic value is the cash a business will produce, brought back to today

Intrinsic value is the worth of a business based on its own fundamentals: the cash it is expected to generate over its life, adjusted for how risky and how distant that cash is. Cash you receive years from now is worth less than cash today, so future cash is discounted (reduced) back to a present value before it is added up (Aswath Damodaran, Investment Valuation).

A simple way to picture it: a business is worth the stream of money it can hand to its owners over the years ahead, counted in today's terms. This is why a company with no clear path to profits is hard to value, and why a steady, understandable business is easier.

Intrinsic value is not the same as net present value alone. It is more of a philosophy: a disciplined estimate of what the business is really worth, made by someone trying to be honest about the future (Saurav Sen and others, in the spirit described in Modern Value Investing).

## There are two honest ways to value a company, and this app uses both

There are two sound, widely used approaches to estimating value (Aswath Damodaran, Investment Valuation; Investment Analysis, Reilly and others).

The first is intrinsic valuation, also called discounted cash flow. You estimate the cash the business will produce, then discount it back to today to get a value. This looks at the company on its own terms.

The second is relative valuation. You compare the company to similar companies using a shared yardstick, such as the price to earnings ratio or the price to book ratio. The idea is that comparable businesses should trade at comparable multiples, so a company priced far below its peers may be cheap (Aswath Damodaran, Investment Valuation).

Each approach has a weakness. Discounted cash flow depends on your forecasts, which can be wrong. Relative valuation can mislead you if the whole peer group is overpriced. Because each checks the other, this app shows you both: a comparative view across peers, and an intrinsic estimate for the single company.

| Approach | What it asks | Main risk |
|---|---|---|
| Intrinsic (discounted cash flow) | What is this business worth on its own cash? | Your forecasts may be wrong |
| Relative (multiples vs peers) | Is it cheap or dear next to similar firms? | The whole group may be mispriced |

## Margin of safety: buy well below your estimate of value

You will never estimate value perfectly. A margin of safety means buying at a price clearly below your value estimate, so that even if you are somewhat wrong, you are protected. The bigger the discount, the bigger the cushion (Modern Value Investing; the idea originates with Benjamin Graham).

Buffett gives the classic picture: if you build a bridge to carry thirty thousand pounds, you only drive ten thousand pound trucks across it. The same principle works in investing (Warren Buffett, The Essays of Warren Buffett, quoted in Modern Value Investing).

The margin of safety depends almost entirely on the price you pay. Pay full value and you have no cushion. Pay much less than value and you can be wrong about the details and still come out fine. This is the last gate in the app's framework, and it exists to keep you from being ruined by your own mistakes.

## Costs and patience decide most of the outcome

Most of what an ordinary investor can control is not picking winners. It is keeping costs low and staying invested for a long time. Fees, taxes, and frequent trading quietly drain returns year after year, and over decades that drain compounds into a large loss of wealth (Charles Ellis, Rethinking Investing).

A fee that sounds small, like one percent of your assets, is not small when measured against your return. If the market returns seven percent and you pay one percent, you have handed over roughly a seventh of your gain, every single year (Charles Ellis, Rethinking Investing). Trading costs and taxes from constant buying and selling add still more drag.

John Bogle showed why low cost, broadly diversified index funds tend to beat most active managers over time: they keep almost all of the market's return instead of giving it away in fees (John C. Bogle, The Clash of the Cultures). Burton Malkiel reaches the same calm conclusion: the steady, patient investor who keeps costs down and holds on usually does better than the busy one (Burton G. Malkiel, A Random Walk Down Wall Street). The lesson for this app: a good value estimate matters, but so does the discipline to act rarely and hold patiently.

## Own good businesses and let time and compounding work

The surest path to building wealth is owning good businesses and holding them for a long time, letting their earnings and your returns compound (Darrin Erickson, Global Investing). Compounding means your gains start producing their own gains, and over many years that snowball becomes the main driver of wealth.

Good businesses share recognizable traits: they earn strong and steady profits, operate in growing industries, hold a defensible position, carry a sound balance sheet, and are run by capable managers (Darrin Erickson, Global Investing). Buffett describes the same patience from the owner's seat: he buys a business expecting to hold it indefinitely, and measures success by the long term progress of the company, not by the month to month moves of its stock price (Warren Buffett, The Essays of Warren Buffett).

Owning the best businesses and not overpaying for them is, in the end, the simplest reliable strategy. The app is designed to help you find such businesses and judge whether their price is fair.

## The market is moody, so use your own analysis

Imagine a business partner named Mr. Market who shows up every day and offers to buy your share or sell you his, at a price he names. The trouble is that Mr. Market has emotional problems. Some days he is euphoric and quotes a very high price. Other days he is depressed and quotes a very low one. He does not mind being ignored, and he will be back tomorrow with a new number (Benjamin Graham's parable, retold by Warren Buffett in The Essays of Warren Buffett).

The key, Buffett says, is that Mr. Market is there to serve you, not to guide you. His price is useful only when it is foolish enough to give you a bargain or to let you sell dear. If you cannot value the business better than he can, you do not belong in the game (Warren Buffett, The Essays of Warren Buffett).

Graham summed up the deeper truth this way: in the short run the market is a voting machine, swayed by mood, but in the long run it is a weighing machine, which eventually reflects what a business is really worth. This is why the app keeps pulling you back to your own analysis instead of the crowd's emotion.

## The framework this software follows, from the top down

This app analyzes a stock the way professional analysts do, in a deliberate order: the economy first, then the industry, then the single company, then a value estimate, then a margin of safety. This is the spine of the whole product, so it is worth understanding fully (Investment Analysis, Reilly and others; supported by Aswath Damodaran and by Darrin Erickson, Global Investing).

The method is called top down because you start wide and narrow down. There are four core studies, and then two final judgments.

**1. The economy.** You begin with the overall economy and the market. A single company rarely thrives when the whole economy is shrinking, and most companies do better when the economy grows. Research shows that much of any one firm's earnings change traces back to changes in the broad economy (Investment Analysis, Reilly and others). The state of the economy and the level of interest rates affect every valuation, because they shape both expected growth and the discount rate you apply to future cash (Aswath Damodaran, Investment Valuation). So the economy layer sets the backdrop for everything below it.

**2. The sector.** Next you narrow from the whole economy down to its broad sectors. Sectors do not all move together through the business cycle: cyclical sectors such as consumer discretionary, industrials, and materials swing hard with expansions and recessions, while defensive sectors such as consumer staples, utilities, and health care hold up better when growth slows, because people cannot easily stop buying what they sell (Strategic Value Investing, Johnson; Investment Analysis, Reilly and others). Knowing the phase of the cycle from the economy layer above, you can see which sectors the current environment favors and which it works against. This step turns the broad economic picture into a shorter list of promising areas before you drill into any single industry.

**3. The industry.** Next you study the industry the company operates in. Industries differ in how fast they grow, where they sit in their life cycle, how cyclical they are, and how fierce the competition is (Investment Analysis, Reilly and others). A strong economy still leaves weak industries behind, and a good company in a hurting industry struggles. The industry layer tells you whether the company is swimming with the current or against it, and it gives you the peer group you will later use for relative valuation.

**4. The single company.** Only now do you examine the individual company in detail: its earnings, cash flows, balance sheet, competitive position, and management (Darrin Erickson, Global Investing). The economy and industry layers above have already told you what to expect, so you can judge whether this company is genuinely strong or just riding a favorable trend. This is also where you decide which companies in a good industry are the best ones to own.

**5. A value estimate.** With the economy, industry, and company understood, you estimate what the company is worth. You use both approaches described earlier: an intrinsic estimate from discounted cash flow, and a relative check against the peers you identified at the industry stage (Investment Analysis, Reilly and others). The earlier layers feed directly into this step, because your growth and risk assumptions came from the economy and the industry, and your comparison set came from the industry.

**6. A margin of safety.** Finally, you compare your value estimate to the current price and demand a margin of safety. You buy only when the price sits well below your estimate, so that errors in the layers above cannot easily ruin you (Modern Value Investing; the idea originates with Benjamin Graham). This is the last gate, and it is where all the patient work above turns into an actual decision.

Each layer informs the next. The economy frames the industry, the industry frames the company, the company drives the value estimate, and the value estimate, set against price, decides whether there is a margin of safety. Skipping a layer means guessing at the inputs for the one below it.

## How this connects to the rest of the app

These principles are not abstract ideas; they are the literal page order of this software. The economy page sets the backdrop. The industry page narrows the field and gives you a peer group. The comparative page values the company against those peers. The individual page studies the single business in depth. The valuation page brings it together into an estimate of worth and asks whether the price offers a margin of safety. Move through the pages in that order, keep your own analysis ahead of the market's mood, mind your costs, and let time do the heavy lifting.
