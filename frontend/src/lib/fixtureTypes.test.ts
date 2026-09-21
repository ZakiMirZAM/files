// The raw captures type-checked against the types the app renders them with.
//
// The .ts fixtures are read through `as unknown as ConnectionsData`, which
// silences exactly the mismatch worth catching. These three are the untouched
// JSON the backend actually returned, and they are assigned to the typed shape
// here, so a field that turns null, changes type or disappears breaks `tsc`
// rather than a page.

import { describe, it, expect } from "vitest";
import type { ConnectionsData } from "./connectionsTypes";

import nvdaRaw from "./__fixtures__/nvda_raw.json";
import semiconductorsRaw from "./__fixtures__/semiconductors_raw.json";
import energyRaw from "./__fixtures__/energy_raw.json";

import { nvdaFixture } from "./__fixtures__/nvda";
import { jpmFixture } from "./__fixtures__/jpm";
import { tsmFixture } from "./__fixtures__/tsm";
import { aaplFixture } from "./__fixtures__/aapl";
import { rivnFixture } from "./__fixtures__/rivn";
import { byndFixture } from "./__fixtures__/bynd";
import { luluFixture } from "./__fixtures__/lulu";
import { semiconductorsFixture } from "./__fixtures__/semiconductors";
import { energyFixture } from "./__fixtures__/energy";

// The assignment is the assertion: if the live payload stops fitting the type,
// this file stops compiling.
const NVDA: ConnectionsData = nvdaRaw;
const SEMICONDUCTORS: ConnectionsData = semiconductorsRaw;
const ENERGY: ConnectionsData = energyRaw;

/** Every saved payload, so a fixture cannot rot unnoticed once the builders
 *  that used to read them are gone. */
const ALL: [string, ConnectionsData][] = [
  ["nvda", nvdaFixture as unknown as ConnectionsData],
  ["jpm", jpmFixture as unknown as ConnectionsData],
  ["tsm", tsmFixture as unknown as ConnectionsData],
  ["aapl", aaplFixture as unknown as ConnectionsData],
  ["rivn", rivnFixture as unknown as ConnectionsData],
  ["bynd", byndFixture as unknown as ConnectionsData],
  ["lulu", luluFixture as unknown as ConnectionsData],
  ["semis", semiconductorsFixture as unknown as ConnectionsData],
  ["energy", energyFixture as unknown as ConnectionsData],
];

describe("the raw captures fit the types the app renders them with", () => {
  it("every saved payload still carries an economy block", () => {
    for (const [name, data] of ALL) {
      expect(data.economy, name).toBeTruthy();
    }
  });

  it("keeps a company payload complete enough to render", () => {
    expect(NVDA.company?.ticker).toBe("NVDA");
    expect(NVDA.economy?.tenYearYield?.value).toBeTypeOf("number");
    expect(NVDA.exposures?.length).toBeGreaterThan(0);
  });

  it("keeps the converted debt fields, which the dollar line depends on", () => {
    // Printing a New Taiwan dollar figure behind a dollar sign overstated one
    // company's debt about thirtyfold, so these three must stay present.
    expect(NVDA.company?.reportingCurrency).toBe("USD");
    expect(NVDA.company?.totalDebtUsd).toBeTypeOf("number");
    expect(NVDA.company?.interestPerPointUsd).toBeTypeOf("number");
  });

  it("keeps an industry payload with its sector shares", () => {
    expect(SEMICONDUCTORS.industry?.name).toBe("Semiconductors");
    expect(SEMICONDUCTORS.industry?.shareOfSectorProfit).toBeTypeOf("number");
  });

  it("keeps a sector payload with no industry or company block", () => {
    expect(ENERGY.sector?.name).toBe("Energy");
    expect(ENERGY.industry).toBeNull();
    expect(ENERGY.company).toBeNull();
  });
});
