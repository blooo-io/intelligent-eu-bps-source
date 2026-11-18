import {
  buildOperationPath,
  type PublicOperation,
} from "./public-operations";

export type PublicCallResult = {
  status: number;
  contentType: string;
  text: string;
  blob: Blob | null;
};

/**
 * Call one public operation with the session bearer token (REQ-052).
 * The API decides authorisation; this helper does not hide operations.
 */
export async function callPublicOperation(
  args: {
    apiBaseUrl: string;
    accessToken: string;
    operation: PublicOperation;
    values: Readonly<Record<string, string>>;
    bodyText: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<PublicCallResult | { error: string }> {
  const built = buildOperationPath(args.operation, args.values);
  if ("error" in built) return built;
  const headers: Record<string, string> = {
    Accept: "application/json, application/pdf",
    Authorization: `Bearer ${args.accessToken}`,
  };
  let body: string | undefined;
  if (args.operation.body !== null) {
    headers["Content-Type"] = "application/json";
    body = args.bodyText;
  }
  const res = await fetchImpl(
    `${args.apiBaseUrl.replace(/\/$/, "")}${built.path}`,
    { method: args.operation.method, headers, body },
  );
  const contentType = res.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream")
  ) {
    const blob = await res.blob();
    return {
      status: res.status,
      contentType,
      text: `(binary ${blob.size} bytes)`,
      blob,
    };
  }
  return {
    status: res.status,
    contentType,
    text: await res.text(),
    blob: null,
  };
}
