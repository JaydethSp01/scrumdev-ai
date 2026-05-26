"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, MessageSquare } from "lucide-react";
import { useAuth } from "@/app/auth/_lib";
import { listProjects, type Project } from "@/lib/projects";
import EmptyState from "@/components/EmptyState";
import Spinner from "@/components/Spinner";

export default function ChatRedirectPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    if (ready && !user) {
      router.replace("/login");
      return;
    }
    if (ready && user) {
      let active = true;
      listProjects(user.user_id)
        .then((list) => {
          if (active) setProjects(list);
        })
        .catch(() => {
          if (active) setProjects([]);
        });
      return () => {
        active = false;
      };
    }
  }, [ready, user, router]);

  if (!ready || !user || projects === null) {
    return (
      <main className="min-h-[60vh] grid place-items-center">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid place-items-center w-10 h-10 rounded-lg bg-brand/10 text-brand">
          <MessageSquare size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Chat con agentes</h1>
          <p className="text-sm text-neutral-500">
            Elige un proyecto para abrir su conversacion.
          </p>
        </div>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          title="Crea un proyecto primero"
          description="El chat esta organizado por proyecto. Crea uno desde la pestana Proyectos."
          action={
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition"
            >
              Ir a proyectos <ArrowRight size={14} />
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          {projects.map((p) => (
            <li key={p.key}>
              <Link
                href={`/projects/${encodeURIComponent(p.key)}`}
                className="flex items-center gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
              >
                <div className="grid place-items-center w-9 h-9 rounded-lg bg-brand/10 text-brand">
                  <MessageSquare size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs font-mono text-neutral-500">{p.key}</p>
                </div>
                <ArrowRight size={16} className="opacity-60" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
