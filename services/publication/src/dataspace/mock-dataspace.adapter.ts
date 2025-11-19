import { Injectable } from "@nestjs/common";
import {
  createMockDataSpace,
  type DataSpacePort,
  type DataSpaceTopic,
  type PublishResult,
} from "@intelligent/mocks";

/** V1 P-DS adapter — AC-15 schema-validating mock (NFR-017 deferred). */
@Injectable()
export class MockDataspaceAdapter implements DataSpacePort {
  private readonly inner = createMockDataSpace();

  publish(topic: DataSpaceTopic, message: unknown): PublishResult {
    return this.inner.publish(topic, message);
  }

  purgeCache(before: string): number {
    return this.inner.purgeCache(before);
  }

  recorded() {
    return this.inner.recorded();
  }
}
