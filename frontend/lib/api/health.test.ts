import { describe, expect, it } from "vitest";

import { getHealth } from "./health";

describe("getHealth", () => {
  it("returns the committed fixture in fixtures mode", async () => {
    const h = await getHealth({ useFixtures: true });
    expect(h.status).toBe("ok");
    expect(h.app_name).toBe("BerthIQ");
    expect(h.version).toBeTruthy();
  });
});
