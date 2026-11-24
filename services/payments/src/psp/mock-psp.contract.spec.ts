/**
 * Contract suite against MockPspAdapter (WS5 Task 5.2 / INT-424).
 * Task 5.3 implements the harness and adapter methods — expected FAIL until then.
 */

import { runPspContractSuite } from "./testing/psp-contract.suite.js";
import type { PspContractHarness } from "./testing/psp-contract.suite.js";

/**
 * TODO(WS5 Task 5.3): build a harness over MockPspAdapter that implements
 * completeKyc / fundBalance / paymentMethod / signedEvent and the four ports.
 */
async function mockHarness(): Promise<PspContractHarness> {
  throw new Error("Task 5.3: MockPspAdapter harness not implemented");
}

runPspContractSuite("MockPspAdapter", async () => mockHarness());
