import { createHash } from "node:crypto";
import type { CapturedMailAttachment } from "../domain/types.js";
import type { MailAttachment } from "./mail.port.js";

/** Record attachment metadata (filename, type, length, sha256) — never raw bytes. */
export function toCapturedAttachments(
  attachments: MailAttachment[] | undefined,
): CapturedMailAttachment[] | undefined {
  if (!attachments?.length) {
    return undefined;
  }
  return attachments.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    byteLength: a.content.byteLength,
    sha256: createHash("sha256").update(a.content).digest("hex"),
  }));
}
