import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if Apple already exists
    const existingApple = await ctx.db
      .query("companies")
      .withIndex("by_symbol", (q) => q.eq("symbol", "AAPL"))
      .first();
    
    if (existingApple) {
      return existingApple._id; // Return existing company ID
    }

    // Create Apple as demo company
    const appleId = await ctx.db.insert("companies", {
      symbol: "AAPL",
      name: "Apple Inc.",
      sector: "Technology",
      industry: "Consumer Electronics",
      description: "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.",
      marketCap: 3000000000000, // $3T
      employees: 164000,
      founded: 1976,
      headquarters: "Cupertino, California",
    });

    // Economic & Industry Analysis metrics
    const economicMetrics = [
      {
        name: "GDP Growth Impact",
        value: "Moderate Sensitivity",
        explanation: "Apple's revenue shows moderate correlation with global GDP growth, as consumer discretionary spending affects iPhone and Mac sales during economic downturns.",
        industryContext: "Consumer electronics companies typically see 15-25% revenue volatility during economic cycles, with Apple showing lower volatility due to brand loyalty.",
        macroContext: "Current global GDP growth of 3.2% supports steady demand for premium consumer electronics, though rising interest rates may pressure consumer spending.",
        trendInterpretation: "Apple's diversification into services (30% of revenue) provides stability during hardware cycles and economic uncertainty.",
        keyInsights: [
          "Services revenue provides counter-cyclical stability",
          "Premium positioning maintains margins during downturns",
          "Global supply chain exposed to geopolitical risks"
        ],
        order: 1,
      },
      {
        name: "Market Share",
        value: 23.4,
        unit: "%",
        explanation: "Apple holds 23.4% of the global smartphone market by revenue, demonstrating strong competitive positioning in the premium segment.",
        industryContext: "The smartphone industry is dominated by Apple and Samsung, with Apple capturing 75% of premium segment profits despite lower unit market share.",
        macroContext: "Smartphone market maturity in developed countries shifts focus to replacement cycles and emerging market penetration.",
        trendInterpretation: "Apple's market share has remained stable while expanding services ecosystem increases customer lifetime value.",
        keyInsights: [
          "Premium market dominance with 75% of industry profits",
          "Services ecosystem creates switching costs",
          "Emerging markets represent growth opportunity"
        ],
        order: 2,
      }
    ];

    for (const metric of economicMetrics) {
      await ctx.db.insert("metrics", {
        companyId: appleId,
        category: "economic",
        ...metric,
      });
    }

    // Quantitative metrics - updated with latest figures
    const quantitativeMetrics = [
      {
        name: "Revenue Growth",
        value: 8.5,
        unit: "%",
        explanation: "Apple's revenue reached $416.2B in 2025, representing strong growth driven by iPhone 16 sales, AI services expansion, and continued services momentum.",
        industryContext: "Technology hardware companies average 5-7% revenue growth, with Apple outperforming due to premium positioning and services mix expansion.",
        macroContext: "Revenue growth accelerated despite global economic headwinds, demonstrating resilience in premium consumer electronics demand.",
        trendInterpretation: "Consistent growth trajectory reflects successful product innovation cycles and expanding services ecosystem driving customer lifetime value.",
        keyInsights: [
          "Services revenue growing at 18% annually with AI integration",
          "iPhone revenue benefiting from AI-driven upgrade cycles",
          "Geographic diversification reducing regional dependency"
        ],
        order: 1,
      },
      {
        name: "Gross Margin",
        value: 46.9,
        unit: "%",
        explanation: "Apple achieved a gross margin of 46.9% in 2025, the highest in company history, driven by premium AI features, services growth, and operational efficiency.",
        industryContext: "Consumer electronics companies typically achieve 20-30% gross margins, with Apple's premium positioning and services mix enabling industry-leading profitability.",
        macroContext: "Margin expansion despite supply chain pressures demonstrates exceptional pricing power and successful product mix optimization.",
        trendInterpretation: "Steady margin improvement from 38.2% in 2020 to 46.9% in 2025 reflects successful transition to higher-margin services and premium positioning.",
        keyInsights: [
          "Services margins exceed 75% boosting overall profitability",
          "AI features command premium pricing without proportional cost increases",
          "Vertical integration and scale advantages driving efficiency gains"
        ],
        order: 2,
      },
      {
        name: "Return on Equity",
        value: 147.4,
        unit: "%",
        explanation: "Apple's ROE of 147% reflects exceptional profitability and efficient capital structure, enhanced by share buyback programs reducing equity base.",
        industryContext: "Technology companies average 15-25% ROE, with Apple's exceptional performance driven by capital-light business model and aggressive capital returns.",
        macroContext: "High ROE sustainability depends on maintaining competitive advantages and efficient capital allocation in maturing markets.",
        trendInterpretation: "ROE has increased from 45% in 2019 due to aggressive share repurchases reducing equity base while maintaining strong earnings growth.",
        keyInsights: [
          "Share buybacks artificially inflate ROE metrics",
          "Underlying business generates 25-30% normalized ROE",
          "Capital efficiency reflects asset-light services growth model"
        ],
        order: 3,
      }
    ];

    for (const metric of quantitativeMetrics) {
      await ctx.db.insert("metrics", {
        companyId: appleId,
        category: "quantitative",
        ...metric,
      });
    }

    // Historical data for charts - using real Apple data
    const revenueData = [
      { year: 2020, value: 274.5 },
      { year: 2021, value: 365.8 },
      { year: 2022, value: 394.3 },
      { year: 2023, value: 383.3 },
      { year: 2024, value: 391.0 },
      { year: 2025, value: 416.2 },
    ];

    const marginData = [
      { year: 2020, value: 38.2 },
      { year: 2021, value: 41.8 },
      { year: 2022, value: 43.3 },
      { year: 2023, value: 44.1 },
      { year: 2024, value: 46.2 },
      { year: 2025, value: 46.9 },
    ];

    const roeData = [
      { year: 2020, value: 73.7 },
      { year: 2021, value: 147.4 },
      { year: 2022, value: 175.1 },
      { year: 2023, value: 147.4 },
      { year: 2024, value: 160.8 },
      { year: 2025, value: 147.4 },
    ];

    for (const data of revenueData) {
      await ctx.db.insert("historicalData", {
        companyId: appleId,
        metricName: "Revenue Growth",
        year: data.year,
        value: data.value,
      });
    }

    for (const data of marginData) {
      await ctx.db.insert("historicalData", {
        companyId: appleId,
        metricName: "Gross Margin",
        year: data.year,
        value: data.value,
      });
    }

    for (const data of roeData) {
      await ctx.db.insert("historicalData", {
        companyId: appleId,
        metricName: "Return on Equity",
        year: data.year,
        value: data.value,
      });
    }

    // Add checkpoints
    await ctx.db.insert("checkpoints", {
      companyId: appleId,
      category: "economic",
      question: "What makes Apple less sensitive to economic cycles compared to other consumer electronics companies?",
      options: [
        "Lower manufacturing costs",
        "Services revenue and premium brand loyalty",
        "Higher market share in emerging markets",
        "Better supply chain management"
      ],
      correctAnswer: 1,
      explanation: "Apple's services revenue (30% of total) provides recurring, higher-margin income that's less cyclical than hardware sales. Additionally, premium brand loyalty means customers are less likely to delay purchases during mild economic downturns.",
      order: 1,
    });

    await ctx.db.insert("checkpoints", {
      companyId: appleId,
      category: "quantitative",
      question: "Why is Apple's ROE of 147% potentially misleading when evaluating operational performance?",
      options: [
        "It includes one-time gains from asset sales",
        "Share buybacks have artificially reduced the equity base",
        "The calculation excludes preferred stock dividends",
        "Revenue recognition is accelerated"
      ],
      correctAnswer: 1,
      explanation: "Apple's aggressive share buyback program has significantly reduced shareholders' equity, inflating the ROE calculation. The underlying business generates a more normalized 25-30% ROE, which is still excellent but more realistic for comparison purposes.",
      order: 1,
    });

    return appleId;
  },
});
