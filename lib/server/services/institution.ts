/*
  InstitutionService (T-011 / A-52..A-57).

  Two list scopes stay separate:
  - official catalog: global, read-only, filtered `is_active = true`;
  - private custom list: filtered by the session `userId` in the repository.

  `userId` never comes from the client. Quick Add is persisted independently of
  any wallet: canceling the parent wallet does not roll the entry back (PM
  2026-10-21). Duplicate handling and archive re-activation follow A-54.
*/

import {
  INSTITUTION_NAME_MAX_LENGTH,
  normalizeInstitutionName,
} from "@/lib/institution-name";
import type {
  BankInstitutionDTO,
  InstitutionListDTO,
  UserCustomInstitutionDTO,
  WalletInstitutionDTO,
  WalletInstitutionSummaryDTO,
} from "@/types/api";
import type { WalletInstitutionInput } from "../contracts/institutions";
import {
  conflict,
  institutionAlreadyExists,
  institutionUnavailable,
  notFound,
  unprocessable,
} from "../errors";
import type {
  BankInstitutionRecord,
  InstitutionRepository,
  UserCustomInstitutionRecord,
} from "../repositories/institutions";
import { isUniqueViolation } from "../repositories/institutions";
import type {
  LedgerRepositories,
  WalletActor,
  WalletInstitutionRecord,
  WalletRecord,
} from "../repositories/ledger";
import { computeRequestHash, IdempotencyService } from "./idempotency";
import type { LedgerTransaction, ServiceResult } from "./types";

const CUSTOM_INSTITUTION_PATH = "/api/institutions/custom";

export function toBankInstitutionDTO(row: BankInstitutionRecord): BankInstitutionDTO {
  return { id: row.id, name: row.displayName };
}

export function toCustomInstitutionDTO(row: UserCustomInstitutionRecord): UserCustomInstitutionDTO {
  return {
    id: row.id,
    name: row.displayName,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Wallet label DTO. A custom id is returned only to its owner; other authorized
 * wallet readers receive the name with `id: null` (A-56). The wallet join never
 * filters archived/inactive rows, so historical labels keep rendering.
 */
export function toWalletInstitutionDTO(
  actor: WalletActor,
  wallet: Pick<WalletRecord, "institution">,
): WalletInstitutionDTO | null {
  const institution = wallet.institution;
  if (!institution) return null;
  if (institution.kind === "CUSTOM" && institution.ownerUserId !== actor.userId) {
    return { kind: "CUSTOM", id: null, name: institution.name };
  }
  return { kind: institution.kind, id: institution.id, name: institution.name };
}

/** Card-safe projection: never carries any institution id. */
export function toWalletInstitutionSummaryDTO(
  wallet: Pick<WalletRecord, "institution">,
): WalletInstitutionSummaryDTO | null {
  const institution: WalletInstitutionRecord | null | undefined = wallet.institution;
  if (!institution) return null;
  return { kind: institution.kind, name: institution.name };
}

/**
 * Resolves a wallet institution selection inside the caller's transaction.
 * `undefined`/`NONE` = both null (manual); OFFICIAL/CUSTOM = exactly one id.
 * A foreign custom id returns a generic 404; an archived one is 422.
 */
export async function resolveWalletInstitution(
  repo: InstitutionRepository,
  actor: WalletActor,
  selection: WalletInstitutionInput | undefined,
): Promise<{ officialInstitutionId: string | null; customInstitutionId: string | null }> {
  if (!selection || selection.kind === "NONE") {
    return { officialInstitutionId: null, customInstitutionId: null };
  }

  if (selection.kind === "OFFICIAL") {
    const bank = await repo.findOfficialById(selection.id);
    if (!bank || !bank.isActive) {
      throw institutionUnavailable("Bank ini tidak tersedia. Pilih bank lain.");
    }
    return { officialInstitutionId: bank.id, customInstitutionId: null };
  }

  /* Ownership predicate lives in the repository query, not a post-fetch check. */
  const custom = await repo.findCustomByIdForUser(actor.userId, selection.id);
  if (!custom) throw notFound("Bank atau penyedia tidak ditemukan.");
  if (custom.archivedAt !== null) {
    throw institutionUnavailable("Bank atau penyedia ini sudah diarsipkan. Pilih yang lain.");
  }
  return { officialInstitutionId: null, customInstitutionId: custom.id };
}

export class InstitutionService {
  constructor(
    private readonly repos: LedgerRepositories,
    private readonly transaction: LedgerTransaction,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(actor: WalletActor, query?: string): Promise<InstitutionListDTO> {
    const normalizedQuery = query ? normalizeInstitutionName(query) : "";
    const [official, custom, archivedCustom] = await Promise.all([
      this.repos.institution.listOfficialActive(normalizedQuery || undefined),
      this.repos.institution.listCustomByUser(actor.userId, "active"),
      this.repos.institution.listCustomByUser(actor.userId, "archived"),
    ]);
    const filter = (rows: UserCustomInstitutionRecord[]) =>
      normalizedQuery ? rows.filter((row) => row.normalizedName.includes(normalizedQuery)) : rows;
    return {
      official: official.map(toBankInstitutionDTO),
      custom: filter(custom).map(toCustomInstitutionDTO),
      archivedCustom: filter(archivedCustom).map(toCustomInstitutionDTO),
    };
  }

  quickAdd(
    actor: WalletActor,
    name: string,
    idempotencyKey?: string,
  ): Promise<ServiceResult> {
    const displayName = normalizeDisplayName(name);
    const normalizedName = normalizeInstitutionName(displayName);
    if (normalizedName.length > INSTITUTION_NAME_MAX_LENGTH) {
      throw unprocessable({
        name: [`Nama bank atau penyedia maksimal ${INSTITUTION_NAME_MAX_LENGTH} karakter.`],
      });
    }
    const run = (repos: LedgerRepositories) =>
      this.persistQuickAdd(repos, actor, displayName, normalizedName);

    if (idempotencyKey) {
      /* Normalized name: whitespace/case variants are the same business request. */
      const hash = computeRequestHash("POST", CUSTOM_INSTITUTION_PATH, { name: normalizedName });
      return this.idempotency.run(actor.userId, idempotencyKey, hash, run);
    }
    return this.transaction(run);
  }

  private async persistQuickAdd(
    repos: LedgerRepositories,
    actor: WalletActor,
    displayName: string,
    normalizedName: string,
  ): Promise<ServiceResult> {
    const official = await repos.institution.findOfficialByNormalized(normalizedName);
    if (official) {
      throw institutionAlreadyExists({
        kind: "OFFICIAL",
        id: official.id,
        name: official.displayName,
      });
    }

    const active = await repos.institution.findCustomByNormalized(
      actor.userId,
      normalizedName,
      "active",
    );
    if (active) {
      throw institutionAlreadyExists({
        kind: "CUSTOM",
        id: active.id,
        name: active.displayName,
      });
    }

    /* Re-add of an archived name reactivates that row (A-54 / PM 2026-10-21). */
    const archived = await repos.institution.findCustomByNormalized(
      actor.userId,
      normalizedName,
      "archived",
    );
    if (archived) {
      try {
        const reactivated = await repos.institution.reactivateCustom(actor.userId, archived.id);
        return { status: 200, body: toCustomInstitutionDTO(reactivated) };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw await this.activeDuplicate(repos, actor, normalizedName);
      }
    }

    try {
      const created = await repos.institution.createCustom(actor.userId, {
        displayName,
        normalizedName,
      });
      return { status: 201, body: toCustomInstitutionDTO(created) };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      /* Concurrent insert: one wins; the loser is routed to the existing row. */
      throw await this.activeDuplicate(repos, actor, normalizedName);
    }
  }

  private async activeDuplicate(
    repos: LedgerRepositories,
    actor: WalletActor,
    normalizedName: string,
  ): Promise<Error> {
    const active = await repos.institution.findCustomByNormalized(
      actor.userId,
      normalizedName,
      "active",
    );
    if (active) {
      return institutionAlreadyExists({
        kind: "CUSTOM",
        id: active.id,
        name: active.displayName,
      });
    }
    return conflict(
      "INSTITUTION_ALREADY_EXISTS",
      "Nama ini sudah ada. Pilih dari daftar atau gunakan nama lain.",
    );
  }

  async setArchived(
    actor: WalletActor,
    id: string,
    archived: boolean,
  ): Promise<UserCustomInstitutionDTO> {
    const existing = await this.repos.institution.findCustomByIdForUser(actor.userId, id);
    if (!existing) throw notFound("Bank atau penyedia tidak ditemukan.");
    if ((existing.archivedAt !== null) === archived) {
      return toCustomInstitutionDTO(existing);
    }

    /*
      Restoring must not revive a private name that now collides with an ACTIVE
      official row (QA defect: restore bypassed the Quick Add guard). The
      response offers only the public catalog row, never another user's list.
    */
    if (!archived) {
      const official = await this.repos.institution.findOfficialByNormalized(
        existing.normalizedName,
      );
      if (official) {
        throw institutionAlreadyExists({
          kind: "OFFICIAL",
          id: official.id,
          name: official.displayName,
        });
      }
    }

    try {
      const updated = await this.repos.institution.setCustomArchived(actor.userId, id, archived);
      return toCustomInstitutionDTO(updated);
    } catch (error) {
      if (!archived && isUniqueViolation(error)) {
        const active = await this.repos.institution.findCustomByNormalized(
          actor.userId,
          existing.normalizedName,
          "active",
        );
        if (active) {
          throw institutionAlreadyExists({
            kind: "CUSTOM",
            id: active.id,
            name: active.displayName,
          });
        }
      }
      throw error;
    }
  }

  /** Contract parity with the Dev Plan; wallet writes use the same pure resolver. */
  resolveForWalletWrite(
    actor: WalletActor,
    _householdId: string,
    selection?: WalletInstitutionInput,
  ): ReturnType<typeof resolveWalletInstitution> {
    return resolveWalletInstitution(this.repos.institution, actor, selection);
  }

  toWalletInstitutionDTO(
    actor: WalletActor,
    wallet: Pick<WalletRecord, "institution">,
  ): WalletInstitutionDTO | null {
    return toWalletInstitutionDTO(actor, wallet);
  }
}

/** NFKC + trim + collapse whitespace for the display name; service-side guard. */
export function normalizeDisplayName(input: string): string {
  const displayName = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!displayName) {
    throw unprocessable({ name: ["Nama bank atau penyedia belum diisi."] });
  }
  if (displayName.length > INSTITUTION_NAME_MAX_LENGTH) {
    throw unprocessable({
      name: [`Nama bank atau penyedia maksimal ${INSTITUTION_NAME_MAX_LENGTH} karakter.`],
    });
  }
  return displayName;
}
