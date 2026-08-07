# Terminal Value And Excess Returns

## What it is

This page explains the most important theorem in terminal-value arithmetic: when a company's stable return on capital equals its cost of capital, the terminal value stops depending on growth entirely. Faster assumed growth adds nothing and slower assumed growth costs nothing. Growth only creates value when the company earns more on its investments than investors charge for funding them, and that difference is called an excess return.

The result falls straight out of the engine's terminal formula. The terminal value is next year's free cash flow divided by the gap between the stable cost of capital and stable growth. Next year's free cash flow is after-tax operating profit grown one year and reduced by the stable reinvestment rate, which is growth divided by the stable return. Raising growth therefore does two things at once: it enlarges the profit stream and it enlarges the reinvestment bill that funds the stream. When the stable return equals the cost of capital the two effects cancel exactly, to the last decimal.

## The theorem in numbers

| Stable return vs cost of capital (both sides at a 9 percent cost of capital) | Effect of raising stable growth from 1 to 3 percent |
|---|---|
| Return 9 percent, equal to the cost of capital | Terminal value unchanged. Every extra unit of growth costs exactly what it earns. |
| Return 12 percent, above the cost of capital | Terminal value rises. Growth compounds an advantage, so more growth is worth paying for. |
| Return 7 percent, below the cost of capital | Terminal value falls. Growth compounds a shortfall, and the faster the firm grows the more value it destroys. |

## How this section works

The engine builds every terminal value with the reinvestment rate forced to growth divided by the stable return, which is what makes the theorem hold exactly rather than approximately. The final explicit forecast year already reinvests at the stable pair, so the hand-off into the perpetuity carries no seam. The stable return itself is anchored to the industry median where one exists, otherwise moved halfway toward the cost of capital, and set equal to the cost of capital when nothing better is known.

That last fallback is the theorem applied as policy. With no evidence about perpetual advantage, the engine assumes excess returns of zero, and the terminal value then simply capitalizes the profit stream with growth having no effect on it. An analyst who wants the terminal value to reward growth must first justify a stable return above the cost of capital.

| Stable return anchor | When the engine uses it | Effect on the theorem |
|---|---|---|
| Industry median return | An industry benchmark exists | Excess returns persist at the industry's level, so growth can add or destroy value |
| Halfway to the cost of capital | No industry anchor, but the company's own return is positive | Excess returns fade partway, so growth adds muted value |
| The cost of capital itself | No usable information | Excess returns are zero and the terminal value ignores growth entirely |

The valuation labels which anchor was used, so the reader can see how much theorem sits inside the terminal value before trusting it.

## Why it matters

The theorem redirects the entire growth argument. The instinctive question about a growth story is how fast the company will grow, but the value-relevant question is what the company will earn on capital while growing. A company reinvesting at its cost of capital can double its size and leave its owners no richer. The scale changes; the value does not.

The theorem is also the strongest available defense against terminal-value manipulation. In an undisciplined model the terminal growth input is the easiest dial for reaching any desired value. Once reinvestment is tied to growth through the stable return, that dial only works if the excess-return assumption works, and excess returns are something evidence can be demanded for. Whole industries do hold excess returns for long periods, which is why the engine anchors to industry medians rather than forcing every firm to zero advantage. But the burden of proof sits where it belongs.

For a growth company trading at a rich price, the theorem gives the exact question due diligence must answer: what protects this company's returns from competition forever? Brands, network effects, switching costs, and regulation are the usual candidates. Without one of them, the honest stable return is the cost of capital and the honest terminal value ignores the growth.

## Common traps

The first trap is pairing a high terminal growth rate with a stable return quietly set above anything the industry earns. The two inputs multiply into the terminal value together, and optimism hidden in the return is harder to spot than optimism in growth. Check the stable return's source label before trusting the terminal value.

The second trap is the reverse: treating the theorem as proof that growth never matters. Growth matters enormously for a company with durable excess returns, and it matters during the explicit years even when the terminal phase earns none. The theorem only says growth without advantage is worthless in perpetuity.

The third trap is missing the value-destruction case. A company whose stable return sits below its cost of capital is made worse by growth, and a model that assumes such a company grows forever is assuming perpetual value destruction. For that profile a lower growth assumption raises the value, and shrinkage can be the value-maximizing path.
