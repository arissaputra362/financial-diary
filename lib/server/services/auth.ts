/*
  AuthService (feat-auth-approval, ADR-002, ADR-004, ADR-006).

  Custom auth: a jose JWT carrying `sid` is paired with a revocable session row.
  Role and household are never trusted from the token; they are read from the DB
  on every revalidation. Owner bootstrap and invite redeem run inside one
  interactive transaction so a failed redeem never leaves an orphan user.
*/

import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { SignupInput } from "../contracts/auth";
import { badRequest, conflict, unauthorized } from "../errors";
import type {
  HouseholdRepository,
  InviteRepository,
  MembershipEventRepository,
  MembershipRepository,
  MembershipRecord,
  SessionRepository,
  UserRepository,
} from "../repositories/auth";

/* ── Types ──────────────────────────────────────────────────────── */

export type AuthStateDTO = {
  user: { id: string; email: string; displayName: string };
  household: { id: string; name: string } | null;
  role: string;
  status: string;
  nextAction: "OPEN_HOME" | "WAIT_FOR_APPROVAL" | "SIGN_IN_AGAIN";
};

export type AuthOperationResult = { state: AuthStateDTO; sessionId: string };

export type RevalidatedSession = {
  state: AuthStateDTO;
  userId: string;
  householdId: string | null;
  role: string;
  sessionId: string;
};

/** The six auth-domain repositories, wired to one Prisma client or transaction. */
export type AuthRepositories = {
  user: UserRepository;
  household: HouseholdRepository;
  membership: MembershipRepository;
  invite: InviteRepository;
  session: SessionRepository;
  membershipEvent: MembershipEventRepository;
};

/**
 * Runs `fn` with a consistent set of repositories. The production wiring wraps
 * this in `prisma.$transaction`; unit tests pass a pass-through runner.
 */
export type AuthTransaction = <T>(fn: (repos: AuthRepositories) => Promise<T>) => Promise<T>;

/* ── Constants ──────────────────────────────────────────────────── */

export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const TOKEN_VERSION = "v1";

/*
  AC-F1-3: every invite failure returns an identical 400 INVALID_INVITE body.
  Wrong, expired, revoked, and already-redeemed codes must be indistinguishable.
*/
const INVALID_INVITE = { code: "INVALID_INVITE", message: "Kode undangan tidak valid atau sudah kedaluwarsa." } as const;

const PASSWORD_COST = 10;

/* ── Service ────────────────────────────────────────────────────── */

export class AuthService {
  constructor(
    private readonly repos: AuthRepositories,
    private readonly transaction: AuthTransaction,
  ) {}

  /** Owner bootstrap (no invite) or invite redeem, both in one transaction. */
  async signup(input: SignupInput): Promise<AuthOperationResult> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.repos.user.findByEmail(email);
    if (existing) throw conflict("EMAIL_TAKEN", "Alamat email sudah terdaftar.");

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_COST);

    if (input.inviteCode) {
      return this.signupWithInvite(email, input.displayName.trim(), passwordHash, input.inviteCode);
    }
    return this.signupOwner(email, input.displayName.trim(), passwordHash);
  }

  async login(rawEmail: string, password: string): Promise<AuthOperationResult> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.repos.user.findByEmail(email);

    /*
      Constraint Bisnis: never reveal whether the email exists. Verify against a
      real hash check only when the user exists, and return one uniform 401.
    */
    const passwordValid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !passwordValid) throw unauthorized("Email atau kata sandi salah.");

    const membership = await this.repos.membership.findLatestByUserId(user.id);
    if (!membership) throw unauthorized("Akun ini belum terhubung ke keluarga mana pun.");

    const household = await this.repos.household.findById(membership.householdId);

    // Opportunistic purge: no worker in the MVP (dev plan §Async & Queue).
    await this.repos.session.purgeExpired();

    // Anti session fixation: every login mints a brand-new session id.
    const sessionId = await this.createSession(this.repos, user.id);

    return {
      state: this.stateFor(
        { id: user.id, email: user.email, displayName: user.displayName },
        household,
        membership,
      ),
      sessionId,
    };
  }

  async logout(sid: string): Promise<void> {
    await this.repos.session.revoke(sid);
  }

  async me(userId: string): Promise<AuthStateDTO> {
    const user = await this.repos.user.findById(userId);
    const membership = user ? await this.repos.membership.findLatestByUserId(user.id) : null;
    if (!user || !membership) throw unauthorized("Akun ini belum terhubung ke keluarga mana pun.");
    const household = await this.repos.household.findById(membership.householdId);
    return this.stateFor(
      { id: user.id, email: user.email, displayName: user.displayName },
      household,
      membership,
    );
  }

  /**
   * Full per-request revalidation (ADR-002): load the active session by `sid`,
   * then the membership from the DB. Membership status is never cached in the
   * JWT, so approval/revoke applies from the next request. Touches the session
   * (sliding) and purges expired rows opportunistically.
   */
  async revalidate(sid: string): Promise<RevalidatedSession> {
    const session = await this.repos.session.findActiveById(sid);
    if (!session) throw unauthorized("Sesi Anda sudah berakhir. Silakan masuk kembali.");

    const user = await this.repos.user.findById(session.userId);
    const membership = user ? await this.repos.membership.findLatestByUserId(user.id) : null;
    if (!user || !membership) throw unauthorized("Sesi Anda sudah berakhir. Silakan masuk kembali.");

    if (session.lastSeenAt) {
      await this.repos.session.touch(sid, session.lastSeenAt);
    } else {
      await this.repos.session.touch(sid);
    }

    const household = await this.repos.household.findById(membership.householdId);

    return {
      state: this.stateFor(
        { id: user.id, email: user.email, displayName: user.displayName },
        household,
        membership,
      ),
      userId: user.id,
      householdId: household?.id ?? null,
      role: membership.role,
      sessionId: sid,
    };
  }

  /* ── private ──────────────────────────────────────────────────── */

  private async signupOwner(email: string, displayName: string, passwordHash: string): Promise<AuthOperationResult> {
    return this.transaction(async (repos) => {
      const user = await repos.user.create({ email, passwordHash, displayName });
      const household = await repos.household.create({
        name: `Keluarga ${displayName}`,
        ownerUserId: user.id,
      });
      const membership = await repos.membership.create({
        householdId: household.id,
        userId: user.id,
        role: "OWNER",
        status: "APPROVED",
        invitedByUserId: null,
        inviteId: null,
        requestedAt: null,
      });
      await repos.membershipEvent.append({
        membershipId: membership.id,
        householdId: household.id,
        actorUserId: user.id,
        eventType: "APPROVED",
        previousStatus: null,
        nextStatus: "APPROVED",
      });
      const sessionId = await this.createSession(repos, user.id);
      return {
        state: this.stateFor({ id: user.id, email, displayName }, household, membership),
        sessionId,
      };
    });
  }

  private async signupWithInvite(
    email: string,
    displayName: string,
    passwordHash: string,
    inviteCode: string,
  ): Promise<AuthOperationResult> {
    return this.transaction(async (repos) => {
      const invite = await repos.invite.findByCodeHash(this.sha256(inviteCode));
      if (
        !invite ||
        invite.redeemedAt !== null ||
        invite.revokedAt !== null ||
        invite.expiresAt.getTime() <= Date.now()
      ) {
        throw badRequest(INVALID_INVITE.code, INVALID_INVITE.message);
      }

      const user = await repos.user.create({ email, passwordHash, displayName });

      // Anti-race conditional update; rowcount 0 means someone else redeemed it.
      const rowcount = await repos.invite.redeemConditional(invite.id, user.id);
      if (rowcount !== 1) throw badRequest(INVALID_INVITE.code, INVALID_INVITE.message);

      const membership = await repos.membership.create({
        householdId: invite.householdId,
        userId: user.id,
        role: "MEMBER",
        status: "PENDING",
        invitedByUserId: invite.createdByUserId,
        inviteId: invite.id,
        requestedAt: new Date(),
      });
      await repos.membershipEvent.append({
        membershipId: membership.id,
        householdId: invite.householdId,
        actorUserId: user.id,
        eventType: "REQUESTED",
        previousStatus: null,
        nextStatus: "PENDING",
      });

      const household = await repos.household.findById(invite.householdId);
      const sessionId = await this.createSession(repos, user.id);
      return {
        state: this.stateFor({ id: user.id, email, displayName }, household, membership),
        sessionId,
      };
    });
  }

  private async createSession(repos: AuthRepositories, userId: string): Promise<string> {
    const id = randomUUID();
    await repos.session.create({
      id,
      userId,
      tokenVersion: TOKEN_VERSION,
      expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
    });
    return id;
  }

  private stateFor(
    user: { id: string; email: string; displayName: string },
    household: { id: string; name: string } | null,
    membership: Pick<MembershipRecord, "role" | "status">,
  ): AuthStateDTO {
    const nextAction =
      membership.status === "APPROVED"
        ? "OPEN_HOME"
        : membership.status === "PENDING"
          ? "WAIT_FOR_APPROVAL"
          : "SIGN_IN_AGAIN";
    return {
      user,
      household: household ? { id: household.id, name: household.name } : null,
      role: membership.role,
      status: membership.status,
      nextAction,
    };
  }

  private sha256(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}
