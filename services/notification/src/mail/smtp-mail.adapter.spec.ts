/**
 * INT-428 Task 2.14 — SMTP adapter + createMailPort (REQ-039, UAT-050, REQ-017).
 */
import { describe, expect, it, vi } from "vitest";
import { MailpitCatcherAdapter } from "./mailpit-catcher.adapter.js";
import { createMailPort, SmtpMailAdapter } from "./smtp-mail.adapter.js";

describe("SmtpMailAdapter", () => {
  it("SmtpMailAdapter passes attachments to the transport", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "smtp-msg-1" });
    const adapter = new SmtpMailAdapter("smtp://mailpit.example:1025", () =>
      ({ sendMail }) as never,
    );

    await adapter.send({
      template: "invoice-issued",
      to: "consumer@example.invalid",
      subject: "Invoice SB-66666666-000001",
      body: "invoiceId=inv-1",
      attachments: [
        {
          filename: "SB-66666666-000001.pdf",
          contentType: "application/pdf",
          content: Buffer.from("%PDF-1.4"),
        },
      ],
    });

    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0]?.[0] as {
      attachments?: Array<{ filename: string }>;
    };
    expect(arg.attachments?.[0]?.filename).toBe("SB-66666666-000001.pdf");

    const captured = adapter.captured();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.messageId).toBe("smtp-msg-1");
    expect(captured[0]?.attachments?.[0]?.filename).toBe(
      "SB-66666666-000001.pdf",
    );
    expect(captured[0]?.attachments?.[0]).not.toHaveProperty("content");
  });
});

describe("createMailPort", () => {
  it("createMailPort selects SMTP when SMTP_URL is set", () => {
    const port = createMailPort({
      SMTP_URL: "smtp://mailpit.mailpit.svc.cluster.local:1025",
    });
    expect(port).toBeInstanceOf(SmtpMailAdapter);
  });

  it("createMailPort uses the in-memory catcher when SMTP_URL is unset", () => {
    const port = createMailPort({});
    expect(port).toBeInstanceOf(MailpitCatcherAdapter);
  });
});
