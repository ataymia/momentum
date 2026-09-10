import type { Role, Team, WorkspaceData, WorkspaceUser } from "./types";

export type ProvisionableRole = Exclude<Role, "Administrator" | "Customer">;
export type ProvisionInternalUserInput = {
  name: string;
  email: string;
  title: string;
  role: ProvisionableRole;
  team: Exclude<Team, "Customer">;
  managerId: string;
};

const expectedTeam: Record<ProvisionableRole, Exclude<Team, "Customer">> = {
  "Sales Manager": "Sales",
  "Sales Representative": "Sales",
  Operations: "Operations",
  Warehouse: "Operations",
};

export function validateInternalUserProvisioning(data: WorkspaceData, input: ProvisionInternalUserInput) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const title = input.title.trim();
  if (name.length < 2) return "Employee name is required.";
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) return "A valid work email is required.";
  if (data.users.some((user) => user.email.toLowerCase() === email)) return "That work email already belongs to another account.";
  if (title.length < 2) return "Job title is required.";
  if (input.team !== expectedTeam[input.role]) return `${input.role} must be assigned to the ${expectedTeam[input.role]} department in the current role model.`;
  const manager = data.users.find((user) => user.id === input.managerId && user.role !== "Customer");
  if (!manager) return "Choose a valid manager.";
  if (input.role === "Sales Manager" && manager.role !== "Administrator") return "A Sales Manager must report to an Administrator in the current hierarchy.";
  if (input.role === "Sales Representative" && !["Administrator", "Sales Manager"].includes(manager.role)) return "A Sales Representative must report to an Administrator or Sales Manager.";
  if (["Operations", "Warehouse"].includes(input.role) && manager.role !== "Administrator") return `${input.role} must report to an Administrator until an operations-manager role is formally configured.`;
  return null;
}

export function buildProvisionedWorkspaceUser(data: WorkspaceData, input: ProvisionInternalUserInput, userId: string): WorkspaceUser {
  const error = validateInternalUserProvisioning(data, input);
  if (error) throw new Error(error);
  const name = input.name.trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
  return {
    id: userId,
    name,
    firstName: parts[0],
    email: input.email.trim().toLowerCase(),
    initials,
    title: input.title.trim(),
    role: input.role,
    team: input.team,
    managerId: input.managerId,
    managedTeams: input.role === "Sales Manager" ? ["Sales"] : undefined,
    accent: "#53657d",
  };
}

export function managerOptionsForProvisioning(data: WorkspaceData, role: ProvisionableRole) {
  if (role === "Sales Representative") return data.users.filter((user) => ["Administrator", "Sales Manager"].includes(user.role));
  return data.users.filter((user) => user.role === "Administrator");
}
