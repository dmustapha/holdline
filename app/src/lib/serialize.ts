// Instruction serializers. The API returns instructions; the CLIENT assembles + signs them
// (self-custody — the server never signs, never fakes a success).
import type { SerializedKitIx, SerializedWeb3Ix } from "./types";

function toBase64(bytes: ArrayLike<number>): string {
  const buf = Buffer.from(Array.from(bytes));
  return buf.toString("base64");
}

// @solana/kit instruction => wire shape. Kit ix: { programAddress, accounts:[{address, role}], data }.
// Accepts the readonly kit Instruction; accounts may be account-lookup or account metas.
export function serializeKitIx(ix: {
  programAddress: string;
  accounts?: readonly { address: string; role: number }[];
  data?: ArrayLike<number>;
}): SerializedKitIx {
  return {
    programAddress: String(ix.programAddress),
    accounts: (ix.accounts ?? []).map((a) => ({
      address: String(a.address),
      role: a.role,
    })),
    data: ix.data ? toBase64(ix.data) : "",
  };
}

// @solana/web3.js TransactionInstruction => wire shape (Anchor vault path).
export function serializeWeb3Ix(ix: {
  programId: { toBase58(): string };
  keys: { pubkey: { toBase58(): string }; isSigner: boolean; isWritable: boolean }[];
  data: Uint8Array | Buffer;
}): SerializedWeb3Ix {
  return {
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: toBase64(ix.data),
  };
}
