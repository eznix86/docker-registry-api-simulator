import { createHash } from "crypto";

export function computeDigest(content: string): string {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}
