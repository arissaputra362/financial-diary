import type { Db } from "./types";
import { notFound } from "../errors";

/*
  Institution repositories (T-011 / A-52..A-56).

  Two deliberately separate scopes:
  - `bank_institution` is global and read-only for users; only the controlled
    seed writes it.
  - `user_custom_institution` is private per user. Every custom query includes
    `user_id` in the WHERE clause, never a post-fetch filter.

  Wallet reads join the custom row WITHOUT an `archived_at` filter so an old
  wallet keeps rendering its label after the entry is archived (A-54).
*/

export interface BankInstitutionRecord {
  id: string;
  displayName: string;
  normalizedName: string;
  source: string;
  sourceUrl: string;
  /** Publication period (`YYYY-MM`); never a synthesized day. */
  sourcePeriod: string;
  sourceRef: string | null;
  seedVersion: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCustomInstitutionRecord {
  id: string;
  userId: string;
  displayName: string;
  normalizedName: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstitutionRepository {
  listOfficialActive(query?: string): Promise<BankInstitutionRecord[]>;
  findOfficialById(id: string): Promise<BankInstitutionRecord | null>;
  findOfficialByNormalized(normalized: string): Promise<BankInstitutionRecord | null>;
  listCustomByUser(
    userId: string,
    view: "active" | "archived",
  ): Promise<UserCustomInstitutionRecord[]>;
  findCustomByIdForUser(userId: string, id: string): Promise<UserCustomInstitutionRecord | null>;
  findCustomByNormalized(
    userId: string,
    normalized: string,
    view: "active" | "archived",
  ): Promise<UserCustomInstitutionRecord | null>;
  createCustom(
    userId: string,
    data: { displayName: string; normalizedName: string },
  ): Promise<UserCustomInstitutionRecord>;
  reactivateCustom(userId: string, id: string): Promise<UserCustomInstitutionRecord>;
  setCustomArchived(
    userId: string,
    id: string,
    archived: boolean,
  ): Promise<UserCustomInstitutionRecord>;
}

export function createInstitutionRepository(db: Db): InstitutionRepository {
  return {
    async listOfficialActive(query) {
      return db.bankInstitution.findMany({
        where: {
          isActive: true,
          ...(query ? { normalizedName: { contains: query } } : {}),
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
      });
    },
    async findOfficialById(id) {
      return db.bankInstitution.findUnique({ where: { id } });
    },
    async findOfficialByNormalized(normalized) {
      return db.bankInstitution.findFirst({
        where: { normalizedName: normalized, isActive: true },
      });
    },
    async listCustomByUser(userId, view) {
      return db.userCustomInstitution.findMany({
        where: {
          userId,
          archivedAt: view === "active" ? null : { not: null },
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
      });
    },
    async findCustomByIdForUser(userId, id) {
      /* Ownership is part of the query: a foreign id resolves to null -> 404. */
      return db.userCustomInstitution.findFirst({ where: { id, userId } });
    },
    async findCustomByNormalized(userId, normalized, view) {
      return db.userCustomInstitution.findFirst({
        where: {
          userId,
          normalizedName: normalized,
          archivedAt: view === "active" ? null : { not: null },
        },
        /* Re-add reuses the most recently archived row (A-54). */
        orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
      });
    },
    async createCustom(userId, data) {
      return db.userCustomInstitution.create({ data: { userId, ...data } });
    },
    async reactivateCustom(userId, id) {
      const result = await db.userCustomInstitution.updateMany({
        where: { id, userId },
        data: { archivedAt: null },
      });
      if (result.count === 0) throw notFound("Bank atau penyedia tidak ditemukan.");
      return db.userCustomInstitution.findUniqueOrThrow({ where: { id } });
    },
    async setCustomArchived(userId, id, archived) {
      const result = await db.userCustomInstitution.updateMany({
        where: { id, userId },
        data: { archivedAt: archived ? new Date() : null },
      });
      if (result.count === 0) throw notFound("Bank atau penyedia tidak ditemukan.");
      return db.userCustomInstitution.findUniqueOrThrow({ where: { id } });
    },
  };
}

/** Prisma P2002 (unique constraint) raised by the partial active-name index. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
