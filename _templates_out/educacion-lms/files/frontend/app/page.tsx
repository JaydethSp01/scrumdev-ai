"use client";

import { AppShell } from '@/components/ui/AppShell';
import { MetricCard, Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { useEffect, useState } from 'react';
import { fetchCourses } from '@/lib/api';
import MOCK_COURSES from '@/lib/mock';

export default function Dashboard() {
  const [courses, setCourses] = useState(MOCK_COURSES);

  useEffect(() => {
    fetchCourses().then((data) => data?.length && setCourses(data));
  }, []);

  return (
    <AppShell items={NAV} title="Dashboard">
      <PageHeader title="Dashboard" subtitle="Resumen de la plataforma" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard 
          label="Cursos" 
          value={courses.length} 
          hint="Total de cursos disponibles" 
          className="rounded-xl shadow-md p-4 bg-white dark:bg-gray-800"
        />
        {/* Otras tarjetas métricas */}
      </div>
      <Card className="mt-6 p-4 rounded-xl shadow-lg bg-white dark:bg-gray-900">
        <DataTable
          columns={columns}
          rows={courses}
          className="w-full"
        />
      </Card>
    </AppShell>
  );
}

const NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/cursos', label: 'Cursos' },
  { href: '/lecciones', label: 'Lecciones' },
  { href: '/estudiantes', label: 'Estudiantes' },
  { href: '/progreso', label: 'Progreso' },
  { href: '/certificados', label: 'Certificados' }
];

const columns = [
  { key: 'title', header: 'Título', align: 'left' },
  { key: 'description', header: 'Descripción', align: 'left' },
  // Añadir más columnas según sea necesario
];