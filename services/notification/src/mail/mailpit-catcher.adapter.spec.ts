/**
 * UAT-050 — catcher records attachment metadata, not bytes (REQ-039).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MailpitCatcherAdapter } from "./mailpit-catcher.adapter.js";

describe("MailpitCatcherAdapter", () => {
  it("UAT-050 catcher records attachment metadata, not bytes", async () => {
    const catcher = new MailpitCatcherAdapter();
    const content = Buffer.from("%PDF-nine");
    expect(content.byteLength).toBe(9);

    await catcher.send({
      template: "invoice-issued",
      to: "consumer@example.invalid",
      subject: "Invoice SB-66666666-000001",
      body: "invoiceId=inv-1",
      attachments: [
        {
          filename: "SB-66666666-000001.pdf",
          contentType: "application/pdf",
          content,
        },
      ],
    });

    const captured = catcher.captured();
    expect(captured).toHaveLength(1);
    const att = captured[0]?.attachments?.[0];
    expect(att).toEqual({
      filename: "SB-66666666-000001.pdf",
      contentType: "application/pdf",
      byteLength: 9,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    expect(att).not.toHaveProperty("content");
    expect(JSON.stringify(captured[0])).not.toContain("%PDF-nine");
  });
});
