import os
import time
from pathlib import Path
# pyrefly: ignore [missing-import]
from openai import OpenAI
from dotenv import load_dotenv
import pdfplumber

load_dotenv()
import os
os.chdir(r"C:\Users\Zaki_Mir\Downloads\book-notes")
# --- CONFIG ---
CHAPTERS_DIR = "chapters"
NOTES_DIR = "notes"
MAX_CHARS_PER_CHUNK = 180_000  # ~45K tokens, safe for Kimi's context window

# Use Kimi directly or OpenRouter
client = OpenAI(
    api_key="sk-NYQDHwrOSLAjCrkbPYoUHAcShp5eTef6PzQAPCPO2MSc44Sz",
    base_url="https://api.moonshot.ai/v1",
    # For OpenRouter instead:
    # api_key=os.getenv("OPENROUTER_API_KEY"),
    # base_url="https://openrouter.ai/api/v1",
)

MODEL = "kimi-k2.6"
# For OpenRouter: MODEL = "moonshotai/kimi-k2.6"

NOTE_PROMPT = """You are an expert research analyst creating structured book notes.

Given the following book chapter text, produce structured notes in this exact format:

Do not be scared to repeat words. Use simple language. I am not a dictionary I am a human. Do not use emdash. Remove AI jargon and use precise language.

Generate Criteria and principles from this chapter page by page. Do not just title it based on the page

Here is things to look for when extracting criteira and priciples.

Get an in-depth method to analyze every financial statement metric

- Fundamentally (includes dcf)
- Qualitative
- Quantitative
- Industry Specific
- Technical (option pricing models). Risk + Probability, Arbitrage Pricing Theory, CAPM
- Future
- Competitively (comparison to similar companies)
- Alternative Cost Based (based off different assumptions)
- How global economic factors influence metric
- How individual economic factors influence metric
- Comparison to industry average
- Historical Metric movement (trend analysis/horizontal analysis)
- % Balance Sheet Analysis (vertical analysis)
- Ratios
- Breakdown into underlying economic factors/terms
- Relative valuation
- Elasticity/sensitivity analysis
- Stress Testing (recession, rate shock, commodity price hike)
- Group firms by business model (asset-heavy/asset-light, etc.)
- Behaviorally (management and investor psychology)
- Management
    - Different Departments (Marketing, Sales, Inventory management, manufacturing etc.)
        - What Factors economically can effect each sector
    - Information anticipation (information traders)
    - One time loss analysis (chance for more profit).
        - For example if company has a current negative FCF but for last 20 years has always had positive FCF, how to adjust for that one loss.
- Must utilize multiyear averages and compare with current metrics
- Horizontal Trend Analysis
- Vertical Analysis
- Innovation + technological change
- Products
- Industry dynamics
- Politically
- Compare with similar companies/industry averages
- Sum of Parts Analysis
- Historical Graphs => Presenting Fundamentally and interpreting statistically and fundamentally
- Must utilize multiyear averages and compare with current metrics
- Horizontal Trend Analysis
- Year-over-Year Change
- Compare with similar companies/industry averages => Especially with similar capital structures
- Capital Structure Analysis
- Credit analysis
- Investment Quality analysis (Especially banks and companies with high LT investments as % of assets)
- In relation to manufacturing process (From Materials to Product + Marketing)
    - For websites measure customer acquisition
    General Questions to ask:
- In-depth explain what this metric means?
- What assumptions does this model fall upon? How could metric be analyzed based off different assumptions?
- What are the trade offs with recent company decisions. Benefits and costs (opportunity costs)
    - Everything especially decisions have opportunity costs
- What are the limitations of the criteria? How can they be corrected?
- How could criteria be analyzed to predict future estimates of criteria?
- How could criteria be analyzed qualitatively?
- What Global economic factors and industry specific factors affect criteria (e.g. like commodities, or lumber for housing-based business) ?
- How could I connect/expand criteria to measure industry valuation + macroeconomic and microeconomic forces to determine overvalued/potential market declines
- How could competing companies affect criteria?
- What fundamental quantitative factors affect criteria?
- How can criteria be technically analyzed if possible?
- How could criteria be analyzed to determine fraud/legal overstatement?
- What are the pros/cons of criteria? How to improve?
- Who, what, where, when, why, and significance of criteria?
- How to apply DCF valuation to metric?
- How could metric be analyzed competitively?
- How could investor and management behavior influence company performance
- What could cause the metric to output false values that seem either too low/high to show well valuation.
- Who? What? Where? When? Why? How? + Significance + Assumptions
- What are the limitations
- Tradeoffs + Inefficiencies
- Do not just list criteria. Ask how to analyze this criteria.
These are the general questions to ask. In addition to extracting criteira use creativity to find more criteria that stems from it. Do atleast 10 points per page 

create a section which out of the completed notes are the 15% that affect 95% of investment outcomes. 

If the book is not on investment principles (like philosophical books) use the book to generate principles and criteria that would help with investment analysis even if indirectly. 

Here is an example of criteira/principles generated from warren buffets principles for investement managers which shoudl follow this style

What Investing in Financial Assets is all About

- I am a better investor because I am a businessman
- And a better businessman because I am an investor
- Return from an investment in one company can be compared with expected returns from other available opportunities
- Follow the cash
- Insert the correct numbers and you can rank the attractiveness of all possible uses of capital throughout the universe
- Fancy computers do not help with valuation
- A rough approximation is enough ⇒ What really matters is if the company would generate profits in the long run
- A business is similar to a bond ⇒ However its up to the analyst to estimate the future coupon rate of the company.
- Per share intrinsic value, not book value that counts.
- Measure volatility and smoothness in its earnings
- Subtract from cash flow calculations, or when adjusting financial metrics. Do not add.
    - Find the most conservative methods of calculating accounting metrics
- The tooth fairy does not pay for capital expenditures
- Watch out for optimistic accounts and “accounting maneuvers”
- Watch out for managers who seduce me with fancy prediction (Enron is an example)
Return on tangible Invested Capital Reflects that Cash Flow Generating Characteristics of the Business
- Higher return a business earns on the capital that is invested, the more cash it is producing and the more value is being created
- The fewer tangible assets needed to operate the business, the more cash is created per invested dollar
- More capital intensive business ⇒ Cash Flows are reduced in order to make investments to keep the same volume and competitive position
- Return On Invested Capital is determined by three variables
    - Sales ⇒ How many units of products will be sold at what price
    - Operating costs ⇒ How much does it cost to make these products
    - Invested Capital ⇒ How much capital is needed to conduct business
    A Company’s Profitability Is Determined By Three Items (DuPont)
- What its assets Earn
- What its liabilities Cost
- Its utilization of Leverage
Business Characteristics: The Great, The Good, The Gruesome
- Ask yourself: How I would like, assuming I had ample capital and skilled personnel, to compete with it.
- A great business has the power to raise prices without losing business to a competitor
- Does the company arise from a product or service that:
    - Is needed or desired
    - Though by its customers to have no close substitute
    - Is not subject to price regulation
- If a business requires a superstar to produce great results, the business cannot be deemed great
- The best protection against inflation is a great business
- Great companies prioritize customers first and have exceptional service provided by store employees
- Great companies preserve a favorable reputation with consumers
- Never invest in companies that require a lot of capital at a low return.
    - Never invest in industries that require a lot of capital at a low return.
- Never invest in companies with undifferentiated products, easy to enter, many competitors and over capacity
    - Analyze industries based off supply tight and supply ample years ratio
- Never invest in companies where their advantage is they are the low-cost operator
- Its improbable to gain profits investing in commodity only businesses as they are easily replicable
- If competitors can do the improvements the company did, the company does not have a competitive advantage and should not be investing
- DO NOT confuse cheap with a good deal! Always ask why a company is so cheap, then decide to invest
- Invest in fast changing industries only if you can analyze effectively and the industry as a whole will have the most cash in the future.
    - Solve this problem by investing in index funds of that industry (TECL)
- A high growth rate must self destruct
- Degree of difficulty of analysis does not provide a higher scorecard for investors

**Principles** 
- List extracted business, investing, or life principles from the chapter. These should be generalizable and actionable.
**Connections**
- Links to other ideas, disciplines, or books this chapter reminds you of

**Key Takeaway**
One sentence: the single most important thing from this chapter.

---

Chapter text:
{chapter_text}
"""
 
CHAPTERS_DIR = "chapters"
NOTES_DIR = "notes"
 
for pdf_file in Path(CHAPTERS_DIR).rglob("*.pdf"):
    book_name = pdf_file.parent.name
    notes_file = Path(NOTES_DIR) / book_name / f"{pdf_file.stem}.md"
    notes_file.parent.mkdir(parents=True, exist_ok=True)

    if notes_file.exists():
        print(f"Skipping (done): {pdf_file.name}")
        continue

    print(f"Processing: {pdf_file.name}")
    text = ""
    with pdfplumber.open(pdf_file) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""

    response = client.chat.completions.create(
        model="kimi-k2.6",
        messages=[{"role": "user", "content": NOTE_PROMPT.format(chapter_text=text)}],
        temperature=1,
    )

    notes_file.write_text(response.choices[0].message.content, encoding="utf-8")
    print(f"Saved: {notes_file}")
    time.sleep(1)
