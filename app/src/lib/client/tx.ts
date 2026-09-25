"use client";
// Client-side transaction assembly + signing. The server returns UNSIGNED instructions; the
// wallet (self-custody) signs + sends. Both wire shapes (kit-native borrow/repay, web3 vault)
// reduce to programId + account metas + data — normalized here into web3.js instructions.
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { SerializedKitIx, SerializedWeb3Ix } from "../types";

// kit account roles: 0 readonly, 1 writable, 2 readonlySigner, 3 writableSigner.
function kitRole(role: number): { isSigner: boolean; isWritable: boolean } {
  return {
    isWritable: role === 1 || role === 3,
    isSigner: role === 2 || role === 3,
  };
}

function fromKit(ix: SerializedKitIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.address),
      ...kitRole(a.role),
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

function fromWeb3(ix: SerializedWeb3Ix): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

export function deserializeKit(ixs: SerializedKitIx[]): TransactionInstruction[] {
  return ixs.map(fromKit);
}
export function deserializeWeb3(ixs: SerializedWeb3Ix[]): TransactionInstruction[] {
  return ixs.map(fromWeb3);
}

// Assemble a legacy transaction, have the connected wallet sign + send it, return the signature.
export async function signAndSend(
  connection: Connection,
  feePayer: PublicKey,
  ixs: TransactionInstruction[],
  sendTransaction: (
    tx: Transaction,
    connection: Connection
  ) => Promise<string>
): Promise<string> {
  const tx = new Transaction();
  tx.feePayer = feePayer;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  ixs.forEach((ix) => tx.add(ix));
  return sendTransaction(tx, connection);
}
