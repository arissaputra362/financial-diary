/*
  WalletService (T-009 / F6, AC-F6-1, AC-F6-2, AC-F6-3, AC-F6-11, AC-F6-12).

  Business rules for wallet lifecycle live here, not in the route handler:
  visibility (A-38) is applied by the repository, while edit/archive/restore
  permission (A-43/C-4/C-22) and the opening-balance lock (A-42/C-21) are
  enforced in this service inside a wallet-row-locked transaction. `scope` is
  never mutable here (C-31): the update input has no scope field.
*/

import { forbidden, notFound, openingBalanceLocked } from "../errors";
import type { LedgerRepositories, WalletActor, WalletRecord } from "../repositories/ledger";
import type { CreateWalletInput, UpdateWalletInput } from "../contracts/wallets";
import type { WalletCardDTO, WalletDTO } from "@/types/api";
import { computeRequestHash, IdempotencyService } from "./idempotency";
import {
  resolveWalletInstitution,
  toWalletInstitutionDTO,
  toWalletInstitutionSummaryDTO,
} from "./institution";
import type { LedgerTransaction, ServiceResult } from "./types";

const WALLETS_PATH = "/api/wallets";

/** Any APPROVED member may edit SHARING name/purpose; PERSONAL only its owner. */
export function canEditWallet(wallet: WalletRecord, actor: WalletActor): boolean {
  if (wallet.scope === "PERSONAL") return wallet.createdByUserId === actor.userId;
  return true;
}

/** Archive/restore: SHARING = creator or Owner; PERSONAL = owner (A-43/C-4/C-22). */
export function canArchiveWallet(wallet: WalletRecord, actor: WalletActor): boolean {
  if (wallet.scope === "PERSONAL") return wallet.createdByUserId === actor.userId;
  return wallet.createdByUserId === actor.userId || actor.role === "OWNER";
}

export function toWalletDTO(
  wallet: WalletRecord,
  balanceMinor: number,
  openingBalanceLocked: boolean,
  actor: WalletActor,
): WalletDTO {
  return {
    id: wallet.id,
    name: wallet.name,
    purpose: wallet.purpose,
    scope: wallet.scope,
    openingBalanceMinor: wallet.openingBalanceMinor,
    balanceMinor,
    archivedAt: wallet.archivedAt ? wallet.archivedAt.toISOString() : null,
    createdBy:
      wallet.scope === "SHARING"
        ? { id: wallet.createdByUserId, displayName: wallet.createdByDisplayName ?? "" }
        : null,
    canEdit: canEditWallet(wallet, actor),
    canArchive: canArchiveWallet(wallet, actor),
    canRestore: canArchiveWallet(wallet, actor),
    openingBalanceLocked,
    institution: toWalletInstitutionDTO(actor, wallet),
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export function toWalletCardDTO(
  wallet: WalletRecord,
  balanceMinor: number,
  actor: WalletActor,
): WalletCardDTO {
  return {
    id: wallet.id,
    name: wallet.name,
    purpose: wallet.purpose,
    scope: wallet.scope,
    balanceMinor,
    archivedAt: wallet.archivedAt ? wallet.archivedAt.toISOString() : null,
    canEdit: canEditWallet(wallet, actor),
    canArchive: canArchiveWallet(wallet, actor),
    canRestore: canArchiveWallet(wallet, actor),
    institution: toWalletInstitutionSummaryDTO(wallet),
  };
}

export class WalletService {
  constructor(
    private readonly repos: LedgerRepositories,
    private readonly transaction: LedgerTransaction,
    private readonly idempotency: IdempotencyService,
  ) {}

  create(actor: WalletActor, input: CreateWalletInput, idempotencyKey?: string): Promise<ServiceResult> {
    const run = (repos: LedgerRepositories) => this.persistCreate(repos, actor, input);
    if (idempotencyKey) {
      const hash = computeRequestHash("POST", WALLETS_PATH, {
        name: input.name,
        purpose: input.purpose ?? null,
        scope: input.scope,
        openingBalanceMinor: input.openingBalanceMinor ?? 0,
        institution: input.institution ?? null,
      });
      return this.idempotency.run(actor.userId, idempotencyKey, hash, run);
    }
    return this.transaction(run);
  }

  private async persistCreate(
    repos: LedgerRepositories,
    actor: WalletActor,
    input: CreateWalletInput,
  ): Promise<ServiceResult> {
    /* Resolve inside the same transaction so archive/select cannot interleave. */
    const institution = await resolveWalletInstitution(repos.institution, actor, input.institution);
    const wallet = await repos.wallet.create({
      householdId: actor.householdId,
      createdByUserId: actor.userId,
      scope: input.scope,
      name: input.name,
      purpose: input.purpose ?? null,
      openingBalanceMinor: input.openingBalanceMinor ?? 0,
      ...institution,
    });
    /* A brand new wallet has no rows, so the opening balance is still movable. */
    return { status: 201, body: toWalletDTO(wallet, wallet.openingBalanceMinor, false, actor) };
  }

  async list(actor: WalletActor, view: "active" | "archived" | "all"): Promise<WalletDTO[]> {
    const [wallets, balances] = await Promise.all([
      this.repos.wallet.list(actor, view),
      this.repos.wallet.balances(actor.householdId),
    ]);
    const balanceMap = new Map(balances.map((row) => [row.walletId, row]));
    return wallets.map((wallet) => {
      const entry = balanceMap.get(wallet.id);
      return toWalletDTO(wallet, entry?.balanceMinor ?? wallet.openingBalanceMinor, (entry?.transactionCount ?? 0) > 0, actor);
    });
  }

  async get(actor: WalletActor, id: string): Promise<WalletDTO> {
    const wallet = await this.repos.wallet.findById(actor, id);
    if (!wallet) throw notFound("Dompet tidak ditemukan.");
    const balances = await this.repos.wallet.balances(actor.householdId);
    const entry = balances.find((row) => row.walletId === wallet.id);
    return toWalletDTO(wallet, entry?.balanceMinor ?? wallet.openingBalanceMinor, (entry?.transactionCount ?? 0) > 0, actor);
  }

  /** Active wallets for the carousel (C-11/C-18). */
  async cards(actor: WalletActor): Promise<WalletCardDTO[]> {
    const [wallets, balances] = await Promise.all([
      this.repos.wallet.list(actor, "active"),
      this.repos.wallet.balances(actor.householdId),
    ]);
    const balanceMap = new Map(balances.map((row) => [row.walletId, row.balanceMinor]));
    return wallets.map((wallet) => toWalletCardDTO(wallet, balanceMap.get(wallet.id) ?? wallet.openingBalanceMinor, actor));
  }

  update(actor: WalletActor, id: string, patch: UpdateWalletInput): Promise<ServiceResult> {
    return this.transaction(async (repos) => {
      /* A-42: serialize opening-balance correction against leg inserts. */
      const locked = await repos.wallet.lockWallet(id);
      if (!locked) throw notFound("Dompet tidak ditemukan.");
      const visible = await repos.wallet.findById(actor, id);
      if (!visible) throw notFound("Dompet tidak ditemukan.");
      if (!canEditWallet(visible, actor)) {
        throw forbidden("ACCESS_DENIED", "Kamu tidak punya akses untuk mengubah dompet ini.");
      }
      const changesOpening =
        patch.openingBalanceMinor !== undefined &&
        patch.openingBalanceMinor !== visible.openingBalanceMinor;
      if (changesOpening && (await repos.wallet.hasTransactions(id))) {
        throw openingBalanceLocked();
      }
      /*
        T-011: omitted institution = unchanged (important for a SHARING editor
        preserving another member's label). NONE clears; OFFICIAL/CUSTOM replaces
        and clears the other column atomically.
      */
      const { institution, ...walletPatch } = patch;
      const institutionPatch =
        institution === undefined
          ? {}
          : await resolveWalletInstitution(repos.institution, actor, institution);
      const updated = await repos.wallet.update(actor, id, { ...walletPatch, ...institutionPatch });
      return { status: 200, body: await this.toDTO(repos, actor, updated) };
    });
  }

  archive(actor: WalletActor, id: string): Promise<ServiceResult> {
    return this.setArchived(actor, id, true);
  }

  restore(actor: WalletActor, id: string): Promise<ServiceResult> {
    return this.setArchived(actor, id, false);
  }

  private async setArchived(actor: WalletActor, id: string, archived: boolean): Promise<ServiceResult> {
    const wallet = await this.repos.wallet.findById(actor, id);
    if (!wallet) throw notFound("Dompet tidak ditemukan.");
    if (!canArchiveWallet(wallet, actor)) {
      throw forbidden("ACCESS_DENIED", "Kamu tidak punya akses untuk mengarsipkan dompet ini.");
    }
    const updated = await this.repos.wallet.setArchived(actor, id, archived, actor.userId);
    return {
      status: 200,
      body: await this.toDTO(this.repos, actor, updated),
    };
  }

  /** Balance + opening-lock flag are always server-computed (A-42/A-44). */
  private async toDTO(repos: LedgerRepositories, actor: WalletActor, wallet: WalletRecord): Promise<WalletDTO> {
    const balances = await repos.wallet.balances(actor.householdId);
    const entry = balances.find((row) => row.walletId === wallet.id);
    return toWalletDTO(
      wallet,
      entry?.balanceMinor ?? wallet.openingBalanceMinor,
      (entry?.transactionCount ?? 0) > 0,
      actor,
    );
  }
}
