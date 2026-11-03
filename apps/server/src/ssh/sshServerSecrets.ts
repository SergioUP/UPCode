/**
 * Name and storage slots for the credentials a Vault SSH server keeps.
 *
 * A saved server is plain settings; its password or pasted key is not. Those go
 * to the server's secret store under a name derived from the server id, the same
 * way source control hosts keep their tokens, so the settings file and every
 * client only ever carry the redaction marker.
 *
 * @module ssh/sshServerSecrets
 */

/** The secret store entry for one field of one server; stable across releases. */
export function sshServerSecretName(input: {
  readonly id: string;
  readonly field: string;
}): string {
  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
  return `ssh-server-${encode(input.id)}-${encode(input.field)}`;
}
