# Equity Value

## Part 1: Definition

Equity value is the part of enterprise value that belongs to common shareholders, once every claim ahead of them is settled. A claim ahead of shareholders is money owed to lenders or other parties who must be paid before the owners. Enterprise value is the worth of the whole operating business before that split. Common shareholders are the ordinary owners of the company, last in line if the business is broken up and sold.

Equity value follows directly from enterprise value in this model. The model first estimates the value of the operating business, then adjusts for items the operating value left out. Cash is added, debt is subtracted, and the stake that outside owners hold in subsidiaries is subtracted too. The result is the value that flows to the common shareholders as a group.

The adjustments that turn enterprise value into equity value:

| Adjustment | Effect on the total | Why |
|---|---|---|
| Cash and investments | Added | The model valued only operating cash flow, so cash held outside operations must be added back. |
| Gross debt | Subtracted | Lenders are paid before shareholders, so the full amount owed is removed. |
| Minority interest | Subtracted | Minority interest is the share of a subsidiary owned by outside shareholders, so that portion is not the parent's to keep. |

## Part 2: How it is calculated

The formula is:

`Equity Value = Enterprise Value + Cash and Investments − Gross Debt − Minority Interest`

Enterprise value is the starting point, the worth of the whole operating business from the discounted cash flow model. Cash and investments are added first. The model valued only the cash from operations, so any cash and marketable securities held on the side were never counted and must be added now. Marketable securities are short-term investments the company can sell quickly for close to their stated value.

Gross debt is then subtracted. Gross debt is the full amount the company owes to all lenders, including bonds and bank loans and leases. Lenders stand ahead of shareholders, so the whole amount they are owed leaves the business before shareholders receive anything. Minority interest is subtracted last. Minority interest is the portion of a part-owned subsidiary that belongs to outside shareholders rather than to the company being valued.

The app subtracts gross debt and adds cash as two separate steps, rather than subtracting net debt in one step. Net debt is debt with cash already taken out. Keeping the two apart keeps each figure visible, so a reader can see the full amount owed and the full cash pile on their own. The separate view also warns when a large cash balance is masking an equally large debt load, a risk a single net figure would hide.

| Approach | How it treats cash and debt | This app |
|---|---|---|
| Gross method | Adds cash and subtracts gross debt as two steps | Used here, so both figures stay visible |
| Net method | Subtracts net debt, which is debt minus cash, in one step | Not used, because it hides the size of each |

## Part 3: Why this metric is used to evaluate a company

Equity value is the figure a shareholder actually owns a piece of. Enterprise value covers lenders and shareholders together, but only equity value answers what the ownership stake is worth. A shareholder buys equity, not the whole enterprise.

Equity value also exposes the effect of borrowing. Two firms with the same operating value can have very different equity values if one is loaded with debt. The debt-heavy firm shows a smaller equity value, because lenders claim more of the business before shareholders.

Equity value is the last stop before the per-share figure. Dividing equity value by the share count gives intrinsic value per share, the number compared against the market price. Without a sound equity value, the per-share estimate cannot be trusted.

## Part 4: What influences the output

Equity value inherits every driver of enterprise value, then adds its own. Because equity value starts from enterprise value, any change in the cash-flow forecast or the discount rate flows straight through. A higher enterprise value lifts equity value dollar for dollar, before the other adjustments.

The balance-sheet adjustments then move the figure. A rise in cash, from a strong year or an asset sale, lifts equity value. New borrowing lowers it, because gross debt is subtracted. A change in minority interest, from buying out or selling down a subsidiary stake, shifts the amount removed for outside owners. One-off items on the balance sheet can move equity value even when the operating business is steady.

## Part 5: How to analyze it by industry and sector

The distance between enterprise value and equity value depends on how much debt and cash a sector typically carries.

| Industry type | Equity value versus enterprise value | Reason |
|---|---|---|
| Capital-light firms such as software | Equity value close to or above enterprise value | Low debt and large cash balances mean little is subtracted and much is added. |
| Capital-heavy firms such as utilities and telecoms | Equity value well below enterprise value | Heavy borrowing funds the assets, so a large debt figure is removed. |
| Firms with big subsidiary stakes | Equity value reduced by minority interest | A meaningful minority interest is subtracted for the outside owners of those subsidiaries. |
| Cash-rich firms | Equity value lifted by the cash add-back | A large cash pile is added in full, pushing equity value above the operating value. |
| Banks and insurers | Bridge does not apply in the usual way | Debt is raw material for these firms, so the ordinary debt subtraction misstates the equity. |

Comparing raw equity values across sectors says little, because the figure scales with company size. A cross-sector comparison only becomes meaningful per share or as a ratio against earnings or book value.

## Part 6: Reading the historical trend

A steady rise in equity value usually means the operating business is growing faster than its debt. A rise driven mostly by new cash, rather than by a stronger business, is weaker than it looks. A steady decline often means debt is climbing faster than the operating value, leaving a thinner slice for shareholders.

A sudden step in equity value can come from a large acquisition, a big new borrowing, or a change in the valuation assumptions. Compare the equity-value line with the debt line over the same years. Equity value that holds steady while debt keeps rising means the operating business is improving just fast enough to offset the extra borrowing. A base effect can also fake a trend, since a single weak forecast year drags the whole bridge down.

## Part 7: Metrics to read alongside it

### Enterprise Value

**Why read the two together.** Enterprise value is the worth of the whole operating business. Equity value is the shareholders' slice of that worth after lenders are paid. The two differ by the company's net debt, so reading them together shows how much of the business the lenders finance.

**What the combination tells you.** A small gap between the two means the company carries little net debt, and the operating value passes almost fully to shareholders. A wide gap means lenders fund much of the business, so the equity slice is thinner than the enterprise value suggests. Tracking the pair over time shows whether fresh borrowing is eating into the shareholders' share.

### Intrinsic Value per Share

**Why read the two together.** Intrinsic value per share is equity value divided by the diluted share count. Equity value is the whole amount, and the per-share figure is one slice of it. The per-share number cannot be computed until equity value is settled.

**What the combination tells you.** A rising equity value does not always raise the per-share figure, because a growing share count can offset it. Comparing the two over time shows whether new shares are diluting each owner's claim. When equity value grows and shares stay flat, the per-share value rises cleanly.

### Net Debt

**Why read the two together.** Net debt is total debt minus cash and investments. The bridge from enterprise value to equity value is really the addition of cash and the subtraction of debt, which together reverse net debt. Net debt is therefore the single number that separates the two values.

**What the combination tells you.** A large net debt figure means the gap between enterprise value and equity value is wide, and shareholders own a smaller share of the business. A negative net debt figure, where cash exceeds debt, lifts equity value above the operating value. Watching net debt explains most of the movement between enterprise value and equity value over time.

### Total Debt

**Why read the two together.** Total debt is the full amount owed to lenders, the figure this app subtracts as gross debt. Total debt is the largest single deduction on the way from enterprise value to equity value. The size of the deduction sets how much smaller equity value is than the operating value.

**What the combination tells you.** A heavy total debt load carves a large piece out of enterprise value, leaving a modest equity value. A light total debt load leaves most of the operating value with shareholders. Reading total debt beside equity value shows how much the borrowing costs the owners in value terms.

## Part 8: Limitations

Equity value is a residual, so it carries every error in the enterprise value plus the errors in the adjustments. A small mistake in the cash-flow forecast or the discount rate can swing equity value widely, because equity value sits at the end of the chain. The figure is an estimate built on other estimates.

The adjustments have their own traps. Reported debt can miss obligations such as pension shortfalls or off-balance-sheet leases, which understates the amount that should be subtracted. Cash may be trapped in foreign subsidiaries or needed to run the business, so adding it at full value can overstate equity value. Minority interest on the books is a historical accounting figure rather than a current market value, so subtracting it can be imprecise. Equity value also ignores the order of claims within the debt itself, so it says nothing about which lenders are paid first in trouble.

## Part 9: Precise qualitative questions

1. How much of the equity value comes from the enterprise value, and how much from the cash added back? Does the balance look reasonable?
2. What is the company's gross debt, and how much does subtracting it lower the equity value below the operating value?
3. Is any of the cash trapped abroad or needed for daily operations, so that adding it at full value overstates the equity?
4. Does the reported debt capture leases and pensions and other obligations, or is the subtracted figure too small?
5. How large is the minority interest, and does the book figure reflect what those outside stakes are really worth today?
6. Has equity value grown because the business improved, or because cash rose and debt was refinanced rather than repaid?
7. How has the gap between enterprise value and equity value moved over several years? Is new borrowing widening it?
8. If net debt is negative, is the excess cash a genuine strength or a sign of missed investment opportunities?
9. Does the equity value square with the market value of the shares, and what would explain a large difference?
10. Would the equity value survive a stricter discount rate, or does it depend on a generous cost of capital?
