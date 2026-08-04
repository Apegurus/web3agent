import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { expect } from "vitest";
import { z } from "zod";

export const expectedV4SdkProvenance = {
  gitHead: "ab3a18a62922c0bda493130e53f2c8f6fad59558",
  integrity:
    "sha512-aMsDxVFjnwxjWeX8lXJy+4SRPgllfEU05SJ6CRsiPOeqBMd9RHxvb0RXF4q42wNG/iKoUVg9O2q6s5uoRDXPrQ==",
  name: "@uniswap/v4-sdk",
  version: "2.3.0",
} as const;

export const registryMetadataSchema = z.object({
  dist: z.object({
    integrity: z.string(),
    tarball: z.string().url(),
  }),
  gitHead: z.string(),
});

const tarPackageSchema = z.object({
  name: z.literal(expectedV4SdkProvenance.name),
  version: z.literal(expectedV4SdkProvenance.version),
});

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} did not match the pinned dependency boundary`);
  }
}

function readTarText(archive: Uint8Array, offset: number, length: number): string {
  const field = archive.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return Buffer.from(end === -1 ? field : field.subarray(0, end)).toString("utf8");
}

function readPackageManifestFromTarball(tarball: Uint8Array): unknown {
  const archive = gunzipSync(tarball);
  let headerOffset = 0;

  while (headerOffset + 512 <= archive.length) {
    const name = readTarText(archive, headerOffset, 100);
    if (name.length === 0) {
      break;
    }

    const size = Number.parseInt(readTarText(archive, headerOffset + 124, 12).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("Downloaded npm tarball contains an invalid entry size");
    }

    const contentsOffset = headerOffset + 512;
    const contentsEnd = contentsOffset + size;
    if (contentsEnd > archive.length) {
      throw new Error("Downloaded npm tarball is truncated");
    }

    if (name === "package/package.json") {
      return JSON.parse(
        Buffer.from(archive.subarray(contentsOffset, contentsEnd)).toString("utf8")
      );
    }

    headerOffset = contentsOffset + Math.ceil(size / 512) * 512;
  }

  throw new Error("Downloaded npm tarball does not contain package/package.json");
}

export function verifyDownloadedTarball(
  metadata: z.infer<typeof registryMetadataSchema>,
  tarball: Uint8Array,
  lockfile: string
): void {
  assertEqual(metadata.dist.integrity, expectedV4SdkProvenance.integrity, "Registry integrity");
  assertEqual(metadata.gitHead, expectedV4SdkProvenance.gitHead, "Registry gitHead");
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  assertEqual(integrity, metadata.dist.integrity, "Downloaded tarball integrity");
  expect(lockfile).toContain(metadata.dist.integrity);

  const tarPackage = tarPackageSchema.parse(readPackageManifestFromTarball(tarball));
  assertEqual(tarPackage.name, expectedV4SdkProvenance.name, "Downloaded tarball package name");
  assertEqual(
    tarPackage.version,
    expectedV4SdkProvenance.version,
    "Downloaded tarball package version"
  );
}
