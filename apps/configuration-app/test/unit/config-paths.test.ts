import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../server/config";

const legacyData = fileURLToPath(new URL("../../../../backend_butler/.data", import.meta.url));

describe("configuration paths after moving application source", () => {
  it("keeps development state at the previous repository-root location", () => {
    const config = loadConfig({});
    expect(config.dataDir).toBe(legacyData);
    expect(config.configDir).toBe(`${legacyData}/config`);
  });

  it("keeps explicit deployment paths authoritative", () => {
    const config = loadConfig({ DATA_DIR: "/tmp/custom-data", CONFIG_DIR: "/tmp/custom-config" });
    expect(config.dataDir).toBe("/tmp/custom-data");
    expect(config.configDir).toBe("/tmp/custom-config");
  });

  it("keeps Supervisor storage mounts unchanged", () => {
    const config = loadConfig({ SUPERVISOR_TOKEN: "synthetic-test-token" });
    expect(config.dataDir).toBe("/data");
    expect(config.configDir).toBe("/config");
  });
});
