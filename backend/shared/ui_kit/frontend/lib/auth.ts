// Auth de cliente (localStorage) con superadmin sembrado por defecto.
// Pensado para apps generadas/desplegadas como frontend estático: permite
// demostrar login + manejo de roles + gestión de usuarios SIN backend.
// (En producción real, este store se reemplaza por llamadas al API.)

export type Role = { id: string; name: string; permissions: string[] };
export type User = { id: string; name: string; email: string; password: string; role: string; active: boolean };

const USERS_KEY = "sd_users";
const ROLES_KEY = "sd_roles";
const SESSION_KEY = "sd_session";

// Credenciales del superadmin por defecto (se muestran en el login).
export const DEFAULT_ADMIN = { email: "admin@scrumdev.app", password: "Admin1234!" };

const SEED_ROLES: Role[] = [
  { id: "superadmin", name: "Superadmin", permissions: ["*"] },
  { id: "admin", name: "Administrador", permissions: ["read", "write", "manage_users"] },
  { id: "editor", name: "Editor", permissions: ["read", "write"] },
  { id: "viewer", name: "Lector", permissions: ["read"] },
];

const SEED_USERS: User[] = [
  { id: "u_admin", name: "Super Admin", email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password, role: "superadmin", active: true },
];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Siembra superadmin + roles la primera vez. Idempotente. */
export function seedAuth() {
  if (typeof window === "undefined") return;
  if (!window.localStorage.getItem(ROLES_KEY)) write(ROLES_KEY, SEED_ROLES);
  if (!window.localStorage.getItem(USERS_KEY)) write(USERS_KEY, SEED_USERS);
}

export function getRoles(): Role[] {
  return read<Role[]>(ROLES_KEY, SEED_ROLES);
}
export function getUsers(): User[] {
  return read<User[]>(USERS_KEY, SEED_USERS);
}
export function saveUsers(users: User[]) {
  write(USERS_KEY, users);
}
export function saveRoles(roles: Role[]) {
  write(ROLES_KEY, roles);
}

export function login(email: string, password: string): User | null {
  seedAuth();
  const u = getUsers().find(
    (x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password && x.active
  );
  if (u) {
    write(SESSION_KEY, { id: u.id, email: u.email, name: u.name, role: u.role });
    return u;
  }
  return null;
}
export function logout() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
}
export type Session = { id: string; email: string; name: string; role: string } | null;
export function currentUser(): Session {
  return read<Session>(SESSION_KEY, null);
}
export function isSuperadmin(): boolean {
  const s = currentUser();
  return !!s && (s.role === "superadmin" || s.role === "admin");
}

export function createUser(u: Omit<User, "id">): User {
  const users = getUsers();
  const nu: User = { ...u, id: "u_" + Math.random().toString(36).slice(2, 9) };
  users.push(nu);
  saveUsers(users);
  return nu;
}
export function deleteUser(id: string) {
  saveUsers(getUsers().filter((u) => u.id !== id));
}
export function createRole(name: string, permissions: string[]): Role {
  const roles = getRoles();
  const r: Role = { id: name.toLowerCase().replace(/\s+/g, "_"), name, permissions };
  roles.push(r);
  saveRoles(roles);
  return r;
}
