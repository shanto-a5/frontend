/**
 * Company endpoints (M4). All role and tenant decisions are made server-side;
 * this module is only a typed surface over the shared client.
 */

import { api, ApiError } from "./client";
import type { Company, CompanyMember, CurrentCompany, Membership, PublicUser } from "./types";

export interface CreateCompanyInput {
  name: string;
  timezone?: string;
}

/** 201 → { company, membership }; 409 when the user already has a company. */
export async function createCompany(input: CreateCompanyInput): Promise<CurrentCompany> {
  return api.post<CurrentCompany>("/companies", input);
}

/**
 * The caller's company + membership, or null when they have none yet.
 * "No company" is not an error the UI should surface — it routes to onboarding.
 */
export async function getCurrentCompany(): Promise<CurrentCompany | null> {
  try {
    return await api.get<CurrentCompany>("/companies/current");
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

/** Join via code. 404 for an unknown/wrong code (identical answers by design). */
export async function joinCompany(code: string): Promise<CurrentCompany> {
  return api.post<CurrentCompany>("/companies/join", { code });
}

/** Boss-only: rotate the join code; returns the freshly minted plaintext code. */
export async function rotateJoinCode(): Promise<{ joinCode: string }> {
  return api.patch<{ joinCode: string }>("/companies/current/join-code");
}

/** Boss-only, bodyless, idempotent: add the employee role to the caller. */
export async function activateEmployeeRole(): Promise<{
  membership: Membership;
  user: PublicUser;
  activated: boolean;
}> {
  return api.post<{ membership: Membership; user: PublicUser; activated: boolean }>(
    "/companies/current/employee-role",
  );
}

/** Boss-only: grant the boss role to an active member. */
export async function transferBoss(memberUserId: string): Promise<{ membership: Membership }> {
  return api.post<{ membership: Membership }>("/companies/transfer", { memberUserId });
}

/** Boss-only team list. */
export async function listMembers(): Promise<{ members: CompanyMember[] }> {
  return api.get<{ members: CompanyMember[] }>("/companies/members");
}

/** Boss-only offboard. 409 when it would remove the last boss. */
export async function offboardMember(membershipId: string): Promise<{ removed: true }> {
  return api.delete<{ removed: true }>(`/companies/members/${membershipId}`);
}

export type { Company, CompanyMember, CurrentCompany, Membership };
