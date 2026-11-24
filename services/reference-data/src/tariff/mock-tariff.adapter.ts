import {
  UAT004_TARIFF_COMMUNITY_ID,
  type Tariff,
  type TariffPort,
} from "./tariff.port.js";
import { tariffCovers } from "./tariff-window.js";

const UAT004_TARIFF: Tariff = {
  tariffId: "tariff-uat004-2026",
  communityId: UAT004_TARIFF_COMMUNITY_ID,
  currency: "EUR",
  validFrom: "2026-01-01",
  validUntil: null,
  gridFeePerKWh: "0.0450",
  levyPerKWh: "0.0100",
  taxPerKWh: "0.0050",
  source: "mock",
};

/** REQ-004 — single UAT-004 fixture tariff (mock path). */
export class MockTariffAdapter implements TariffPort {
  async getTariff(communityId: string, at: string): Promise<Tariff | null> {
    if (communityId !== UAT004_TARIFF.communityId) return null;
    if (!tariffCovers(UAT004_TARIFF, at)) return null;
    return { ...UAT004_TARIFF };
  }
}
