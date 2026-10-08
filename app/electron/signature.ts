import * as openpgp from "openpgp";

export interface SigningKey {
  armored: string;
  fingerprint: string;
}

/**
 * Verifies a detached OpenPGP signature over `data` with a pinned key.
 * Throws unless the key matches the pinned fingerprint and the signature is valid.
 */
export async function verifyDetached(
  data: Uint8Array,
  signature: Uint8Array,
  key: SigningKey,
): Promise<void> {
  const verificationKey = await openpgp.readKey({ armoredKey: key.armored });
  if (verificationKey.getFingerprint() !== key.fingerprint.toLowerCase())
    throw new Error("Signing key does not match its pinned fingerprint.");
  const text = Buffer.from(signature).toString("latin1");
  const parsed = text.startsWith("-----BEGIN PGP SIGNATURE-----")
    ? await openpgp.readSignature({ armoredSignature: text })
    : await openpgp.readSignature({ binarySignature: signature });
  const result = await openpgp.verify({
    message: await openpgp.createMessage({ binary: data }),
    signature: parsed,
    verificationKeys: verificationKey,
  });
  const first = result.signatures[0];
  if (!first) throw new Error("The release has no signature.");
  // An invalid signature rejects here.
  await first.verified;
}
