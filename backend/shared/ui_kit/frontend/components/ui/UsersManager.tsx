"use client";
import { useEffect, useState } from "react";
import {
  getUsers, getRoles, createUser, deleteUser, createRole,
  currentUser, isSuperadmin, type User, type Role,
} from "@/lib/auth";

/** Gestión de usuarios y roles (solo superadmin/admin). Permite crear usuarios,
 *  asignarles rol, eliminarlos y crear nuevos roles. Persistencia en cliente. */
export function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "viewer" });
  const [roleForm, setRoleForm] = useState({ name: "", permissions: "read" });

  function refresh() {
    setUsers(getUsers());
    setRoles(getRoles());
  }
  useEffect(() => {
    setAllowed(isSuperadmin());
    refresh();
  }, []);

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        Solo un <strong>superadmin/administrador</strong> puede gestionar usuarios y roles.
        {currentUser() ? null : " Inicia sesión."}
      </div>
    );
  }

  function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) return;
    createUser({ ...form, active: true });
    setForm({ name: "", email: "", password: "", role: "viewer" });
    refresh();
  }
  function addRole(e: React.FormEvent) {
    e.preventDefault();
    if (!roleForm.name) return;
    createRole(roleForm.name, roleForm.permissions.split(",").map((s) => s.trim()).filter(Boolean));
    setRoleForm({ name: "", permissions: "read" });
    refresh();
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* alta de usuario */}
        <form onSubmit={addUser} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Crear usuario</h3>
          <input aria-label="Nombre" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none"
            placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input aria-label="Correo" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none"
            placeholder="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input aria-label="Contraseña" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none"
            placeholder="Contraseña" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select aria-label="Rol" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none"
            value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 cursor-pointer">Agregar usuario</button>
        </form>

        {/* alta de rol */}
        <form onSubmit={addRole} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Crear rol</h3>
          <input aria-label="Nombre del rol" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none"
            placeholder="Nombre del rol" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
          <input aria-label="Permisos separados por coma" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 outline-none"
            placeholder="Permisos (coma): read, write" value={roleForm.permissions} onChange={(e) => setRoleForm({ ...roleForm, permissions: e.target.value })} />
          <button className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Agregar rol</button>
          <div className="pt-2 text-xs text-slate-500">
            Roles: {roles.map((r) => r.name).join(", ")}
          </div>
        </form>

        {/* resumen */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Resumen</h3>
          <p className="mt-3 text-3xl font-bold text-brand">{users.length}</p>
          <p className="text-sm text-slate-500">usuarios</p>
          <p className="mt-3 text-3xl font-bold text-brand">{roles.length}</p>
          <p className="text-sm text-slate-500">roles</p>
        </div>
      </div>

      {/* tabla de usuarios */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Correo</th>
              <th className="px-4 py-3 font-semibold">Rol</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{u.name || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium capitalize text-brand">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.role === "superadmin" ? (
                    <span className="text-xs text-slate-400">protegido</span>
                  ) : (
                    <button onClick={() => { deleteUser(u.id); refresh(); }}
                      className="text-xs font-medium text-rose-600 hover:underline cursor-pointer">Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UsersManager;
